import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Search, Shield, UserX, Users } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { StatCardGrid } from '../ui/stat-card-grid';
import { StatusCallout } from '../ui/status-callout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { AdminToolbar } from './AdminToolbar';
import { IdReviewQueue } from './IdReviewQueue';
import { MemberCardList } from './MemberCardList';
import { findMemberDetailTrigger, memberDetailTriggerProps } from './memberDetailTrigger';
import { MemberDetailSheet } from './MemberDetailSheet';
import { memberLabel, memberName } from './memberName';
import { AccountStatusBadge, AdminBadge, SuspendedBadge } from './MemberStatusBadges';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { type AdminCache, type MemberListParams, adminQuery } from './adminCache';
import { type AdminBusy, lockedTabProps, NOOP_BUSY } from './adminBusy';
import { runAdminWrite } from './adminWrite';
import { UNKNOWN_OUTCOME } from './writeOutcome';
import { REVALIDATE_DIM_DELAY_MS, isForbidden, useAdminList, useDelayedFlag } from './useAdminList';
import { useRefreshAnnouncer } from './useRefreshAnnouncer';
import { AdminListSkeleton } from './AdminListSkeleton';
import { AdminListError } from './AdminListError';
import { AdminListStatus } from './AdminListStatus';
import { AdminStaleNotice, type AdminStaleNoticeProps } from './AdminStaleNotice';
import { formatDataAge } from './DataAgeNote';
import { PAUSED_LOOK } from './remittanceGate';
import type {
  AdminIdReview,
  AdminMember,
  AdminMemberDetail,
  AdminMemberStats,
  AdminMembersResponse,
} from '@contract';

const PAGE_SIZE = 50;

// 手機統計摘要的形狀：骨架與確認後的 dl 共用，換行與高度一致（同提領彙總）。
const SUMMARY_ROW = 'flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border p-3 text-sm';

export interface MemberManagementProps {
  loadMembers: (params: {
    search?: string;
    limit: number;
    offset: number;
  }) => Promise<AdminMembersResponse['data']>;
  loadMemberDetail: (id: string) => Promise<AdminMemberDetail>;
  setMemberAdmin: (id: string, isAdmin: boolean) => Promise<void>;
  suspendMember: (id: string, suspend: boolean) => Promise<void>;
  loadIdReviews: (params: {
    limit: number;
    offset: number;
  }) => Promise<{ reviews: AdminIdReview[]; total: number }>;
  submitIdReview: (userId: string, approve: boolean, reason?: string) => Promise<void>;
  /** 後台記憶體快取（AdminConsole 建立）。不給＝不跨卸載保留。 */
  cache?: AdminCache;
  busy?: AdminBusy;
}

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

/**
 * 詳情面板裡會改變會員狀態的動作。兩種動作**共用同一條路徑**——同一個確認框、
 * 同一個執行器、同一處錯誤顯示。相同的東西用相同的邏輯，才不會日後其中一個
 * 被改了另一個沒跟上（改版前正是如此：停權在列上、管理員在面板裡，兩套流程）。
 */
export type MemberAction = { kind: 'admin' | 'suspend'; next: boolean };

/**
 * 判準是**逐方向看破壞力**，不是逐動作。四個方向裡只有「恢復」是 ~0——
 * 把凍結的東西還回去。可逆又無傷的動作也收確認框，只會把確認框訓練成
 * 無腦點掉的一步，真正危險的那次就攔不住了。
 */
function needsConfirm(action: MemberAction) {
  return !(action.kind === 'suspend' && action.next === false);
}

/**
 * 確認框文案一律說出**後果**，不是「確定嗎」——admin 要判斷的是這件事會對
 * 那個人造成什麼，不是重複一次自己剛按了什麼。
 *
 * `destructive`：確認鈕要不要紅實心——規則見 ui-ux-guidelines §12.11「確認鈕跟觸發鈕
 * 同類」。這裡是它在會員管理的唯一落點。
 */
function actionCopy(action: MemberAction, target: AdminMemberDetail) {
  const name = memberLabel(target);
  if (action.kind === 'admin') {
    return action.next
      ? {
          title: '授予管理員權限？',
          confirm: '確認授予',
          destructive: false,
          body: `${name} 將可存取平台管理後台，並讀取全站會員的身分證字號與收款帳號。權限隨時可以撤回，但他在這段期間看過的資料無法追溯撤回。`,
        }
      : {
          title: '撤銷管理員權限？',
          confirm: '確認撤銷',
          destructive: true,
          body: `${name} 將立即失去平台管理後台的全部存取權（提領作業、會員管理、證件審核）。`,
        };
  }
  // 後果與規格書 §5.2 一致：非管理員的停權會員進不了會員區（RequireMembershipRoute 的
  // suspendedBlocked 是 `suspended && !isAdmin`），不只是凍結提領與刊登。管理員不受這條
  // 限制，對他就不寫這句——守衛本來就不擋他，不必另寫例外。
  const lockout = target.isAdmin ? '' : '，也無法進入會員區';
  return {
    title: '暫停這個帳號？',
    confirm: '確認暫停',
    destructive: true,
    body: `${name} 的刊登將立即隱藏，無法提領點數或領取免費續約 credit${lockout}。解除暫停後即恢復。`,
  };
}

