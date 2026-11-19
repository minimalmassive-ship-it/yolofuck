import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAuth } from './supabase';

function isJwtUnexpired(token?: string | null, leewaySeconds = 20): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return false;
  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const payload = JSON.parse(atob(base64)) as { exp?: number };
    return typeof payload?.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000) + leewaySeconds;
  } catch {
    return false;
  }
}

export async function getPlasticinAuthHeaders(includeJsonContentType = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = includeJsonContentType
    ? { 'Content-Type': 'application/json' }
    : {};
  try {
    const { data } = await supabaseAuth.auth.getSession();
    let session = data?.session ?? null;
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
      const { data: refreshed } = await supabaseAuth.auth.refreshSession();
      if (refreshed?.session) session = refreshed.session;
    }
    if (session?.access_token && isJwtUnexpired(session.access_token, 10)) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
      return headers;
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      const oidcCandidates = [
        sessionStorage.getItem('plasticin_oidc_access_token'),
        localStorage.getItem('plasticin_oidc_access_token'),
      ];
      const validOidc = oidcCandidates.find((t) => isJwtUnexpired(t, 20));
      if (validOidc) {
        headers['Authorization'] = `Bearer ${validOidc.trim()}`;
        return headers;
      }
    }
  } catch {}
  try {
    const { data: dataSess } = await supabase.auth.getSession();
    let dSession = dataSess?.session ?? null;
    if (dSession?.expires_at && dSession.expires_at * 1000 < Date.now() + 30000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) dSession = refreshed.session;
    }
    if (dSession?.access_token && isJwtUnexpired(dSession.access_token, 10)) {
      headers['Authorization'] = `Bearer ${dSession.access_token}`;
    }
  } catch {}
  return headers;
}

export const PlasticinSupabaseUrl = 'https://igrxuwvlnpthvrbfhlpu.supabase.co';
export const PlasticinSupabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlncnh1d3ZsbnB0aHZyYmZobHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MjEwNTcsImV4cCI6MjExMDA5NzA1N30.aRwxqgP_oS92a-TK_ov-F0kDhA_FyQitarhytGXzKvE';

export const PlasticinDirectorySyncUrl = 'https://plasticin.com/api/directory/sync';
export const PlasticinChatHubUrl = 'https://plasticin.com/api/chat/hub';

export const PrimaryPlasticinOrgId = 'org_singularity';
export const PrimaryIdeaniteGroupId = '7b595de8-80f7-4c9d-bf08-52a083b76074';
export const PlatformPlasticinOrgId = 'org_plst_platform_operations';

export const PrimaryCustomerOrgAliases = new Set<string>([
  'org_singularity',
  'org_ce176ed9b496665a',
  '7b595de8-80f7-4c9d-bf08-52a083b76074',
]);

const UuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UuidRegex.test(value.trim());
}

export function filterValidUuids(values: unknown[]): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const val of values) {
    if (isValidUuid(val)) {
      const trimmed = val.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        valid.push(trimmed);
      }
    }
  }
  return valid;
}

export function sanitizeOrgName(raw: unknown, fallback = 'Organization'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[<>]/g, '').trim().slice(0, 60);
  return cleaned || fallback;
}

export function sanitizeOrgDescription(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').trim().slice(0, 200);
}

export function sanitizeDisplayText(raw: unknown, maxLen = 4000): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

export function sanitizeSafeUrl(rawUrl: unknown, allowImageDataUri = false): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (allowImageDataUri && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'blob:') {
      return parsed.href;
    }
  } catch {
    // Invalid URL
  }
  return '';
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  const msg = String((err as { message?: string }).message || '').toLowerCase();
  return name === 'AbortError' || msg.includes('abort');
}

export function resolveCanonicalPlasticinOrgId(rawId?: string | null): string {
  const trimmed = typeof rawId === 'string' ? rawId.trim() : '';
  if (!trimmed) return PrimaryPlasticinOrgId;
  const lower = trimmed.toLowerCase();
  if (lower === 'personal') return 'personal';
  if (PrimaryCustomerOrgAliases.has(lower)) {
    return PrimaryPlasticinOrgId;
  }
  if (lower === PlatformPlasticinOrgId || lower === 'org_plasticin' || lower === 'plasticin') {
    return PlatformPlasticinOrgId;
  }
  return trimmed;
}

