// 登入狀態的單一來源（T1 auth-state-trust，plan §2.2、§2.5；T1-B 暫時性故障不登出 §2.3）。
//
// 冷啟動 getSession → /profile、onAuthStateChange、背景重驗（refreshUser）與 OTP／邀請
// 入口回灌（ingestProfile）全在這裡收斂成一個 reducer；首繪提示 `uknow:auth-hint`
// 的讀、寫、清也只在這裡（App 不持有提示 state）。副作用（導頁、清快取）由呼叫端
// 注入，這個 hook 可以 renderHook 單獨測。
//
// 不得 import '../App'：App import 本檔，反向依賴會循環（appShell.test 守衛）。

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  type AuthHint,
  type AuthHintKind,
  clearAuthHint,
  initialOf,
  loadAuthHint,
  readAuthHint,
  toUid8,
  writeAuthHint,
} from '../utils/authHint';
import { isRetryableAuthError } from '../utils/authErrors';
import type { AuthState } from '../utils/authView';
import { endInvalidSession as defaultEndInvalidSession } from '../utils/endInvalidSession';
import {
  type FetchProfileOptions,
  PROFILE_FETCH_TIMEOUT_MS,
  PROFILE_RETRY_TIMEOUT_MS,
  type ProfileFetchResult,
} from '../utils/fetchProfile';
import { type AttemptScheduler, createAttemptScheduler } from './authRetryScheduler';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import {
  funnelNextKind,
  isFirstTimeFunnel,
  isProfileComplete,
  nextFunnelRoute as nextFunnelRouteFor,
  shouldRedirectToCompleteProfile,
} from '../utils/registrationFlow';

type Session = { access_token?: string; user?: { id?: string } } | null;