export function MemberManagement({
  loadMembers,
  loadMemberDetail,
  setMemberAdmin,
  suspendMember,
  loadIdReviews,
  submitIdReview,
  cache,
  busy = NOOP_BUSY,
}: MemberManagementProps) {
  // 版面切換用 JS 判定而非 CSS 雙套版面（plan §3 的刻意偏離，Q3 已裁決接受）:
  // 兩套都掛在 DOM 上，jsdom 的 getByText 會立刻變成 found multiple elements，
  // 既有測試會整批誤紅，而那個紅燈不代表任何真實缺陷。
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const statusId = useId();
  const listErrorId = useId();
  const loadMoreNoteId = useId();
  const listRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // 切回時回到原本的子分頁（D3）：存在記憶體快取的 view；搜尋字不存。
  const [memberTab, setMemberTab] = useState(() => cache?.readView().memberTab ?? 'members');
  // 送出中的管理動作，逐位會員記（面板用種類決定哪顆鈕轉圈）。單值做不到：A 在途時
  // 對 B 送出，A 的那筆就被蓋掉，關掉再重開 A 時鈕是活的，可以重複送出。
  const [processing, setProcessing] = useState<ReadonlyMap<string, MemberAction['kind']>>(
    () => new Map(),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<AdminMemberDetail | null>(null);
  // **會改變會員狀態的動作全部只在詳情面板裡，走同一條路徑**：同一個
  // pendingAction、同一個確認框、同一個執行器。列上一顆都不放。
  //
  // 為什麼兩個動作同規格：停權與授予管理員是同一類事——**對一個人做的判斷**，
  // 不是對一筆資料做的修改。做這種判斷之前本來就該先看清楚他是誰，而那些
  // 資訊全在面板裡。曾經替停權開過例外（理由是「客服接到電話當下就該能處理」，
  // 援引 `WithdrawalManagement` 的退件不鎖），那個先例不轉移：提領台的動作是
  // 對**一筆交易**做的，交易該看的欄位整列都在，看不看詳情不影響判斷品質。
  //
  // 為什麼授予也要確認框（推翻更早的「授錯了撤回即可」不對稱推理）：那個
  // 推理只在權限層成立。管理員當下就讀得到全站的身分證字號與收款帳號
  // （提領作業台維持全碼），撤回權限撤不回已經被看過的資料——**授予在資料層
  // 面是不可逆的**，方向和直覺相反。
  //
  // 唯一不收確認框的是「恢復」：四個方向裡只有它的破壞力是 ~0（把東西還
  // 回去）。判準是逐方向看破壞力，不是逐動作——所以「撤銷管理員」雖然也是
  // 還原方向，照樣要確認（對方瞬間失去全部管理能力）。
  const [pendingAction, setPendingAction] = useState<MemberAction | null>(null);
  // 面板蓋在列表上，面板內動作的錯誤印在列表區等於印在看不見的地方。
  const [panelError, setPanelError] = useState<string | null>(null);
  // 動作成功、只是重讀失敗：區塊讀取失敗用中性字（ui-ux-guidelines §13 第 4 條），
  // 紅色 alert 只給動作本身的失敗。
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  // 別人（A）的動作失敗晚到、面板已換成 B：寫進 B 的管理區（前綴 A 的姓名）。列表上方
  // 的錯誤框此時被 modal 蓋住、報讀器也念不到。B 自己的動作不清它，B 關閉時轉到列表上方。
  const [otherNotice, setOtherNotice] = useState<string | null>(null);

  // 「查看」→ 面板的請求狀態。**只有最後一次意圖算數**：
  // - `openingIds`：在途的列各自轉圈、停用；每個請求結算時只移除自己的 id。單值
  //   做不到——點 B 會讓 A 的鈕提前放開，A 的結算又會清掉 B 的轉圈。
  // - `detailRequests`：最新意圖的 ticket（useLatestRequest）。每次點「查看」與關閉面板都
  //   `begin()`；回應只有 ticket 仍為最新時才可寫面板或錯誤。動作後的重讀共用同一個序號
  //   （`peek()`、不遞增）——否則關掉之後晚到的重讀會把面板重新打開，或把別人的面板換掉。
  //   動作成功或結果不明時 `markChanged`：讀取在途時那一位被改過，落地的那份丟掉再讀一次。
  const [openingIds, setOpeningIds] = useState<string[]>([]);
  const detailRequests = useLatestRequest();
  // 開出目前面板的那顆「查看」屬於哪一列（關閉時把焦點還給它）。
  const openedFromId = useRef<string | null>(null);
  const startOpening = (id: string) =>
    setOpeningIds((prev) => [...prev.filter((x) => x !== id), id]);
  const settleOpening = (id: string) => setOpeningIds((prev) => prev.filter((x) => x !== id));
  const errorRef = useRef<HTMLDivElement>(null);
  // 錯誤框的捲動與聚焦只給「剛按查看就失敗」——那是使用者正在等的結果。晚到的動作失敗
  // 印在同一個框，但不搶焦點：admin 可能正在搜尋框打字，被拉走、列表跟著跳。
  const focusErrorOnShow = useRef(false);
  // 送出後焦點的落點。被按的鈕送出中是停用的，留在它身上等於掉到 body。
  const manageHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusManageArea = () => manageHeadingRef.current?.focus();
  // 確認框沒有 AlertDialogTrigger（由面板內的鈕開），Radix 關閉時只會把焦點還給
  // Trigger——沒有就掉到 body。所以落點自己記：取消回到開框的鈕，確認落到管理區。
  const confirmReturnFocus = useRef<HTMLElement | null>(null);
  const confirmed = useRef(false);
  // 目前開著的面板是哪一位（runAction 的閉包只看得到送出當下的 detailFor）。與
  // `setDetailFor` 一起在 `showDetail` 裡**同步**寫，不用 effect 鏡像：effect 要等 commit
  // 之後才跑，在那之前結算的請求會讀到上一位。
  const shownId = useRef<string | null>(null);
  const showDetail = (next: AdminMemberDetail | null) => {
    shownId.current = next?.id ?? null;
    setDetailFor(next);
  };

  // 取詳情失敗走列表上方的錯誤框（不開空面板）。手機上停在長列表深處按「查看」
  // 時那裡在畫面外，使用者只會看到鈕停止轉圈——等於「按了沒反應」。
  useEffect(() => {
    if (!actionError || !focusErrorOnShow.current) return;
    focusErrorOnShow.current = false;
    errorRef.current?.scrollIntoView?.({ block: 'nearest' });
    errorRef.current?.focus();
  }, [actionError]);

  // 分頁走後台的組合 hook：空白搜尋時拿快取當種子、背景重讀、落地驗證；非空白搜尋不讀
  // 不寫快取——不在記憶體累積被查詢者（§2.5）。這一頁沒有被暫停的操作，未確認只影響載入更多。
  const list = useAdminList<AdminMember, AdminMemberStats, MemberListParams>({
    cache,
    query: adminQuery.members({ search }),
    pageSize: PAGE_SIZE,
    load: async (params, { limit, offset }) => {
      const data = await loadMembers({ search: params.search, limit, offset });
      // stats 直通伺服器算好的**全站**數字。不從 members 加總——那樣算出來
      // 的統計卡會隨分頁改變（M2 的反例，改版前正是如此）。
      return { items: data.members ?? [], total: data.total, meta: data.stats };
    },
  });
  const members = list.items;
  const total = list.total;
  const stats = list.meta ?? null;
  const updating = list.isLoading || list.isRevalidating;
  const failed = list.error !== null;
  // 有舊列時的失敗或逾時：保留舊列並說出資料時間（E2）。
  const stale = members.length > 0 && (failed || list.isSlow);
  const listFailedEmpty = failed && members.length === 0;
  // 更新中的淡化延遲 0.3 秒才出現、離開立即；失敗與逾時是靜態狀態，立即顯示。
  const dimmed = useDelayedFlag(updating && !list.isSlow, REVALIDATE_DIM_DELAY_MS);
  // 未確認時載入更多按不出去（舊列後面不接新頁）；外觀與原因跟淡化同一個 0.3 秒判準。
  const unconfirmedLook = !list.isConfirmed && (dimmed || failed || list.isSlow);
  const statusSuffix = unconfirmedLook ? (failed ? '更新失敗' : '更新中') : undefined;

  const reload = () => list.reload();
  const isUpdating = updating && !list.isSlow;
  const announcer = useRefreshAnnouncer({ isUpdating, reload, settled: list.settled });

  // 手動按下（工具列、陳舊提示、錯誤區的重試）的那條結算若失敗，狀態文字已經播過「更新
  // 失敗」，陳舊提示就不再以 alert 打斷；新的一次讀取開始（錯誤清掉）時歸零。
  const [failureAnnounced, setFailureAnnounced] = useState(false);
  useEffect(() => {
    if (!failed) setFailureAnnounced(false);
  }, [failed]);
  const manualRefresh = () => {
    announcer.refresh();
    void list.settled().then((outcome) => setFailureAnnounced(outcome === 'failed'));
  };

  // 重試期間錯誤區或陳舊提示留在原位、改寫「正在更新…」（焦點留在鈕上、不掉到 body）；結算後
  // 若被列表取代，焦點移到列表區。
  const [retrying, setRetrying] = useState<'notice' | 'empty' | null>(null);
  // 按下重試時焦點在不在那一區：在的話，結算後那一區被列表取代（焦點掉到 body）就移到列表區。
  const retryHadFocus = useRef(false);
  useEffect(() => {
    if (updating) return;
    setRetrying(null);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (retryHadFocus.current && lost) listRef.current?.focus();
    retryHadFocus.current = false;
  }, [updating]);

  // 載入更多完成而沒有更多了：鈕消失，焦點移到列表區（不掉到 body；同提領頁）。
  const wasLoadingMore = useRef(false);
  useEffect(() => {
    if (wasLoadingMore.current && !list.isLoadingMore && !list.hasMore) {
      if (!document.activeElement || document.activeElement === document.body) {
        listRef.current?.focus();
      }
    }
    wasLoadingMore.current = list.isLoadingMore;
  }, [list.isLoadingMore, list.hasMore]);

  const age = formatDataAge(list.fetchedAt ?? list.now, list.now);
  const notice: AdminStaleNoticeProps | null = stale
    ? {
        kind: failed ? 'failed' : 'slow',
        age,
        reason: list.error ?? undefined,
        // 同一輪已有動作失敗的 alert 時不再打斷。
        announce: !failureAnnounced && !actionError,
      }
    : retrying === 'notice' && updating && members.length > 0
      ? { kind: 'updating', age }
      : null;
  const retryFromNotice = () => {
    retryHadFocus.current = !!noticeRef.current?.contains(document.activeElement);
    setRetrying('notice');
    manualRefresh();
  };
  const retryFromError = () => {
    const region = document.getElementById(listErrorId);
    retryHadFocus.current = !!region?.contains(document.activeElement);
    setRetrying('empty');
    manualRefresh();
  };

  // 證件審核在子分頁裡：寫入在途或匯出中時，切子分頁同樣會卸載在途的元件（T14），非 active 的
  // 那一個比照外層分頁停用、指向說明行。
  const tabLocked = (value: string) => busy.locked && memberTab !== value;
  // 停用立即生效，外觀等 0.3 秒（與外層分頁同一個判準）。
  const lockLook = useDelayedFlag(busy.locked, REVALIDATE_DIM_DELAY_MS);

  const openDetail = async (id: string) => {
    let ticket = detailRequests.begin(id);
    setActionError(null);
    setPanelError(null);
    setPanelNotice(null);
    setOtherNotice(null);
    startOpening(id);
    try {
      let fetched = await loadMemberDetail(id);
      // 讀取送出之後這一位被改過（例：動作在途時關面板、重開同一位，讀取還在途時動作才完成）：
      // 這份早於變更，丟掉再讀一次，補讀落地才顯示——否則會閃一次舊狀態，期間「暫停」可按。
      // 只補讀一次：補讀途中不會再有第二次變更（同一位的動作鈕處理中停用，面板也還沒開）。
      if (detailRequests.isLatest(ticket) && detailRequests.changedSince(ticket)) {
        ticket = detailRequests.begin(id);
        fetched = await loadMemberDetail(id);
      }
      if (detailRequests.isLatest(ticket)) {
        openedFromId.current = id;
        showDetail(fetched);
      }
    } catch (err) {
      // 詳情讀取回 403：權限可能已失，清空快取（畫面上的列表在它下一次讀取時丟列，不為此多讀）。
      if (isForbidden(err)) cache?.invalidate('accessLost');
      if (detailRequests.isLatest(ticket)) {
        focusErrorOnShow.current = true;
        setActionError(messageOf(err, '無法取得會員詳情'));
      }
    } finally {
      settleOpening(id);
    }
  };

  const closeDetail = () => {
    detailRequests.begin();
    showDetail(null);
    // 面板上那則「別人的失敗」不隨面板消失：轉到列表上方（不搶焦點）。
    if (otherNotice) {
      setActionError(otherNotice);
      setOtherNotice(null);
    }
  };

  // 關閉後焦點回到同一位會員的「查看」鈕。不能交給 Radix 自己還原：載入期間
  // 觸發鈕是停用的，焦點早就掉到 body，Radix 記到的就是 body。
  const returnFocusToTrigger = (event: Event) => {
    const id = openedFromId.current;
    if (!id) return;
    const trigger = findMemberDetailTrigger(id);
    if (!trigger) return;
    event.preventDefault();
    trigger.focus();
  };

  const latestOpeningId = openingIds[openingIds.length - 1];
  const latestOpening = latestOpeningId ? members.find((m) => m.id === latestOpeningId) : undefined;

  const requestAction = (action: MemberAction) => {
    if (needsConfirm(action)) {
      confirmReturnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingAction(action);
      return;
    }
    runAction(action);
    focusManageArea();
  };

  // 確認框關閉後的焦點落點（見 confirmReturnFocus）。
  const restoreFocusAfterConfirm = (event: Event) => {
    event.preventDefault();
    if (confirmed.current) {
      confirmed.current = false;
      focusManageArea();
    } else {
      confirmReturnFocus.current?.focus();
    }
  };

  // 動作後重讀詳情。關了又重開同一位時，重開那次讀取可能早於變更提交：以當下的序號再讀一次。
  const refreshDetail = async (id: string, outcome: 'done' | 'unknown') => {
    const ticket = detailRequests.peek();
    try {
      const fresh = await loadMemberDetail(id);
      if (detailRequests.isLatest(ticket)) showDetail(fresh);
    } catch (err) {
      if (isForbidden(err)) cache?.invalidate('accessLost');
      if (detailRequests.isLatest(ticket)) {
        setPanelNotice(
          outcome === 'done'
            ? '已更新，但重新讀取詳情失敗，請關閉面板後重開'
            : '重新讀取詳情失敗，請關閉面板後重開確認狀態',
        );
      }
    }
  };

  // 寫入走 runAdminWrite：鎖只包住寫入請求、結果三分、先失效再回報再重讀。成功與結果不明都
  // 可能已提交——失效、markChanged、面板仍顯示該人時重讀詳情（K3）、重讀列表；後端拒絕（4xx）
  // 不失效，面板顯示該人時錯誤印在管理區（不重讀），否則印在列表上方並重讀列表。
  const runAction = async (action: MemberAction) => {
    const target = detailFor;
    if (!target) return;
    // 與「查看」共用序號（取號、不遞增）：面板關掉或換人之後，這個動作晚到的
    // 結果不得寫進別人的面板。
    const ticket = detailRequests.peek();
    // 面板還開著同一個人（沒關，或關了又重開同一位）：結果照樣寫回面板。
    const panelShowsTarget = () => detailRequests.isLatest(ticket) || shownId.current === target.id;
    const name = memberLabel(target);
    setProcessing((prev) => new Map(prev).set(target.id, action.kind));
    setPanelError(null);
    setPanelNotice(null);
    // 寫入結算之後還要等的讀取（詳情、列表）：送出中的鈕等它們回來才放開——變更已成立，
    // 面板卻停在舊狀態時鈕的標籤也是舊的，admin 以為沒生效而再按一次，按下去的是反方向。
    let followUp: Promise<unknown> = Promise.resolve();
    await runAdminWrite({
      busy,
      cache,
      event: action.kind === 'admin' ? 'memberAdmin' : 'memberSuspend',
      submit: () =>
        action.kind === 'admin'
          ? setMemberAdmin(target.id, action.next)
          : suspendMember(target.id, action.next),
      settle: (outcome) => {
        // 可能已提交：之後落地的詳情讀取若早於這次變更，丟掉再讀一次（見 openDetail）。
        if (outcome.kind !== 'rejected') detailRequests.markChanged(target.id);
        if (outcome.kind === 'done') return;
        // 錯誤原文直通（4xx）：後端分得出 cannot_demote_self 與 last_admin，壓成
        // 「操作失敗」等於把那個區別丟掉，admin 不知道該找誰處理。
        const unknown = outcome.kind === 'unknown';
        const message = messageOf(outcome.error, '操作失敗');
        if (panelShowsTarget()) {
          setPanelError(unknown ? UNKNOWN_OUTCOME.member(name) : message);
          return;
        }
        // 不能靜默——admin 會以為已經成功。兩種情況：
        // - 面板已關：印在列表上方（不搶焦點，見 focusErrorOnShow）；
        // - 已換到 B：寫進 B 的管理區（見 otherNotice），B 關閉時再轉到列表上方。
        const text = unknown ? UNKNOWN_OUTCOME.member(name) : `${name}：${message}`;
        if (shownId.current) setOtherNotice(text);
        else setActionError(text);
      },
      reload: (outcome) => {
        const showsTarget = panelShowsTarget();
        if (outcome.kind === 'rejected' && showsTarget) return;
        // 變更可能已成立。之後的重讀失敗**不得**回報成「操作失敗」——這兩顆鈕的標籤都隨
        // 狀態翻面，admin 以為沒生效而再按一次時，按下去的是反方向。
        const detailRead =
          outcome.kind !== 'rejected' && showsTarget
            ? refreshDetail(target.id, outcome.kind)
            : Promise.resolve();
        followUp = detailRead.then(() => list.reload());
        return followUp;
      },
    });
    await followUp;
    setProcessing((prev) => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });
  };

  const statValue = (pick: (s: AdminMemberStats) => number) =>
    list.isLoading ? null : stats ? String(pick(stats)) : '—';
  // placeholder：手機摘要骨架裡佔住數值位置的字（透明），寬度取典型值。
  const statCards = [
    {
      label: '總會員數',
      short: '總會員',
      icon: Users,
      pick: (s: AdminMemberStats) => s.total,
      placeholder: '000',
    },
    {
      label: '暫停會員',
      short: '暫停',
      icon: UserX,
      pick: (s: AdminMemberStats) => s.suspended,
      placeholder: '0',
    },
    {
      label: '管理員',
      short: '管理員',
      icon: Shield,
      pick: (s: AdminMemberStats) => s.admins,
      placeholder: '0',
    },
  ];

  return (
    // 次分頁殼：證件審核併在「會員管理」底下，不新增 AdminDashboard 的第 5 個
    // 頂層 Tab（規格書 §13 註記：那是釘死的 4 欄一列，硬加會壞版面）。
    //
    // 手機 12px / 桌面 24px 的區塊間距與提領台一致（理由寫在
    // `WithdrawalManagement.tsx` 的同一處，不重述）。兩個分頁在同一個
    // AdminDashboard 底下，節奏不同會被讀成「其中一頁壞了」。
    <Tabs
      value={memberTab}
      onValueChange={(next) => {
        setMemberTab(next);
        cache?.writeView({ memberTab: next });
      }}
      className="space-y-3 sm:space-y-6"
    >
      <TabsList>
        <TabsTrigger
          value="members"
          {...lockedTabProps(tabLocked('members'), lockLook, busy.noteId)}
        >
          會員列表
        </TabsTrigger>
        <TabsTrigger
          value="id-reviews"
          {...lockedTabProps(tabLocked('id-reviews'), lockLook, busy.noteId)}
        >
          證件審核
        </TabsTrigger>
      </TabsList>

      <TabsContent value="id-reviews">
        <IdReviewQueue
          loadReviews={loadIdReviews}
          submitReview={submitIdReview}
          cache={cache}
          busy={busy}
        />
      </TabsContent>

      {/* 確認框的文案一律說出**後果**，不是「確定嗎」——admin 要判斷的是
          這件事會對那個人造成什麼，不是重複一次自己剛按了什麼。 */}
      {/* 一個確認框服務兩種動作。文案來自 actionCopy 的單一來源——兩個分開的
          對話框各自演化的那天，就會有一個忘了把後果講清楚。 */}
      {pendingAction && detailFor && (
        <AlertDialog open onOpenChange={() => setPendingAction(null)}>
          <AlertDialogContent onCloseAutoFocus={restoreFocusAfterConfirm}>
            {(() => {
              const copy = actionCopy(pendingAction, detailFor);
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                    <AlertDialogDescription>{copy.body}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      variant={copy.destructive ? 'destructive' : undefined}
                      onClick={() => {
                        const action = pendingAction;
                        confirmed.current = true;
                        setPendingAction(null);
                        runAction(action);
                      }}
                    >
                      {copy.confirm}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>
      )}

      {detailFor && (
        <MemberDetailSheet
          detail={detailFor}
          processingKind={processing.get(detailFor.id) ?? null}
          panelError={panelError}
          panelNotice={panelNotice}
          otherNotice={otherNotice}
          manageHeadingRef={manageHeadingRef}
          onRequestAction={requestAction}
          onClose={closeDetail}
          onCloseAutoFocus={returnFocusToTrigger}
        />
      )}

      <TabsContent value="members" className="space-y-3 sm:space-y-6">
        {/* 統計卡片：讀伺服器算好的**全站** stats（隨列表回應帶出）。改版前是
            `members.filter(...).length`——那個數字會隨分頁改變。首次載入期間是骨架，
            不先閃 0；沒有任何資料時寫「—」。切回時照快取顯示、更新中與失敗時不套過期樣式
            （業主 Q5）：會員統計是背景資訊、不是任何操作的依據；提領統計是匯款依據，才擋到
            本次讀取確認後（裁決 A）。 */}
        <section aria-label="會員統計">
          {/* 手機整組換成一行摘要，與提領彙總同一個理由:壓扁過的三張卡仍佔
              一屏的可觀比例，而 admin 打開手機是為了找那個人。桌面維持卡片。 */}
          {!isDesktop ? (
            list.isLoading ? (
              // 同形骨架：同一組 flex-wrap、同樣的標籤，數值換成透明佔位字——高度跟著摘要走。
              // 先前固定 h-14（56px），摘要實測 46px，數字落地時下面跳 10px
              // （test_admin_mobile_layout.py 量）。
              <div aria-hidden="true" className={SUMMARY_ROW}>
                {statCards.map((card) => (
                  <div key={card.label} className="flex items-baseline gap-1">
                    <span className="text-xs text-muted-foreground">{card.short}</span>
                    <Skeleton className="font-bold text-transparent">{card.placeholder}</Skeleton>
                  </div>
                ))}
              </div>
            ) : (
              <dl className={SUMMARY_ROW}>
                {statCards.map((card) => (
                  <div key={card.label} className="flex items-baseline gap-1">
                    <dt className="text-xs text-muted-foreground">{card.short}</dt>
                    <dd className="font-bold text-foreground">{statValue(card.pick)}</dd>
                  </div>
                ))}
              </dl>
            )
          ) : (
            <StatCardGrid className="grid-cols-3 gap-2 sm:gap-4">
              {statCards.map((card) => {
                const value = statValue(card.pick);
                return (
                  <Card key={card.label}>
                    <CardHeader className="p-2 pb-0 sm:p-6 sm:pb-3">
                      <CardTitle className="flex items-center gap-1 text-xs sm:gap-2 sm:text-lg">
                        <card.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                        <span className="truncate">{card.label}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
                      {value === null ? (
                        <Skeleton aria-hidden="true" className="h-7 w-12 sm:h-9" />
                      ) : (
                        <div className="text-lg font-bold sm:text-3xl text-foreground">{value}</div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </StatCardGrid>
          )}
        </section>

        {actionError && (
          // scroll-mt：導覽列是 sticky、高 64px，捲進視線時不被它蓋住。
          <div ref={errorRef} tabIndex={-1} className="scroll-mt-20 outline-none">
            <StatusCallout
              variant="destructive"
              role="alert"
              className="px-3 py-2 text-sm"
              title={actionError}
            />
          </div>
        )}
        {/* 按鈕上的 aria-busy 多數報讀器不播報，另放一句。live region 常駐、只換文字：
            隨文字一起新插入的 live region 報讀器不保證播報。不用 role="status"，因為列表
            載入態已經用了它。 */}
        <div aria-live="polite" className="sr-only">
          {latestOpeningId
            ? `正在讀取 ${latestOpening ? memberLabel(latestOpening) : '會員'} 的詳情`
            : ''}
        </div>

        {/* 會員列表 */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* 手機整塊隱藏:分頁標籤已經寫著「會員」。隱藏在外層 div，
                  不然空的 div 照樣佔一個 flex item 加 gap，擠掉工具列 16px。 */}
              <div className="hidden sm:block">
                <CardTitle>會員管理</CardTitle>
                <CardDescription>管理平台所有會員帳號</CardDescription>
              </div>
              {/* 同提領頁的 AdminToolbar:搜尋吃剩餘寬度＋重新整理，沒有 CSV
                  （規則見 ui-ux-guidelines §3）。重新整理交給 useRefreshAnnouncer：更新途中
                  再按不重送、只改寫狀態文字。載入更多進行中真停用：兩者交錯，loadMore 晚回來
                  會把舊頁尾接到剛重設的列表上。 */}
              <div className="w-full sm:w-auto sm:min-w-80 sm:max-w-md sm:flex-1">
                <AdminToolbar
                  filter={
                    <form
                      className="relative"
                      onSubmit={(e) => {
                        e.preventDefault();
                        // 上一個搜尋的「已更新 HH:mm」「更新失敗」不是在說新的結果。
                        announcer.reset();
                        setRetrying(null);
                        setSearch(searchInput.trim());
                      }}
                    >
                      {/* 送出鈕內嵌在框的右側:不佔工具列寬度（375px 下
                          placeholder 才放得下），滑鼠使用者仍看得到送出入口；
                          鍵盤 Enter 照常送出。placeholder 縮成「搜尋會員」，
                          能搜哪些欄位改由名稱說（報讀念得到）。 */}
                      <Input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="搜尋會員"
                        aria-label="搜尋會員（姓名、Email 或電話）"
                        className="pr-10 pointer-coarse:pr-11"
                      />
                      <button
                        type="submit"
                        aria-label="搜尋"
                        className="absolute inset-y-0 right-0 flex w-10 pointer-coarse:w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring outline-none"
                      >
                        <Search className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </form>
                  }
                  onRefresh={manualRefresh}
                  statusText={announcer.statusText}
                  isUpdating={isUpdating}
                  refreshDisabled={list.isLoadingMore}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 有舊列時的失敗或逾時：保留舊列並說出資料時間與原因（E2），重試是背景重讀。放在列表區
                外面：過期樣式的透明度不能疊到提示本身。 */}
            {notice && (
              <div ref={noticeRef} className="mb-4">
                <AdminStaleNotice
                  {...notice}
                  onRetry={notice.kind === 'slow' ? undefined : retryFromNotice}
                />
              </div>
            )}
            {/* 更新中 aria-busy，0.3 秒後才淡化（快網路不閃）；失敗與逾時改用固定的過期樣式。 */}
            <section
              ref={listRef}
              tabIndex={-1}
              aria-label="會員列表"
              aria-busy={updating || undefined}
              data-dimmed={dimmed ? 'true' : undefined}
              data-stale={stale ? 'true' : undefined}
              className="scroll-mt-20 transition-opacity data-[dimmed=true]:opacity-60 data-[stale=true]:opacity-[var(--stale-opacity)]"
            >
              {retrying === 'empty' && updating ? (
                <AdminListError
                  id={listErrorId}
                  message=""
                  retrying
                  retryLabel="重試"
                  tone="flow"
                  onRetry={retryFromError}
                />
              ) : list.isLoading ? (
                <AdminListSkeleton
                  label="載入會員列表中"
                  variant={isDesktop ? 'rows' : 'cards'}
                  message={list.isSlow ? '更新較久，仍在等待伺服器回應' : undefined}
                />
              ) : listFailedEmpty ? (
                // 三態的「錯」：說出錯在哪、給一顆重試。靜默的空表格會讓 admin
                // 以為系統裡沒有這個人，而不是「沒讀到」。中性字（§13 第 4 條）。
                <AdminListError
                  id={listErrorId}
                  message={list.error ?? ''}
                  retryLabel="重試"
                  tone="flow"
                  onRetry={retryFromError}
                />
              ) : members.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">沒有符合條件的會員</p>
              ) : !isDesktop ? (
                <MemberCardList
                  members={members}
                  onOpenDetail={openDetail}
                  openingIds={openingIds}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>電話</TableHead>
                      <TableHead>會籍</TableHead>
                      <TableHead>刊登數</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      return (
                        <TableRow key={member.id}>
                          <TableCell>{memberName(member.name) ?? '—'}</TableCell>
                          <TableCell className="text-sm">{member.email}</TableCell>
                          <TableCell className="text-sm">{member.phone ?? '—'}</TableCell>
                          <TableCell>
                            <AccountStatusBadge status={member.accountStatus} />
                          </TableCell>
                          <TableCell>{member.listingCount}</TableCell>
                          <TableCell>
                            {member.isAdmin ? (
                              <AdminBadge />
                            ) : (
                              <Badge variant="outline">一般會員</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.suspended ? (
                              <SuspendedBadge />
                            ) : (
                              <Badge variant="default">正常</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* 列上只有一個動作：進去看。**沒有任何會改變狀態的
                              鍵可以從列表直接按到**——誤觸的上限就是開錯一個面板。
                              改版前是三顆等寬平排，而且視覺權重和使用頻率相反：
                              每天要按的「查看」是最輕的 ghost，偶爾才用的「暫停」
                              卻是滿版紅底、在掃描時最搶眼。 */}
                            <Button
                              size="sm"
                              tone="secondary"
                              aria-label={`查看 ${memberLabel(member)} 的詳情`}
                              {...memberDetailTriggerProps(member.id)}
                              loading={openingIds.includes(member.id)}
                              onClick={() => openDetail(member.id)}
                            >
                              查看
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {members.length > 0 && (
                <div className="pt-4 text-center space-y-2 text-sm text-muted-foreground">
                  {/* 不得靜默截斷（ui-ux-guidelines §5）。未確認時接「・更新中」——載入更多
                      按不出去的原因，鈕以 aria-describedby 指向這一行。 */}
                  <AdminListStatus
                    id={statusId}
                    shown={members.length}
                    total={total}
                    state="ready"
                    suffix={statusSuffix}
                  />
                  {list.hasMore && (
                    <>
                      {/* 載入中與未確認時改 aria-disabled（不用原生 disabled）：焦點留在鈕上、不掉到
                          body；未確認的停用外觀跟淡化同一個 0.3 秒判準。失敗時原因寫在鈕下。 */}
                      <Button
                        tone="secondary"
                        onClick={() => {
                          if (list.canLoadMore) void list.loadMore();
                        }}
                        aria-disabled={!list.canLoadMore || undefined}
                        aria-describedby={
                          list.loadMoreError
                            ? loadMoreNoteId
                            : unconfirmedLook
                              ? statusId
                              : undefined
                        }
                        data-paused={unconfirmedLook ? 'true' : undefined}
                        className={PAUSED_LOOK}
                      >
                        {list.isLoadingMore ? '載入中…' : '載入更多'}
                      </Button>
                      {/* 失敗以 alert 說出：焦點停在鈕上的人要聽得到（業主 Q7）。 */}
                      {list.loadMoreError && (
                        <p id={loadMoreNoteId} role="alert">
                          {list.loadMoreError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
