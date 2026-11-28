import { get, set, del } from 'idb-keyval';

export interface LocalByokBundle {
  customApiKey: string;
  deepgramApiKey: string;
}

const VAULT_STORAGE_PREFIX = 'memcut_encrypted_byok_v1_';
const CRYPTO_KEY_IDB_PREFIX = 'memcut_byok_aes_key_v1_';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function getOrCreateDeviceKey(userId: string): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const keyId = `${CRYPTO_KEY_IDB_PREFIX}${userId}`;
  try {
    const existing = await get<CryptoKey>(keyId);
    if (existing) return existing;
    const generated = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await set(keyId, generated);
    return generated;
  } catch {
    return null;
  }
}

export async function saveLocalByokKeys(userId: string, bundle: LocalByokBundle): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;
  const vaultKey = `${VAULT_STORAGE_PREFIX}${userId}`;
  const cleanBundle: LocalByokBundle = {
    customApiKey: (bundle.customApiKey || '').trim(),
    deepgramApiKey: (bundle.deepgramApiKey || '').trim(),
  };

  if (!cleanBundle.customApiKey && !cleanBundle.deepgramApiKey) {
    window.localStorage.removeItem(vaultKey);
    return;
  }

  const cryptoKey = await getOrCreateDeviceKey(userId);
  if (!cryptoKey) {
    throw new Error('WebCrypto AES-GCM vault is unavailable in this browser context.');
  }

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(cleanBundle));
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoded
  );

  window.localStorage.setItem(
    vaultKey,
    JSON.stringify({
      v: 1,
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(cipherBuffer)),
    })
  );
}

export async function loadLocalByokKeys(userId: string): Promise<LocalByokBundle> {
  const empty: LocalByokBundle = { customApiKey: '', deepgramApiKey: '' };
  if (typeof window === 'undefined' || !userId) return empty;
  const raw = window.localStorage.getItem(`${VAULT_STORAGE_PREFIX}${userId}`);
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as { v?: number; iv?: string; ct?: string };
    if (!parsed?.iv || !parsed?.ct) return empty;
    const cryptoKey = await getOrCreateDeviceKey(userId);
    if (!cryptoKey) return empty;
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(parsed.iv) as BufferSource },
      cryptoKey,
      fromBase64(parsed.ct) as BufferSource
    );
    const decoded = JSON.parse(new TextDecoder().decode(plainBuffer)) as Partial<LocalByokBundle>;
    return {
      customApiKey: typeof decoded.customApiKey === 'string' ? decoded.customApiKey : '',
      deepgramApiKey: typeof decoded.deepgramApiKey === 'string' ? decoded.deepgramApiKey : '',
    };
  } catch {
    return empty;
  }
}

export async function purgeLocalByokKeys(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;
  window.localStorage.removeItem(`${VAULT_STORAGE_PREFIX}${userId}`);
  try {
    await del(`${CRYPTO_KEY_IDB_PREFIX}${userId}`);
  } catch {
    // Ignore IDB cleanup error
  }
}