export interface AuthBootstrapSupabase {
  auth: {
    getSession(): Promise<{ data: { session: Session }; error?: unknown }>;
    onAuthStateChange(cb: (event: string, session: Session) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signOut(opts?: { scope?: 'global' | 'local' | 'others' }): Promise<unknown>;
  };
}

export interface AuthBootstrapDeps {
  supabase: AuthBootstrapSupabase;
  fetchProfile: (token: string, opts: FetchProfileOptions) => Promise<ProfileFetchResult>;
  /** 清 fetchProfile 的 in-flight map（登出、換帳號後不得合併到舊 token 的請求）。 */
  clearInflight: () => void;
  /** SIGNED_OUT 事件的清理（快取、邀請 token、舊 storage 鍵）。提示由 hook 自己清。 */
  onSignedOut: () => void;
  /**
   * 已有帳號在線上時，偵測到另一個 uid 的 SIGNED_IN（重設信連結進站、分頁凍結漏收登出廣播）。
   * 清掉前一人的快取與本機狀態，但不清邀請 token（那是訪客帶進來的）。
   */
  onAccountSwitched?: () => void;
  /** 資料未齊且不在豁免路由時呼叫（App 實作為導去完善資料頁）。 */
  onIncompleteProfile: () => void;
  /** /profile 401／410 時的本機清理（預設 utils/endInvalidSession；注入以便測試）。 */
  endInvalidSession?: (opts: {
    auth: AuthBootstrapSupabase['auth'];
    storage?: Storage | null;
  }) => Promise<void>;
  getPathname?: () => string;
  storage?: Storage | null;
}

/**
 * none：冷啟動中；ok：/profile 確認；retrying：冷啟動首次暫時性失敗、自動重試排程中；
 * degraded：重試後仍失敗（停原頁、提示保留）；anomaly：/profile 404（帳號資料異常）；
 * signedOut：確認沒有有效 session（提示清除）。
 */
export type AuthOutcome = 'none' | 'ok' | 'retrying' | 'degraded' | 'anomaly' | 'signedOut';

export interface AuthBootstrap {
  user: any;
  setUser: (user: any) => void;
  authState: AuthState;
  outcome: AuthOutcome;
  /** 資料未齊（F1）的 profile；這時 user 維持 null，ProtectedRoute 照現況不放行。 */
  funnelProfile: any;
  isFunnel: boolean;
  nextFunnelRoute: string | null;
  hint: AuthHint | null;
  /** 提示的 uid 已與 session 比對相符（之前不外露首字：換帳號時首繪不閃前一人）。 */
  hintVerified: boolean;
  isLoadingUser: boolean;
  /** getSession() 例外或 10 秒內未 resolve（頁首改畫訪客版的安全出口，F4）。 */
  sessionStalled: boolean;
  refreshUser: () => Promise<any | null>;
  ingestProfile: (profile: any) => void;
  /** degraded 中的手動／事件重試在飛（T1-B）。 */
  isRetrying: boolean;
  /** degraded 後的重試又失敗。 */
  failedAgain: boolean;
  /** /profile 404：帳號資料異常（W4-11），session 保留、/login 顯示說明。 */
  authAnomaly: boolean;
  /** 手動重試（degraded callout 的「重試」）；在飛時不重複發。穩定 identity。 */
  retryAuth: () => Promise<void>;
}

interface State {
  authState: AuthState;
  outcome: AuthOutcome;
  user: any;
  funnelProfile: any;
  /** degraded 中手動／事件重試在飛（callout 不卸載、鈕 aria-disabled）。 */
  isRetrying: boolean;
  /** degraded 後的手動／事件重試又失敗（說明換成「仍無法連線」）。 */
  failedAgain: boolean;
}

type Action =
  | { type: 'start' }
  | { type: 'profile'; profile: any }
  | { type: 'transient' }
  | { type: 'retry' }
  | { type: 'missing' }
  | { type: 'signedOut' }
  | { type: 'setUser'; user: any };

const INITIAL: State = {
  authState: 'unknown',
  outcome: 'none',
  user: null,
  funnelProfile: null,
  isRetrying: false,
  failedAgain: false,
};

/**
 * 轉移表（T1-B plan §2.3）：
 * - start：新 uid（冷啟動、換帳號）→ unknown／none。
 * - transient：已有資料 → 不變；冷啟動首次（none）→ unknown／retrying（排自動重試）；
 *   自動重試失敗（retrying）→ degraded；degraded 中的重試失敗 → degraded＋failedAgain。
 * - retry：degraded 中手動／事件重試開始 → isRetrying（**不回 unknown**：callout 不卸載）。
 * - missing：/profile 404＝帳號資料異常（W4-11）→ anonymous／anomaly，不登出。
 * - profile／setUser／signedOut：現況；一律清 isRetrying。
 */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return INITIAL;
    // /profile 確認（冷啟動、ingestProfile）：資料未齊者只記 funnelProfile。
    case 'profile':
      return isProfileComplete(action.profile)
        ? { ...INITIAL, authState: 'authenticated', outcome: 'ok', user: action.profile }
        : { ...INITIAL, authState: 'authenticated', outcome: 'ok', funnelProfile: action.profile };
    case 'transient':
      // 已有資料時的暫時性錯誤不改狀態（stale-while-revalidate，總綱 §1.2B）。
      if (state.user || state.funnelProfile) return state;
      // 已有定論（登出、帳號異常、確認）時晚到的暫時性錯誤不翻案——例：auth-js 遇 refresh 429
      // 自己移除 session 並廣播 SIGNED_OUT，之後 getSession 回 null＋429（#488 審查）。
      if (state.outcome === 'signedOut' || state.outcome === 'anomaly' || state.outcome === 'ok') {
        return state;
      }
      if (state.outcome === 'none') return { ...state, authState: 'unknown', outcome: 'retrying' };
      return {
        ...state,
        authState: 'degraded',
        outcome: 'degraded',
        isRetrying: false,
        failedAgain: state.outcome === 'degraded',
      };
    case 'retry':
      return state.outcome === 'degraded' ? { ...state, isRetrying: true } : state;
    case 'missing':
      return { ...INITIAL, authState: 'anonymous', outcome: 'anomaly' };
    case 'signedOut':
      return { ...INITIAL, authState: 'anonymous', outcome: 'signedOut' };
    // 頁面直接 setUser（CompleteProfile、PaymentCheckout／Result、refreshUser）。
    // 與 'profile' 不對稱、刻意不分流資料完整度：資料未齊者經 isFirstTimeFunnel 的
    // profile gate 一樣算註冊中，頁首結果一致。
    // setUser(null) 只出現在登出路徑；提示由登出流程自己清。
    case 'setUser':
      return action.user
        ? { ...INITIAL, authState: 'authenticated', outcome: 'ok', user: action.user }
        : { ...state, authState: 'anonymous', user: null, funnelProfile: null, isRetrying: false };
  }
}

