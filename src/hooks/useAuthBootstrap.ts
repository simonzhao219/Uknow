// 登入狀態的單一來源（T1 auth-state-trust，plan §2.2、§2.5）。
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
import type { AuthState } from '../utils/authView';
import type { FetchProfileOptions, ProfileFetchResult } from '../utils/fetchProfile';
import { signOutWithFallback } from '../utils/signOutWithFallback';
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
  /** T1-B stub */
  endInvalidSession?: (opts: {
    auth: AuthBootstrapSupabase['auth'];
    storage?: Storage | null;
  }) => Promise<void>;
  getPathname?: () => string;
  storage?: Storage | null;
}

/**
 * none：冷啟動中；ok：/profile 確認；transient：有 session 但 /profile 5xx／斷網
 * （提示保留）；signedOut：確認沒有有效 session（提示清除）。
 */
export type AuthOutcome =
  | 'none'
  | 'ok'
  | 'transient'
  | 'signedOut'
  | 'retrying'
  | 'degraded'
  | 'anomaly';

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
  /** T1-B stub */
  isRetrying: boolean;
  failedAgain: boolean;
  authAnomaly: boolean;
  retryAuth: () => Promise<void>;
}

interface State {
  authState: AuthState;
  outcome: AuthOutcome;
  user: any;
  funnelProfile: any;
}

type Action =
  | { type: 'start' }
  | { type: 'profile'; profile: any }
  | { type: 'transient' }
  | { type: 'signedOut' }
  | { type: 'setUser'; user: any };

const INITIAL: State = { authState: 'unknown', outcome: 'none', user: null, funnelProfile: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // 新 uid（冷啟動、換帳號）：回到判定中，不沿用前一人的資料。
    case 'start':
      return INITIAL;
    // /profile 確認（冷啟動、ingestProfile）：資料未齊者只記 funnelProfile。
    case 'profile':
      return isProfileComplete(action.profile)
        ? { authState: 'authenticated', outcome: 'ok', user: action.profile, funnelProfile: null }
        : { authState: 'authenticated', outcome: 'ok', user: null, funnelProfile: action.profile };
    // 已有資料時的暫時性錯誤不改狀態（stale-while-revalidate，總綱 §1.2B）。
    case 'transient':
      if (state.user || state.funnelProfile) return state;
      return { ...state, authState: 'anonymous', outcome: 'transient' };
    case 'signedOut':
      return { authState: 'anonymous', outcome: 'signedOut', user: null, funnelProfile: null };
    // 頁面直接 setUser（CompleteProfile、PaymentCheckout／Result、refreshUser）。
    // 與 'profile' 不對稱、刻意不分流資料完整度：資料未齊者經 isFirstTimeFunnel 的
    // profile gate 一樣算註冊中，頁首結果一致。
    // setUser(null) 只出現在登出路徑；提示由登出流程自己清。
    case 'setUser':
      return action.user
        ? { authState: 'authenticated', outcome: 'ok', user: action.user, funnelProfile: null }
        : { ...state, authState: 'anonymous', user: null, funnelProfile: null };
  }
}

const SESSION_STALL_MS = 10_000;

const defaultPathname = () => (typeof window !== 'undefined' ? window.location.pathname : '/');

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
  const uidRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const hintRef = useRef(hint);
  hintRef.current = hint;

  const dropHint = useCallback(() => {
    clearAuthHint(depsRef.current.storage);
    hintRef.current = null;
    setHint(null);
  }, []);

  const endSession = useCallback(() => {
    genRef.current += 1;
    uidRef.current = null;
    depsRef.current.clearInflight();
    dispatch({ type: 'signedOut' });
  }, []);

  const ingest = useCallback((profile: any, redirectIfIncomplete: boolean) => {
    if (redirectIfIncomplete && !isProfileComplete(profile)) {
      const { getPathname = defaultPathname, onIncompleteProfile } = depsRef.current;
      if (shouldRedirectToCompleteProfile(getPathname())) onIncompleteProfile();
    }
    dispatch({ type: 'profile', profile });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const { supabase } = depsRef.current;

    const load = async (token: string, uid: string) => {
      const gen = genRef.current;
      const result = await depsRef.current.fetchProfile(token, { userId: uid });
      if (!mountedRef.current || gen !== genRef.current) return;

      switch (result.kind) {
        case 'ok':
          ingest(result.profile, true);
          break;
        // missing（404）暫與 unauthorized 同處置；T1-B B4 改成 anomaly（W4-11）。
        case 'unauthorized':
        case 'missing':
          endSession();
          // 網路失敗不留未處理例外、補本機登出（PR-B 會改成兩層確認的 endInvalidSession）。
          await signOutWithFallback(supabase.auth);
          break;
        case 'transient':
          // 冷啟動的暫時性錯誤：放掉 uid，之後同 uid 的 SIGNED_IN 可以再試。
          uidRef.current = null;
          dispatch({ type: 'transient' });
          break;
        default:
          result satisfies never;
      }
    };

    /** 拿到 session：新 uid 才（重新）判定；提示屬於別人就立即清（S11）。 */
    const begin = (session: Session) => {
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
      if (uidRef.current !== null) {
        genRef.current += 1;
        depsRef.current.clearInflight();
        depsRef.current.onAccountSwitched?.();
      }
      uidRef.current = uid;
      dispatch({ type: 'start' });
      void load(token, uid);
    };

    // 安全出口（F4）：getSession() 例外或 10 秒內未 resolve → 頁首改畫訪客版。
    // 只管 session 這一步；/profile 卡住不在此列（PR-A 無逾時，見 plan §7 已知限制 3）。
    const stallTimer = setTimeout(() => setSessionStalled(true), SESSION_STALL_MS);
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(stallTimer);
        if (!mountedRef.current) return;
        setSessionStalled(false);
        if (session?.access_token) begin(session);
        // 沒有 session 不呼叫 onSignedOut：那會清掉訪客剛帶進來的邀請 token。
        else if (uidRef.current === null) dispatch({ type: 'signedOut' });
      })
      .catch(() => {
        clearTimeout(stallTimer);
        if (mountedRef.current) setSessionStalled(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        begin(session);
      } else if (event === 'INITIAL_SESSION' && !session?.access_token) {
        if (uidRef.current === null) dispatch({ type: 'signedOut' });
      } else if (event === 'SIGNED_OUT') {
        endSession();
        depsRef.current.onSignedOut();
      }
      // TOKEN_REFRESHED：僅換發 token，不需要任何 UI 狀態變化。
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(stallTimer);
      subscription.unsubscribe();
    };
  }, [dropHint, endSession, ingest]);

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
      dispatch({ type: 'setUser', user: result.profile });
      return result.profile;
    } catch {
      return null;
    }
  }, []);

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
  if (state.outcome === 'signedOut') hintKind = null;
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
    isRetrying: false,
    failedAgain: false,
    authAnomaly: false,
    retryAuth: stubRetry,
  };
}

const stubRetry = async () => {};