export const resolveCanonicalOrgId = resolveCanonicalPlasticinOrgId;

export function isPrimaryCustomerOrgId(rawId?: string | null): boolean {
  if (!rawId || typeof rawId !== 'string') return false;
  return PrimaryCustomerOrgAliases.has(rawId.trim().toLowerCase());
}

export function isPlatformOrgId(rawId?: string | null): boolean {
  if (!rawId || typeof rawId !== 'string') return false;
  const lower = rawId.trim().toLowerCase();
  return lower === PlatformPlasticinOrgId || lower === 'org_plasticin' || lower === 'plasticin';
}

export function isSameOrgEntity(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  return resolveCanonicalPlasticinOrgId(a) === resolveCanonicalPlasticinOrgId(b);
}

export function isManagementAliasId(rawId?: string | null): boolean {
  if (!rawId || typeof rawId !== 'string') return false;
  const trimmed = rawId.trim().toLowerCase();
  return (
    trimmed === 'team_mgmt_singularity' ||
    trimmed === 'team_mgmt_plasticin' ||
    trimmed === 'team_plst_mgmt' ||
    trimmed === 'singularity-management' ||
    trimmed === 'plasticin-management' ||
    /^team_[a-z0-9-]+_mgmt$/i.test(trimmed) ||
    /^mgmt_/i.test(trimmed)
  );
}

export function resolveCanonicalRoomId(rawRoomId?: string | null, orgId = PrimaryPlasticinOrgId): string {
  const canonicalOrgId = orgId === 'personal' ? PrimaryPlasticinOrgId : resolveCanonicalPlasticinOrgId(orgId);
  if (!rawRoomId) return `room_${canonicalOrgId}_mgmt`;
  const str = String(rawRoomId).trim();

  if (str.startsWith('dm_')) return str;

  if (str.startsWith('room_')) {
    const rest = str.slice(5);
    for (const alias of PrimaryCustomerOrgAliases) {
      const prefix = `${alias}_`;
      if (rest.toLowerCase().startsWith(prefix)) {
        return `room_${PrimaryPlasticinOrgId}_${rest.slice(prefix.length)}`;
      }
    }
    return str;
  }

  if (
    str === 'mgmt' ||
    str === 'singularity_mgmt' ||
    str === 'plasticin_mgmt' ||
    str === 'team_mgmt_singularity' ||
    str === 'team_mgmt_plasticin' ||
    str.endsWith('_mgmt')
  ) {
    return `room_${canonicalOrgId}_mgmt`;
  }

  const cleanId = str.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (
    cleanId === 'nc-835-bva' ||
    cleanId === 'team-nc-bva-ads' ||
    cleanId === 'team_nc_bva_ads' ||
    cleanId === 'nc-835-bva-ads' ||
    cleanId.includes('835') ||
    cleanId.includes('bva')
  ) {
    return `room_${canonicalOrgId}_nc-835-bva`;
  }
  if (
    cleanId === 'valentine-binder' ||
    cleanId === 'team-vb-nancat' ||
    cleanId === 'team_vb_nancat' ||
    cleanId.includes('valentine')
  ) {
    return `room_${canonicalOrgId}_valentine-binder`;
  }
  return `room_${canonicalOrgId}_${cleanId}`;
}

let cachedPlasticinClient: SupabaseClient | null = null;

export function getPlasticinRealtimeClient(): SupabaseClient {
  if (!cachedPlasticinClient) {
    cachedPlasticinClient = createClient(PlasticinSupabaseUrl, PlasticinSupabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 15 } },
    });
  }
  return cachedPlasticinClient;
}

export interface PlasticinDirectoryOrg {
  id: string;
  name: string;
  slug?: string;
  domain?: string;
  description?: string;
  planTier?: string;
  isPlatformOwned?: boolean;
  role?: string;
  is_personal?: boolean;
}

export interface PlasticinDirectoryTeam {
  id: string;
  organizationId: string;
  name: string;
  slug?: string;
  description?: string;
  appTarget?: string;
  isManagement?: boolean;
}

export interface PlasticinDirectoryMember {
  id: string;
  email?: string;
  username?: string;
  displayName?: string;
  role: string;
}

