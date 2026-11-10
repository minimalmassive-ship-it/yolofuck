/**
 * journalLocalStorage.ts v1.0.0
 *
 * Client-side IndexedDB storage engine for Journal video recordings.
 * Allows users to record video journals stored strictly on local device storage
 * without uploading to cloud storage. Works in PWA and maps directly to native device
 * storage workflows for future APK builds.
 */

export interface LocalJournalEntry {
    id: string;
    blob: Blob;
    durationMs: number;
    transcription?: string;
    title?: string;
    createdAt: string;
}

const DB_NAME = 'yolofuck_local_storage';
const STORE_NAME = 'journal_recordings';
const DB_VERSION = 1;

const LEGACY_DB_NAME = 'ideanite_local_storage';

function openDatabaseNamed(dbName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB is not supported on this browser/device.'));
            return;
        }

        const request = indexedDB.open(dbName, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error(`Failed to open ${dbName}.`));
    });
}

function openDatabase(): Promise<IDBDatabase> {
    return openDatabaseNamed(DB_NAME);
}

/**
 * Saves a journal recording blob to local device storage.
 * Returns the generated unique ID.
 */
export async function saveLocalJournalRecording(entry: {
    id?: string;
    blob: Blob;
    durationMs: number;
    transcription?: string;
    title?: string;
}): Promise<string> {
    const db = await openDatabase();
    const id = entry.id || `local_journal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullEntry: LocalJournalEntry = {
        id,
        blob: entry.blob,
        durationMs: entry.durationMs,
        transcription: entry.transcription || '',
        title: entry.title || `Journal Take ${new Date().toLocaleDateString()}`,
        createdAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(fullEntry);

        req.onsuccess = () => resolve(id);
        req.onerror = () => reject(req.error || new Error('Failed to save journal to local storage.'));
    });
}

/**
 * Retrieves a locally stored journal recording by ID (checks current and legacy db).
 */
export async function getLocalJournalRecording(id: string): Promise<LocalJournalEntry | null> {
    try {
        const db = await openDatabase();
        const entry = await new Promise<LocalJournalEntry | null>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
        if (entry) return entry;
    } catch {}

    try {
        const legacyDb = await openDatabaseNamed(LEGACY_DB_NAME);
        return new Promise((resolve) => {
            const tx = legacyDb.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function getEntriesFromDb(dbName: string): Promise<LocalJournalEntry[]> {
    try {
        const db = await openDatabaseNamed(dbName);
        return await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

/**
 * Lists all locally saved journal entries from both current and legacy IndexedDB databases.
 */
export async function getAllLocalJournalRecordings(): Promise<LocalJournalEntry[]> {
    const [currentList, legacyList] = await Promise.all([
        getEntriesFromDb(DB_NAME),
        getEntriesFromDb(LEGACY_DB_NAME),
    ]);

    const entryMap = new Map<string, LocalJournalEntry>();
    legacyList.forEach(item => entryMap.set(item.id, item));
    currentList.forEach(item => entryMap.set(item.id, item));

    const combined = Array.from(entryMap.values());
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return combined;
}

/**
 * Deletes a locally stored journal recording.
 */
export async function deleteLocalJournalRecording(id: string): Promise<void> {
    try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
    } catch {}

    try {
        const legacyDb = await openDatabaseNamed(LEGACY_DB_NAME);
        const txLegacy = legacyDb.transaction(STORE_NAME, 'readwrite');
        txLegacy.objectStore(STORE_NAME).delete(id);
    } catch {}
}

/**
 * Triggers a browser direct download for the video file to device storage.
 */
export function downloadLocalJournalRecording(blob: Blob, filename = `yolofuck_Journal_${Date.now()}.webm`): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 2000);
}
