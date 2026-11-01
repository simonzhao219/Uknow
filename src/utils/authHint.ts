// 首繪提示 `uknow:auth-hint`（T1 auth-state-trust，e2e 契約見 e2e/conftest.py 的 seed_auth_hint）。
//
// 冷啟動時 /profile 還沒回來，頁首不知道該畫訪客版、頭像或「註冊中」的登出鈕。
// 這個鍵讓第一個 render 就能猜對：只存畫頁首需要的最小資料（首字、user id 前 8 碼、
// 漏斗下一步的種類），不存 email、isAdmin、手機。提示只是猜測——/profile 確認後
// 以確認結果為準；提示的寫入與清除歸 useAuthBootstrap（見 plan §2.2）。

import {
  type FunnelNextKind,
  funnelNextKind,
  isFirstTimeFunnel,
  nextFunnelRoute,
} from './registrationFlow';

export const AUTH_HINT_KEY = 'uknow:auth-hint';

export type AuthHintKind = 'member' | 'funnel';

export interface AuthHint {
  v: 1;
  kind: AuthHintKind;
  initial: string;
  uid8: string;
  next: FunnelNextKind | null;
  at: number;
}

export type AuthHintInput = Pick<AuthHint, 'kind' | 'initial' | 'uid8' | 'next'>;

const KINDS: readonly string[] = ['member', 'funnel'];
const NEXTS: readonly (string | null)[] = ['profile', 'checkout', 'result', null];
/** 升版前的殘留鍵：整份 profile（write-only，零讀者）與死鍵。 */
const LEGACY_KEYS = ['user', 'pendingSession'];

/** 沒傳 storage 時取 window.localStorage；取用本身會擲例外（隱私模式、iframe）時回 null。 */
function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function toUid8(id: string | null | undefined): string {
  return (id ?? '').slice(0, 8);
}

export function initialOf(name: string | null | undefined): string {
  return Array.from((name ?? '').trim())[0] ?? '';
}

function isAuthHint(x: unknown): x is AuthHint {
  if (!x || typeof x !== 'object') return false;
  const h = x as Record<string, unknown>;
  return (
    h.v === 1 &&
    KINDS.includes(h.kind as string) &&
    typeof h.initial === 'string' &&
    typeof h.uid8 === 'string' &&
    NEXTS.includes(h.next as string | null) &&
    typeof h.at === 'number'
  );
}

/** 讀提示；壞 JSON、未知版本或形狀 → 視同無提示並移除。 */
export function readAuthHint(storage?: Storage | null): AuthHint | null {
  const s = resolveStorage(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(AUTH_HINT_KEY);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (isAuthHint(parsed)) return parsed;
    s.removeItem(AUTH_HINT_KEY);
    return null;
  } catch {
    return null;
  }
}

export function writeAuthHint(
  input: AuthHintInput,
  storage?: Storage | null,
  now: number = Date.now(),
): void {
  const s = resolveStorage(storage);
  if (!s) return;
  const hint: AuthHint = {
    v: 1,
    kind: input.kind,
    initial: input.initial,
    uid8: input.uid8,
    next: input.kind === 'funnel' ? input.next : null,
    at: now,
  };
  try {
    s.setItem(AUTH_HINT_KEY, JSON.stringify(hint));
  } catch {
    // 配額用盡／隱私模式：提示只是首繪猜測，寫不進去等同無提示。
  }
}

export function clearAuthHint(storage?: Storage | null): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(AUTH_HINT_KEY);
  } catch {
    // 同上。
  }
}

/**
 * 啟動時讀一次提示。升版後第一次開站沒有提示、但有舊 `localStorage.user`（整份
 * profile）時，從它推出提示（既有登入者不閃訪客版）；舊鍵一律清掉。
 */
export function loadAuthHint(storage?: Storage | null): AuthHint | null {
  const s = resolveStorage(storage);
  if (!s) return null;
  let hint = readAuthHint(s);
  try {
    if (!hint) {
      const legacy = parseLegacyUser(s.getItem('user'));
      if (legacy) {
        const funnel = isFirstTimeFunnel(legacy);
        writeAuthHint(
          {
            kind: funnel ? 'funnel' : 'member',
            initial: initialOf(legacy.name),
            uid8: toUid8(legacy.id),
            next: funnel ? funnelNextKind(nextFunnelRoute(legacy)) : null,
          },
          s,
        );
        hint = readAuthHint(s);
      }
    }
    for (const key of LEGACY_KEYS) s.removeItem(key);
  } catch {
    // storage 不可用時沿用已讀到的提示（或無）。
  }
  return hint;
}

function parseLegacyUser(
  raw: string | null,
): ({ id: string; name?: string | null } & Record<string, any>) | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' && typeof p.id === 'string' && p.id ? p : null;
  } catch {
    return null;
  }
}