export async function fetchPlasticinOrganizations(signal?: AbortSignal): Promise<PlasticinDirectoryOrg[]> {
  try {
    const headers = await getPlasticinAuthHeaders(false);
    if (!headers['Authorization']) return [];
    const res = await fetch(`${PlasticinDirectorySyncUrl}?action=organizations`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.organizations)) return [];
    return data.organizations.map((org: Record<string, unknown>) => {
      const cId = resolveCanonicalPlasticinOrgId(typeof org.id === 'string' ? org.id : '');
      const isPlatform = cId === PlatformPlasticinOrgId;
      const rawName = sanitizeOrgName(org.name, isPlatform ? 'Plasticin' : 'Organization');
      const safeSlug = sanitizeDisplayText(org.slug, 60);
      return {
        id: cId,
        name: !isPlatform && rawName === 'Plasticin' ? sanitizeOrgName(safeSlug, 'Organization') : rawName,
        slug: safeSlug || undefined,
        domain: sanitizeDisplayText(org.domain, 120) || undefined,
        description: sanitizeOrgDescription(org.description),
        planTier: typeof org.planTier === 'string' ? org.planTier : undefined,
        isPlatformOwned: isPlatform,
      };
    });
  } catch (err) {
    if (isAbortError(err)) return [];
    console.warn('[EcosystemOrgSync] Failed to fetch Plasticin organizations:', err);
    return [];
  }
}

export async function fetchPlasticinDirectoryDetail(
  orgId: string,
  signal?: AbortSignal
): Promise<{
  organization: PlasticinDirectoryOrg | null;
  teams: PlasticinDirectoryTeam[];
  members: PlasticinDirectoryMember[];
}> {
  try {
    const canonicalOrgId = resolveCanonicalPlasticinOrgId(orgId);
    const headers = await getPlasticinAuthHeaders(false);
    const res = await fetch(`${PlasticinDirectorySyncUrl}?orgId=${encodeURIComponent(canonicalOrgId)}`, {
      credentials: 'include',
      cache: 'no-store',
      headers,
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return { organization: null, teams: [], members: [] };
    const data = await res.json();
    const org = data?.organization
      ? {
          id: resolveCanonicalPlasticinOrgId(data.organization.id || canonicalOrgId),
          name: sanitizeOrgName(
            data.organization.name,
            canonicalOrgId === PlatformPlasticinOrgId ? 'Plasticin' : 'Organization'
          ),
          slug: sanitizeDisplayText(data.organization.slug, 60) || undefined,
          domain: sanitizeDisplayText(data.organization.domain, 120) || undefined,
          description: sanitizeOrgDescription(data.organization.description),
          planTier: data.organization.planTier,
          isPlatformOwned: canonicalOrgId === PlatformPlasticinOrgId,
        }
      : null;
    const teams = Array.isArray(data?.teams)
      ? data.teams.map((t: Record<string, unknown>) => ({
          id: String(t.id || ''),
          organizationId: resolveCanonicalPlasticinOrgId(
            typeof t.organizationId === 'string' ? t.organizationId : canonicalOrgId
          ),
          name: sanitizeOrgName(t.name, 'Workspace'),
          slug: sanitizeDisplayText(t.slug, 60) || undefined,
          description: sanitizeOrgDescription(t.description),
          appTarget: typeof t.appTarget === 'string' ? t.appTarget : undefined,
          isManagement: Boolean(t.isManagement),
        }))
      : [];
    const members = Array.isArray(data?.members) ? data.members : [];
    return { organization: org, teams, members };
  } catch (err) {
    if (isAbortError(err)) return { organization: null, teams: [], members: [] };
    console.warn('[EcosystemOrgSync] Failed to fetch directory detail:', err);
    return { organization: null, teams: [], members: [] };
  }
}

export async function publishOrganizationUpdateToEcosystem(params: {
  orgId: string;
  name: string;
  description?: string;
  slug?: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; organization?: PlasticinDirectoryOrg; error?: string }> {
  const canonicalId = resolveCanonicalPlasticinOrgId(params.orgId);
  if (canonicalId === PlatformPlasticinOrgId) {
    return { ok: false, error: 'Root platform organization cannot be renamed.' };
  }
  if (canonicalId === 'personal') {
    return { ok: false, error: 'Personal workspace does not support organization settings.' };
  }

  const cleanName = sanitizeOrgName(params.name, '');
  if (cleanName.length < 2 || cleanName.length > 60) {
    return { ok: false, error: 'Organization name must be between 2 and 60 characters.' };
  }
  if (cleanName.toLowerCase() === 'plasticin') {
    return { ok: false, error: 'The name "Plasticin" is reserved for the root platform organization.' };
  }

  const cleanDesc = sanitizeOrgDescription(params.description ?? '');

  try {
    const headers = await getPlasticinAuthHeaders(true);
    const res = await fetch(PlasticinDirectorySyncUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        orgId: canonicalId,
        name: cleanName,
        description: cleanDesc,
        ...(params.slug ? { slug: params.slug } : {}),
      }),
      ...(params.signal ? { signal: params.signal } : {}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      return {
        ok: false,
        error: sanitizeDisplayText(data?.error || `HTTP ${res.status}`, 240),
      };
    }

    const broadcastPayload = {
      id: canonicalId,
      canonicalId,
      ideaniteGroupId: canonicalId === PrimaryPlasticinOrgId ? PrimaryIdeaniteGroupId : canonicalId,
      name: cleanName,
      description: cleanDesc,
      slug: data?.organization?.slug || params.slug,
    };

    try {
      const rtClient = getPlasticinRealtimeClient();
      const channel = rtClient.channel('ecosystem-org-sync');
      const anyChannel = channel as unknown as {
        httpSend?: (event: string, payload: unknown) => Promise<unknown>;
      };
      if (typeof anyChannel.httpSend === 'function') {
        anyChannel.httpSend('ORGANIZATION_UPDATED', broadcastPayload).catch(() => {});
      } else {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel
              .send({
                type: 'broadcast',
                event: 'ORGANIZATION_UPDATED',
                payload: broadcastPayload,
              })
              .catch(() => {});
          }
        });
      }
    } catch (rtErr) {
      console.warn('[EcosystemOrgSync] Realtime broadcast warning:', rtErr);
    }

    return {
      ok: true,
      organization: data?.organization || broadcastPayload,
    };
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, error: 'Request aborted.' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error while saving organization settings.',
    };
  }
}