const SESSION_STALL_MS = 10_000;
/** 冷啟動首次暫時性失敗後，自動重試前的等待。 */
const AUTO_RETRY_DELAY_MS = 1_000;

const defaultPathname = () => (typeof window !== 'undefined' ? window.location.pathname : '/');

/** initial：冷啟動／新 uid；auto：首次失敗後的自動重試；manual：手動或事件重試。 */
type AttemptKind = 'initial' | 'auto' | 'manual';

export function useAuthBootstrap(deps: AuthBootstrapDeps): AuthBootstrap {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [hint, setHint] = useState<AuthHint | null>(() => loadAuthHint(deps.storage));
  const [sessionStalled, setSessionStalled] = useState(false);
  const [hintVerified, setHintVerified] = useState(false);

  // 注入值只在掛載時取一次（App 每次 render 傳新物件，不能讓 effect 重跑）。
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // generation：登出、換帳號時遞增；在飛的 /profile 回來時 generation 不同就丟棄，
  // 不會在登出後把人「復活」。
  const genRef = useRef(0);
  // 已載入或載入中的 uid：同 uid 的 SIGNED_IN 重播（分頁切回可見時 Supabase 會再廣播）不重打。
  // 暫時性失敗時**保留**（重試由 attempt 管），否則重播會再發一條不帶 ?retry=1 的請求。
  const uidRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const hintRef = useRef(hint);
  hintRef.current = hint;
  // 自動重試排程與在飛旗標的單一來源（authRetryScheduler）。
  const attemptRef = useRef<AttemptScheduler | null>(null);
  if (attemptRef.current === null) attemptRef.current = createAttemptScheduler();
  const attempt = attemptRef.current;
  // getSession 是 session 有無的唯一判定者：它沒有乾淨地回「無 session」之前，
  // INITIAL_SESSION(null) 不得搶先判 anonymous（初始化 refresh 暫時失敗時兩者都是 null）。
  const sessionCheckRef = useRef<'pending' | 'clean' | 'error'>('pending');

  const dropHint = useCallback(() => {
    clearAuthHint(depsRef.current.storage);
    hintRef.current = null;
    setHint(null);
  }, []);

  const endSession = useCallback(() => {
    genRef.current += 1;
    uidRef.current = null;
    attempt.reset();
    depsRef.current.clearInflight();
    dispatch({ type: 'signedOut' });
  }, [attempt]);

  const ingest = useCallback(
    (profile: any, redirectIfIncomplete: boolean) => {
      attempt.cancel();
      if (redirectIfIncomplete && !isProfileComplete(profile)) {
        const { getPathname = defaultPathname, onIncompleteProfile } = depsRef.current;
        if (shouldRedirectToCompleteProfile(getPathname())) onIncompleteProfile();
      }
      dispatch({ type: 'profile', profile });
    },
    [attempt],
  );

  // 最近一次 render 的 outcome（onTransient 判斷是否已有定論、不再排重試）。
  const outcomeRef = useRef(state.outcome);
  outcomeRef.current = state.outcome;

  // 重試入口（自動、手動、事件共用）。宣告在 load／begin 之前，以 ref 互相引用。
  const retryEnteringRef = useRef(false);
  const retryRef = useRef<(kind: 'auto' | 'manual') => Promise<void>>(async () => {});

  /** 暫時性失敗：冷啟動首次才排一次自動重試，其餘交給 reducer 進 degraded。 */
  const onTransient = useCallback(
    (kind: AttemptKind) => {
      dispatch({ type: 'transient' });
      const settled = outcomeRef.current;
      if (settled === 'signedOut' || settled === 'anomaly' || settled === 'ok') return;
      if (kind === 'initial') {
        attempt.schedule(() => void retryRef.current('auto'), AUTO_RETRY_DELAY_MS);
      }
    },
    [attempt],
  );

  const load = useCallback(
    async (token: string, uid: string, kind: AttemptKind) => {
      const gen = genRef.current;
      const retry = kind !== 'initial';
      attempt.begin();
      let result: ProfileFetchResult;
      try {
        result = await depsRef.current.fetchProfile(token, {
          userId: uid,
          ...(retry
            ? { retry: true, timeoutMs: PROFILE_RETRY_TIMEOUT_MS }
            : { timeoutMs: PROFILE_FETCH_TIMEOUT_MS }),
        });
      } finally {
        if (gen === genRef.current) attempt.end();
      }
      if (!mountedRef.current || gen !== genRef.current) return;

      switch (result.kind) {
        case 'ok':
          ingest(result.profile, true);
          break;
        // 401／410：session 真的無效 → 本機清理（W4-13），不撤銷其他裝置。
        case 'unauthorized': {
          const {
            supabase,
            storage,
            endInvalidSession = defaultEndInvalidSession,
          } = depsRef.current;
          endSession();
          await endInvalidSession({ auth: supabase.auth, storage });
          break;
        }
        // 404：帳號資料異常（W4-11）→ 不登出、保留 uid（重播不重打），由 /login 顯示說明。
        case 'missing':
          attempt.reset();
          dispatch({ type: 'missing' });
          break;
        case 'transient':
          onTransient(kind);
          break;
        default:
          result satisfies never;
      }
    },
    [attempt, endSession, ingest, onTransient],
  );

  /** 拿到 session：新 uid 才（重新）判定；提示屬於別人就立即清（S11）。 */
  const begin = useCallback(
    (session: Session, kind: AttemptKind = 'initial') => {
      const token = session?.access_token;
      const uid = session?.user?.id;
      if (!token || !uid) return;
      if (uid === uidRef.current) return;

      const current = hintRef.current;
      if (current && current.uid8 !== toUid8(uid)) {
        dropHint();
        setHintVerified(false);
      } else if (current) {
        setHintVerified(true);
      }
      const switching = uidRef.current !== null;
      if (switching) {
        genRef.current += 1;
        attempt.reset();
        depsRef.current.clearInflight();
        depsRef.current.onAccountSwitched?.();
      }
      uidRef.current = uid;
      // 重試途中第一次拿到 session（R3b）時不回 INITIAL：degraded 的 callout 要留著。
      if (kind === 'initial' || switching) dispatch({ type: 'start' });
      void load(token, uid, switching ? 'initial' : kind);
    },
    [attempt, dropHint, load],
  );

  retryRef.current = async (kind: 'auto' | 'manual') => {
    // 進入即擋（不等 load 內的 attempt.begin）：同一瞬間的 online＋visibilitychange 只發一個請求。
    if (attempt.inFlight || retryEnteringRef.current) return;
    retryEnteringRef.current = true;
    try {
      await retryOnce(kind);
    } finally {
      retryEnteringRef.current = false;
    }
  };

  const retryOnce = async (kind: 'auto' | 'manual') => {
    attempt.cancel();
    if (kind === 'manual') dispatch({ type: 'retry' });
    const gen = genRef.current;
    let res: { data: { session: Session }; error?: unknown } | 'timeout';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // auth-js 的 refresh 卡住時 getSession 不會回來——設上限，否則重試永遠停在進行中（#488 審查）。
      res = await Promise.race([
        depsRef.current.supabase.auth.getSession(),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), PROFILE_RETRY_TIMEOUT_MS);
        }),
      ]);
    } catch {
      if (mountedRef.current && gen === genRef.current) onTransient(kind);
      return;
    } finally {
      clearTimeout(timer);
    }
    if (res === 'timeout') {
      if (mountedRef.current && gen === genRef.current) onTransient(kind);
      return;
    }
    if (!mountedRef.current || gen !== genRef.current) return;
    const session = res.data.session;
    const token = session?.access_token;
    const uid = session?.user?.id;
    if (!token || !uid) {
      if (isRetryableAuthError(res.error)) onTransient(kind);
      else endSession();
      return;
    }
    if (uid === uidRef.current) void load(token, uid, kind);
    else begin(session, kind);
  };

  const retryAuth = useCallback(() => retryRef.current('manual'), []);

  useEffect(() => {
    mountedRef.current = true;
    const { supabase } = depsRef.current;

    // 安全出口（F4）：getSession() 例外或 10 秒內未 resolve → 頁首改畫訪客版。
    // 只管 session 這一步；/profile 卡住由 fetchProfile 的逾時＋重試／degraded 處理（T1-B）。
    const stallTimer = setTimeout(() => setSessionStalled(true), SESSION_STALL_MS);
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(stallTimer);
        if (!mountedRef.current) return;
        setSessionStalled(false);
        if (session?.access_token) {
          sessionCheckRef.current = 'clean';
          begin(session);
        } else if (isRetryableAuthError(error)) {
          // 初始化 refresh 暫時失敗：不是「沒登入」，不清提示，走同一條重試／degraded。
          sessionCheckRef.current = 'error';
          if (uidRef.current === null) onTransient('initial');
        } else {
          sessionCheckRef.current = 'clean';
          // 沒有 session 不呼叫 onSignedOut：那會清掉訪客剛帶進來的邀請 token。
          if (uidRef.current === null && !attempt.busy) dispatch({ type: 'signedOut' });
        }
      })
      .catch(() => {
        clearTimeout(stallTimer);
        if (!mountedRef.current) return;
        setSessionStalled(true);
        // 連 session 都讀不到：不知道有沒有登入，不能停在判定中（守衛會一直轉圈）——
        // 走同一條自動重試／degraded（頁首由 sessionStalled 安全出口畫訪客版）。
        sessionCheckRef.current = 'error';
        if (uidRef.current === null) onTransient('initial');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        begin(session);
      } else if (event === 'INITIAL_SESSION' && !session?.access_token) {
        // getSession 乾淨地回「無 session」之後才算數（見 sessionCheckRef）。
        if (uidRef.current === null && sessionCheckRef.current === 'clean' && !attempt.busy) {
          dispatch({ type: 'signedOut' });
        }
      } else if (event === 'SIGNED_OUT') {
        endSession();
        depsRef.current.onSignedOut();
      }
      // TOKEN_REFRESHED：僅換發 token，不需要任何 UI 狀態變化。
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(stallTimer);
      attempt.reset();
      subscription.unsubscribe();
    };
  }, [attempt, begin, endSession, onTransient]);

  // degraded 時分頁切回可見、網路恢復各自動重試一次（不輪詢：沒有事件就不發，W4-15）。
  // 在飛時 retry 自己會略過。App 既有的 useRevalidateOnFocus 字面不動，這是新的一次呼叫。
  const degradedRef = useRef(false);
  degradedRef.current = state.outcome === 'degraded';
  useRevalidateOnFocus(
    () => degradedRef.current,
    () => void retryRef.current('manual'),
  );
  const isDegraded = state.outcome === 'degraded';
  useEffect(() => {
    if (!isDegraded || typeof window === 'undefined') return;
    const onOnline = () => void retryRef.current('manual');
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [isDegraded]);

  // 靜默重抓 /profile：付款開通輪詢、任務領獎、分頁切回。刻意不碰 authState
  // （不轉 unknown、不閃全頁 spinner）；暫時性錯誤回 null、保留舊資料；不在這裡
  // signOut——真正的 session 過期由 apiClient 的 onSessionExpired 處理。
  const refreshUser = useCallback(async (): Promise<any | null> => {
    const gen = genRef.current;
    try {
      const {
        data: { session },
      } = await depsRef.current.supabase.auth.getSession();
      const token = session?.access_token;
      const uid = session?.user?.id;
      if (!token || !uid) return null;
      const result = await depsRef.current.fetchProfile(token, { userId: uid, force: true });
      if (!mountedRef.current || gen !== genRef.current || result.kind !== 'ok') return null;
      uidRef.current = uid;
      attempt.cancel();
      dispatch({ type: 'setUser', user: result.profile });
      return result.profile;
    } catch {
      return null;
    }
  }, [attempt]);

  const setUser = useCallback((user: any) => dispatch({ type: 'setUser', user }), []);

  const ingestProfile = useCallback(
    (profile: any) => {
      if (!profile) return;
      if (profile.id) uidRef.current = profile.id;
      // 呼叫端（OTP／邀請入口）自己決定導向，這裡不另外導頁。
      ingest(profile, false);
    },
    [ingest],
  );

  // ---- 衍生值與提示寫入（唯一寫入點）----
  const profile = state.user ?? state.funnelProfile;
  const isFunnel = !!state.funnelProfile || (!!state.user && isFirstTimeFunnel(state.user));
  const nextFunnelRoute = state.funnelProfile
    ? '/auth/complete-profile'
    : state.user
      ? nextFunnelRouteFor(state.user)
      : null;

  // undefined = 保持（不寫不清）；null = 清除。
  let hintKind: AuthHintKind | null | undefined;
  // anomaly（帳號資料異常）也清：下次首繪不該畫頭像。retrying／degraded 保留。
  if (state.outcome === 'signedOut' || state.outcome === 'anomaly') hintKind = null;
  else if (state.outcome === 'ok' && profile) hintKind = isFunnel ? 'funnel' : 'member';
  const hintInitial = profile ? initialOf(profile.name) : '';
  const hintUid8 = profile ? toUid8(profile.id) : '';
  const hintNext = hintKind === 'funnel' ? funnelNextKind(nextFunnelRoute) : null;

  useEffect(() => {
    if (hintKind === undefined) return;
    if (hintKind === null) {
      dropHint();
      return;
    }
    const storage = depsRef.current.storage;
    writeAuthHint(
      { kind: hintKind, initial: hintInitial, uid8: hintUid8, next: hintNext },
      storage,
    );
    const written = readAuthHint(storage);
    hintRef.current = written;
    setHint(written);
    // 剛由 /profile 確認的資料寫成，必屬於目前的帳號。
    setHintVerified(written !== null);
  }, [hintKind, hintInitial, hintUid8, hintNext, dropHint]);

  return {
    user: state.user,
    setUser,
    authState: state.authState,
    outcome: state.outcome,
    funnelProfile: state.funnelProfile,
    isFunnel,
    nextFunnelRoute,
    hint,
    hintVerified,
    isLoadingUser: state.authState === 'unknown',
    sessionStalled,
    refreshUser,
    ingestProfile,
    isRetrying: state.isRetrying,
    failedAgain: state.failedAgain,
    authAnomaly: state.outcome === 'anomaly',
    retryAuth,
  };
}