export interface OrgSyncHandlers {
  onOrganizationUpdated: (payload: { id: string; name: string; description?: string }) => void;
  onTeamsUpdated?: () => void;
}

const activeSubscribers = new Set<OrgSyncHandlers>();
let sharedSyncChannel: RealtimeChannel | null = null;

function ensureSharedSyncChannel(): void {
  if (sharedSyncChannel) return;
  const client = getPlasticinRealtimeClient();
  try {
    sharedSyncChannel = client
      .channel('ecosystem-org-sync')
      .on('broadcast', { event: 'ORGANIZATION_UPDATED' }, ({ payload }) => {
        if (!payload?.name) return;
        const cId = resolveCanonicalPlasticinOrgId(payload.canonicalId || payload.id);
        const cleanName = sanitizeOrgName(payload.name, '');
        if (!cleanName) return;
        if (cId !== PlatformPlasticinOrgId && cleanName === 'Plasticin') return;
        const cleanDesc =
          payload.description !== undefined ? sanitizeOrgDescription(payload.description) : undefined;
        activeSubscribers.forEach((sub) =>
          sub.onOrganizationUpdated({ id: cId, name: cleanName, description: cleanDesc })
        );
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'organizations' }, (payload) => {
        const row = payload?.new as { id?: string; name?: string; description?: string } | undefined;
        if (!row?.name) return;
        const cId = resolveCanonicalPlasticinOrgId(row.id);
        if (cId !== PlatformPlasticinOrgId && row.name === 'Plasticin') return;
        const cleanName = sanitizeOrgName(row.name, '');
        if (!cleanName) return;
        const cleanDesc =
          typeof row.description === 'string' ? sanitizeOrgDescription(row.description) : undefined;
        activeSubscribers.forEach((sub) =>
          sub.onOrganizationUpdated({ id: cId, name: cleanName, description: cleanDesc })
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_teams' }, () => {
        activeSubscribers.forEach((sub) => sub.onTeamsUpdated?.());
      })
      .subscribe();
  } catch (err) {
    console.warn('[EcosystemOrgSync] Subscribe warning:', err);
  }
}

export function subscribeToEcosystemOrgSync(handlers: OrgSyncHandlers): () => void {
  activeSubscribers.add(handlers);
  ensureSharedSyncChannel();

  return () => {
    activeSubscribers.delete(handlers);
    if (activeSubscribers.size === 0 && sharedSyncChannel) {
      try {
        getPlasticinRealtimeClient().removeChannel(sharedSyncChannel);
      } catch {
        // Ignore cleanup error
      }
      sharedSyncChannel = null;
    }
  };
}

export interface EcosystemActiveOrgPayload {
  id: string;
  name: string;
  is_personal?: boolean;
  sourceApp?: string;
}

export interface EcosystemWorkspaceItem {
  id: string;
  name: string;
  color?: string | null;
  is_public?: boolean;
}

export const CanonicalEcosystemOrgs: PlasticinDirectoryOrg[] = [
  {
    id: 'a1a1a1a1-ac1d-4000-8000-000000000001',
    name: 'acidplasticine',
    role: 'owner',
    is_personal: true,
  },
  {
    id: '7b595de8-80f7-4c9d-bf08-52a083b76074',
    name: 'Singularity XXL',
    role: 'owner',
    is_personal: false,
  },
  {
    id: '1f95e31d-909b-42b7-845b-d61329c038a8',
    name: 'Plasticin Enterprise',
    role: 'owner',
    is_personal: false,
  },
  {
    id: '397d899b-b317-45a6-910e-6c8f8d11e332',
    name: 'Plasticin Environment',
    role: 'owner',
    is_personal: false,
  },
  {
    id: 'ab7df93c-7a07-43ad-b7a0-581dcde113fc',
    name: 'Bydgosranie',
    role: 'owner',
    is_personal: false,
  },
];

export const DefaultWorkspacesByOrg: Record<string, EcosystemWorkspaceItem[]> = {
  'a1a1a1a1-ac1d-4000-8000-000000000001': [
    { id: 'ws_personal_yolo', name: 'Yolo' },
    { id: 'ws_personal_journal', name: 'Daily Logs' },
    { id: 'ws_personal_takes', name: 'Voice Notes' },
  ],
  '7b595de8-80f7-4c9d-bf08-52a083b76074': [
    { id: 'ws_singularity_valentine', name: 'Valentine Binder' },
    { id: 'ws_singularity_stories', name: 'Singularity Takes' },
  ],
  '1f95e31d-909b-42b7-845b-d61329c038a8': [
    { id: 'ws_enterprise_main', name: 'Enterprise Stories' },
    { id: 'ws_enterprise_compliance', name: 'Compliance Vault' },
  ],
  '397d899b-b317-45a6-910e-6c8f8d11e332': [
    { id: 'ws_env_green', name: 'Field Notes' },
  ],
  'ab7df93c-7a07-43ad-b7a0-581dcde113fc': [
    { id: 'ws_bydgosranie_local', name: 'Local Media' },
  ],
};

export function broadcastActiveOrgChange(payload: EcosystemActiveOrgPayload): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('plasticin_active_org_id', payload.id);
    localStorage.setItem('plasticin_active_org_name', payload.name);
    localStorage.setItem('memcut_active_org_id', payload.id);
    localStorage.setItem('memcut_active_org_name', payload.name);

    const bc = new BroadcastChannel('plasticin-ecosystem-sync');
    bc.postMessage({ type: 'ORGANIZATION_CHANGED', payload });
    bc.close();
  } catch (err) {
    console.warn('[EcosystemSync] Broadcast notice:', err);
  }
}

export function subscribeToActiveOrgSync(
  currentApp: string,
  onOrgChanged: (payload: EcosystemActiveOrgPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel('plasticin-ecosystem-sync');
    bc.onmessage = (event) => {
      if (event.data?.type === 'ORGANIZATION_CHANGED' && event.data.payload) {
        if (event.data.payload.sourceApp !== currentApp) {
          onOrgChanged(event.data.payload);
        }
      }
    };
  } catch {}

  const storageHandler = (e: StorageEvent) => {
    if ((e.key === 'plasticin_active_org_id' || e.key === 'memcut_active_org_id') && e.newValue) {
      const name = localStorage.getItem('plasticin_active_org_name') || localStorage.getItem('memcut_active_org_name') || 'Organization';
      onOrgChanged({
        id: e.newValue,
        name,
        sourceApp: 'storage_sync',
      });
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    if (bc) {
      try {
        bc.close();
      } catch {}
    }
    window.removeEventListener('storage', storageHandler);
  };
}
