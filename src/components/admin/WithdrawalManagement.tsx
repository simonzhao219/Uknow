import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Eye } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { AdminToolbar } from './AdminToolbar';
import { WithdrawalCardList } from './WithdrawalCardList';
import { HiddenValue, WithdrawalFundingFields } from './WithdrawalFundingFields';
import {
  WITHDRAWAL_STATUS_VALUES,
  WithdrawalStatusBadge,
  withdrawalStatusLabel,
} from './WithdrawalStatusBadge';
import { Skeleton } from '../ui/skeleton';
import { Textarea } from '../ui/textarea';
import { FieldError } from '../../utils/formHelpers';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
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
import { formatTwTimestamp, twDayOf } from '../../utils/twDate';
import { buildCsvContent } from '../../utils/csv';
import { copyToClipboard } from '../../utils/clipboard';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { type AdminCache, type WithdrawalListParams, adminQuery } from './adminCache';
import { type AdminBusy, NOOP_BUSY, PAUSED_LOOK } from './adminBusy';
import { AdminActionReport } from './AdminActionReport';
import { UNKNOWN_OUTCOME } from './writeOutcome';
import { runAdminWrite } from './adminWrite';
import { collectExportRows } from './withdrawalExport';
import { REVALIDATE_DIM_DELAY_MS, useAdminList, useDelayedFlag } from './useAdminList';
import { useRefreshAnnouncer } from './useRefreshAnnouncer';
import { useBatchSelection } from './useBatchSelection';
import { type RemittanceGate, gateProps } from './remittanceGate';
import { AdminListSkeleton } from './AdminListSkeleton';
import { AdminListError } from './AdminListError';
import { AdminListStatus } from './AdminListStatus';
import { AdminStaleNotice, type AdminStaleNoticeProps } from './AdminStaleNotice';
import { DataAgeNote, formatDataAge } from './DataAgeNote';
import { detectInAppBrowser } from '../../utils/browserDetection';
import { StatCardGrid } from '../ui/stat-card-grid';
import type {
  AdminWithdrawalRecord,
  AdminWithdrawalStats,
  AdminWithdrawalsResponse,
} from '@contract';

interface IdCardDialogProps {
  record: AdminWithdrawalRecord;
  onClose: () => void;
  /** 關閉時焦點還給開框的鈕（這個框沒有 Trigger，Radix 只會還給 body）。 */
  onCloseAutoFocus?: (event: Event) => void;
}

function IdCardDialog({ record, onClose, onCloseAutoFocus }: IdCardDialogProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      {/* P5:max-w-3xl 經 twMerge 會蓋掉 dialog 原語的行動端護欄
          `max-w-[calc(100%-2rem)]`（ui/dialog.tsx:41），安全邊距歸零、對話框
          貼齊螢幕邊緣。實測**沒有**溢出（w-full 在 fixed 元素上已依視窗定寬
          375px，max-w-3xl 比它大所以不生效），所以「有沒有水平捲軸」永遠測
          不出這個退化——要量盒子與視窗邊界的間距。 */}
      <DialogContent
        className="max-w-[calc(100%-2rem)] sm:max-w-3xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>身分證照片查閱</DialogTitle>
          <DialogDescription>
            會員：{record.userName} | 身分證字號：{record.idNumber ?? '未設定'}
          </DialogDescription>
          {/* 註冊時姓名不接受標點，原住民漢字音譯姓名與新住民歸化漢名一律以
              半形空格取代身分證上的間隔號。沒有這句提示，admin 會看到「系統
              顯示谷辣斯 尤達卡、證件印谷辣斯·尤達卡」而誤判姓名不符退件——
              傷害正好落在這條規則本來想保護的族群身上。 */}
          <p className="text-xs text-muted-foreground">
            提醒：原住民／新住民姓名可能以半形空格取代身分證上的間隔號，屬正常註冊規則。
          </p>
        </DialogHeader>
        {/* P6:375px 下雙欄每張只有約 160px 寬，證件上的字看不清——
            而看清楚正是審核的實質工作。手機單欄大圖。 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">身分證正面</p>
            {record.idCardFrontUrl ? (
              <img
                src={record.idCardFrontUrl}
                alt="身分證正面"
                className="w-full h-auto rounded-lg border"
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
                未上傳
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">身分證反面</p>
            {record.idCardBackUrl ? (
              <img
                src={record.idCardBackUrl}
                alt="身分證反面"
                className="w-full h-auto rounded-lg border"
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
                未上傳
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button tone="secondary" onClick={onClose}>
            關閉
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface WithdrawalQuery {
  status: string;
  from?: string;
  to?: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface WithdrawalManagementProps {
  loadWithdrawals: (params: WithdrawalQuery) => Promise<AdminWithdrawalsResponse['data']>;
  /** 後台記憶體快取（AdminConsole 建立）。不給＝不跨卸載保留。 */
  cache?: AdminCache;
  busy?: AdminBusy;
  updateStatus: (
    id: string,
    status: 'awaiting_collection' | 'rejected' | 'completed',
    note?: string,
    bankRef?: string,
  ) => Promise<void>;
  batchMarkPaid: (
    items: { id: string; bankRef?: string }[],
  ) => Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>;
}

const PAGE_SIZE = 50;

// CSV 匯出上限（需求方裁決）。超過就明示拒絕，不給半份檔案。
const CSV_MAX_ROWS = 2000;

const twd = (n: number) => `$${n.toLocaleString('en-US')}`;

// 動作完成後的回報。刻意**留在畫面上**而不是彈個 toast 就消失：admin 做完
// 一筆會切去網銀，回來時 toast 早就沒了，於是不確定剛才那下到底送出去沒有。
const ACTION_DONE: Record<string, string> = {
  awaiting_collection: '已標記匯款完成',
  rejected: '已退件',
  completed: '已代為結案',
};

// 統計卡的標籤與取值。待匯款總額用 amount（銀行實付），不含平台收的手續費——admin 拿這個
// 數字去對網銀的轉出總額，混進手續費就對不起來。
// placeholder：手機摘要骨架裡佔住數值位置的字（透明），寬度取典型值——骨架與摘要同樣換行。
const STAT_ITEMS: {
  label: string;
  value: (s: AdminWithdrawalStats) => string;
  placeholder: string;
}[] = [
  { label: '待匯款總額', value: (s) => twd(s.pendingAmount), placeholder: '$000,000' },
  {
    label: withdrawalStatusLabel('pending'),
    value: (s) => String(s.byStatus.pending),
    placeholder: '0',
  },
  {
    label: withdrawalStatusLabel('awaiting_collection'),
    value: (s) => String(s.byStatus.awaiting_collection),
    placeholder: '0',
  },
  {
    label: withdrawalStatusLabel('completed'),
    value: (s) => String(s.byStatus.completed),
    placeholder: '0',
  },
];
// 手機的一行摘要把「待匯款總額」縮成「待匯款」：一行放得下四項。
const SUMMARY_LABELS = ['待匯款', ...STAT_ITEMS.slice(1).map((item) => item.label)];
// 手機摘要與它的骨架共用：同一組 flex-wrap，換行與高度才會一致。
const SUMMARY_ROW = 'flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border p-3 text-sm';
// 作業面板骨架的五欄（戶名、身分證、銀行代號、帳號、匯款金額）。
const FUNDING_FIELD_KEYS = ['name', 'id-number', 'bank-code', 'account', 'amount'];

interface Report {
  status: { tone: 'success' | 'warning'; text: string } | null;
  failure: string | null;
  /** 這個失敗屬於剛按下的那個動作：捲進視線並取得焦點。晚到的不搶。 */
  focusFailure: boolean;
}

const NO_REPORT: Report = { status: null, failure: null, focusFailure: false };

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export function WithdrawalManagement({
  loadWithdrawals,
  cache,
  busy = NOOP_BUSY,
  updateStatus: submitStatus,
  batchMarkPaid,
}: WithdrawalManagementProps) {
  // W8：「標記已匯款」需要同時開著網銀，手機上做不到，所以鎖在桌面。
  // 退件與代為完成不鎖——那是客服接到電話當下就該能處理的事。
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const statusId = useId();
  const listErrorId = useId();
  const loadMoreNoteId = useId();
  const listRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  // 動作回報：狀態容器（成功、批次被取消）與失敗容器（ui-ux §4.3）。收起時機：按「知道了」、
  // 下一個動作開始、換篩選、手動重新整理。
  const [report, setReport] = useState<Report>(NO_REPORT);
  // 每個動作（單筆、批次、匯出）開始時取號；失敗時號碼還是最新的，才算「剛按下的」。
  const actionSeq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 切回時回到原本的狀態篩選（J）：存在記憶體快取的 view，搜尋字與勾選不存。
  const [statusFilter, setStatusFilter] = useState(
    () => cache?.readView().withdrawalStatus ?? 'all',
  );
  // 匯出中。state 驅動畫面；ref 擋重入——setState 要等 re-render 才讓按鈕
  // disabled，同一個 tick 連按兩次會並行跑兩輪收集、下載兩份對帳檔。
  const [isExporting, setIsExporting] = useState(false);
  const exportingRef = useRef(false);
  const [viewRecord, setViewRecord] = useState<AdminWithdrawalRecord | null>(null);
  const [historyRecord, setHistoryRecord] = useState<AdminWithdrawalRecord | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 批次確認框開啟時凍結勾選的快照：框內姓名與合計、送出的 id 都用它（§2.6）。
  const [batchSnapshot, setBatchSnapshot] = useState<AdminWithdrawalRecord[] | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminWithdrawalRecord | null>(null);
  const [paidTarget, setPaidTarget] = useState<AdminWithdrawalRecord | null>(null);
  const [completeTarget, setCompleteTarget] = useState<AdminWithdrawalRecord | null>(null);
  // 寫入在途的列。可以同時有好幾筆：先回來的那筆不能把另一筆的處理中一起解開（P2-14）。
  const [processing, setProcessing] = useState<ReadonlySet<string>>(new Set());
  // 批次匯款在途：那幾筆正在變成待查收，匯款類入口比照未確認擋下（P2-14）。
  const [batchInFlight, setBatchInFlight] = useState(false);
  // 對話框的資料時間在開框時凍結：內容取自點擊當下那一列，綁列表即時的時間的話，更新
  // 落地後會標成「剛剛更新」，內容卻仍是舊的——比不標更糟。
  const [dialogFetchedAt, setDialogFetchedAt] = useState<number | null>(null);
  // 對話框關閉時焦點去哪（§4.3 焦點後備）：確認→該列（批次→列表區）；取消或 Esc→開框的
  // 觸發鈕，鈕已不在→該列。這些框沒有 Trigger，Radix 的 onCloseAutoFocus 只會還給 body。
  const dialogFocus = useRef<{ trigger: HTMLElement | null; rowId: string | null; done: boolean }>({
    trigger: null,
    rowId: null,
    done: false,
  });
  // 確認後焦點落在的那一列；它因重讀離開清單時移到下一列→上一列→列表區。
  const rowFocus = useRef<{ id: string; index: number } | null>(null);
  // 退件與代為結案的理由。後端對這兩個轉換強制要求非空 note（btrim 後為空
  // 也算沒填），所以沒有輸入欄＝那顆按鈕在正式環境每次都 400。
  const [reasonInput, setReasonInput] = useState('');
  // 交易序號選填（需求方裁決）：網銀不一定當下給得出來，強制必填會逼 admin
  // 亂填。但它是唯一能跟銀行對帳的錨點，所以要有地方可以填。
  const [bankRefInput, setBankRefInput] = useState('');

  // 分頁走後台的組合 hook：快取當種子、背景重讀、落地驗證。缺欄位不能讓它變成 undefined 再
  // 往下讀——這是 e2e 教出來的：舊 mock 不回 total／stats，`stats.pendingAmount` 直接擲錯，
  // 而 WithdrawalManagement 是 AdminDashboard 的預設分頁，一個面板的 payload 形狀不合，
  // **整個後台的分頁一起打不開**。total 缺了由 usePagedList 退回已讀筆數；stats 缺了統計區
  // 寫「—」，不再填 0（0 會被當成真的沒有待匯款）。
  const list = useAdminList<AdminWithdrawalRecord, AdminWithdrawalStats, WithdrawalListParams>({
    cache,
    query: adminQuery.withdrawals({ status: statusFilter }),
    pageSize: PAGE_SIZE,
    load: async (params, { limit, offset }) => {
      const data = await loadWithdrawals({ ...params, limit, offset });
      return { items: data.withdrawals, total: data.total, meta: data.stats };
    },
  });
  const withdrawals = list.items;
  const total = list.total;
  const updating = list.isLoading || list.isRevalidating;
  const failed = list.error !== null;
  const confirmed = list.isConfirmed;
  // 失敗或逾 15 秒：不脈動的靜態呈現——統計「—」、面板「暫停顯示」、收款資訊遮住。
  const settledUnconfirmed = !confirmed && (failed || list.isSlow);
  const stale = withdrawals.length > 0 && (failed || list.isSlow);
  // 更新中的淡化與停用外觀延遲 0.3 秒才出現、離開立即；失敗、逾時、匯出是靜態狀態，立即顯示。
  const dimmed = useDelayedFlag(updating && !list.isSlow, REVALIDATE_DIM_DELAY_MS);

  // 勾選以資料版本推導：換一批資料的那個 render 起就是空的（P2-18）。
  const selection = useBatchSelection(list.dataVersion);
  const selected = selection.selected;
  const clearSelection = selection.clear;

  // R7:useMediaQuery 是即時訂閱 change 事件的，視窗跨過 768px 會即時重渲染
  // 成另一套版面。Q2 裁決手機不渲染勾選框，但勾選不會自己消失——
  // 「已選取 N 筆」橫幅還在、卻沒有任何逐筆取消的入口。不會寫壞資料（批次
  // 動作仍鎖在 isDesktop 之後），但那是一個看得到、動不了的殭屍狀態。
  useEffect(() => {
    if (!isDesktop) clearSelection();
  }, [isDesktop, clearSelection]);

  const focusList = () => listRef.current?.focus();
  const focusRow = (id: string) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [];
    const row = Array.from(rows).find((el) => el.dataset.rowId === id);
    (row ?? listRef.current)?.focus();
  };

  // 換一批資料（接受的落地）時，剛確認的那一列若因這次重讀離開清單，焦點移到下一列。
  // （勾選不在這裡清：它以資料版本推導，見 useBatchSelection。）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 資料版本一變就做，本身就是觸發條件
  useEffect(() => {
    const pending = rowFocus.current;
    if (!pending || list.dataVersion === 0) return;
    rowFocus.current = null;
    if (withdrawals.some((w) => w.id === pending.id)) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = withdrawals[pending.index] ?? withdrawals[pending.index - 1];
    if (next) focusRow(next.id);
    else focusList();
  }, [list.dataVersion]);

  const reload = () => list.reload();
  const isUpdating = updating && !list.isSlow;
  const announcer = useRefreshAnnouncer({ isUpdating, reload, settled: list.settled });

  // 失敗或逾時遮住的收款資訊，遮到本次讀取確認為止（業主裁決 A）：重試、重新整理、寫入後的
  // 重讀都不提前解開——已知失敗的舊資料上不能重新露出帳號，再失敗也不會「遮→顯示→遮」地閃。
  // 換篩選時歸零：遮的是那一份資料。
  const [maskHeld, setMaskHeld] = useState(false);
  useEffect(() => {
    if (stale) setMaskHeld(true);
    else if (confirmed) setMaskHeld(false);
  }, [stale, confirmed]);
  const masked = withdrawals.length > 0 && (stale || (maskHeld && !confirmed));
  // 遮著、正在重讀（不是失敗也不是逾時）：提示改寫「正在更新…」。
  const holding = masked && !stale;

  // 手動按下（工具列、陳舊提示、錯誤區的重試）的那條結算若失敗，狀態文字已經播過「更新
  // 失敗」，陳舊提示就不再以 alert 打斷；新的一次讀取開始（錯誤清掉）時歸零。
  const [failureAnnounced, setFailureAnnounced] = useState(false);
  useEffect(() => {
    if (!failed) setFailureAnnounced(false);
  }, [failed]);
  const manualRefresh = () => {
    setReport(NO_REPORT);
    if (stale) setMaskHeld(true);
    announcer.refresh();
    void list.settled().then((outcome) => setFailureAnnounced(outcome === 'failed'));
  };

  // 匯款類閘門（標記已匯款、勾選與批次、CSV、查看證件）：本次讀取確認前與批次在途時一律
  // 擋下點擊（首個 render 就生效），外觀與原因跟淡化走同一個 0.3 秒判準。退件、代為完成、
  // 查看歷史不閘——後端狀態機擋不合法的轉換，手機急救的退件不能被鎖住。
  const unconfirmedLook = !confirmed && (dimmed || failed || list.isSlow);
  const batchLate = useDelayedFlag(batchInFlight, REVALIDATE_DIM_DELAY_MS);
  const gate: RemittanceGate = {
    paused: !confirmed || batchInFlight,
    look: unconfirmedLook || batchLate,
    describedBy: statusId,
    hint: failed ? '更新失敗' : '更新中',
  };
  const pausedProps = gateProps(gate);
  const statusSuffix = isExporting
    ? '匯出中，暫停其他操作'
    : gate.look
      ? failed
        ? '更新失敗，暫停匯款相關操作'
        : batchInFlight
          ? '批次匯款處理中，暫停匯款相關操作'
          : '更新中，暫停匯款相關操作'
      : undefined;
  const listFailedEmpty = failed && withdrawals.length === 0;
  const loadMoreNote = unconfirmedLook
    ? failed
      ? '更新失敗，重試後可載入更多'
      : '更新中，完成後可載入更多'
    : list.loadMoreError;

  // 批次確認框開著時閘門一關（例：另一筆單筆寫入完成、開始重讀）就關框：框裡的勾選屬於
  // 上一批資料，不能拿去送。不等資料版本變——重讀一開始就關。
  useEffect(() => {
    if (!batchSnapshot || !gate.paused) return;
    setBatchSnapshot(null);
    setReport((r) => ({ ...r, status: { tone: 'warning', text: '列表已更新，請重新勾選' } }));
  }, [batchSnapshot, gate.paused]);

  // 重試期間錯誤區或陳舊提示留在原位、改寫「正在更新…」（焦點留在鈕上、不掉到 body）；結算後
  // 若被列表取代，焦點移到列表區。沒有資料時的錯誤區靠這個旗標撐過重讀——首次載入失敗時否則
  // 是骨架，有過資料但清單為空時否則是「目前沒有提領申請」（結果出來前先說了一次沒有）。
  const [retryingEmpty, setRetryingEmpty] = useState(false);
  // 按下重試時焦點在不在那一區：在的話，結算後那一區被列表取代（焦點掉到 body）就移到列表區。
  const retryHadFocus = useRef(false);
  useEffect(() => {
    if (updating) return;
    setRetryingEmpty(false);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (retryHadFocus.current && lost) listRef.current?.focus();
    retryHadFocus.current = false;
  }, [updating]);

  const age = formatDataAge(list.fetchedAt ?? list.now, list.now);
  const notice: AdminStaleNoticeProps | null = stale
    ? {
        kind: failed ? 'failed' : 'slow',
        age,
        reason: list.error ?? undefined,
        // 逾時的提示沒有重試鈕（工具列的重新整理已放行）。
        hidden: failed ? '收款資訊已隱藏，重試後顯示' : '收款資訊已隱藏，重新整理後顯示',
        // 同一輪已有動作失敗的 alert 時不再打斷——別蓋掉「結果不明」那句。
        announce: !failureAnnounced && !report.failure,
      }
    : holding
      ? { kind: 'updating', age, hidden: '收款資訊已隱藏，更新完成後顯示' }
      : null;
  const retryFromNotice = () => {
    retryHadFocus.current = !!noticeRef.current?.contains(document.activeElement);
    manualRefresh();
  };
  const retryFromError = () => {
    const region = document.getElementById(listErrorId);
    retryHadFocus.current = !!region?.contains(document.activeElement);
    setRetryingEmpty(true);
    manualRefresh();
  };

  // 作業面板預設盯著第一筆：admin 開著網銀時，面板必須一進畫面就有內容，
  // 而不是先點一下才出現。
  const activeRecord = withdrawals.find((w) => w.id === activeId) ?? withdrawals[0] ?? null;
  const selectedRecords = withdrawals.filter((w) => selected.has(w.id));
  const pageIds = withdrawals.map((w) => w.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const stats = list.meta ?? null;

  const toggleAllOnPage = () => {
    if (gate.paused) return;
    // 「全選」= 這一頁，不是整個篩選結果。悄悄擴大到未載入的頁，等於使用者
    // 以為勾了 2 筆、實際送出 37 筆——而批次匯款不可回退。
    if (allPageSelected) selection.clear();
    else selection.replace(pageIds);
  };

  const toggleOne = (id: string) => {
    if (gate.paused) return;
    selection.toggle(id);
  };

  const openDialog = (trigger: HTMLElement | null, rowId: string | null, open: () => void) => {
    dialogFocus.current = { trigger, rowId, done: false };
    setDialogFetchedAt(list.fetchedAt);
    open();
  };
  const restoreDialogFocus = (event: Event) => {
    event.preventDefault();
    const { trigger, rowId, done } = dialogFocus.current;
    if (done) {
      if (rowId) focusRow(rowId);
      else focusList();
      return;
    }
    if (trigger?.isConnected && !trigger.hasAttribute('disabled')) trigger.focus();
    else if (rowId) focusRow(rowId);
    else focusList();
  };
  // 確認鈕：焦點改落在該列（或批次的列表區），而不是觸發鈕。
  const confirmDialog = (record: AdminWithdrawalRecord | null) => {
    dialogFocus.current.done = true;
    if (record) rowFocus.current = { id: record.id, index: withdrawals.indexOf(record) };
  };

  const dismissReport = () => {
    setReport(NO_REPORT);
    focusList();
  };

  // 動作結算一律併進目前的回報：狀態換新、失敗累加（P2-15）。同時在途的另一個動作（較早送出
  // 的寫入、匯出途中結算的寫入）寫下的失敗不能被蓋掉——「結果不明」那句尤其不行。收起回報只在
  // 下一個動作開始、按「知道了」、換篩選與手動重新整理時。
  const reportStatus = (status: NonNullable<Report['status']>) =>
    setReport((r) => ({ ...r, status }));
  const reportFailure = (text: string, seq: number) =>
    setReport((r) => ({
      ...r,
      failure: r.failure ? `${r.failure}；${text}` : text,
      focusFailure: seq === actionSeq.current,
    }));

  // 寫入一律走 runAdminWrite：鎖只包住寫入請求、結果三分、先失效再回報再重讀。回報與重讀在
  // 同一個 commit——回報出現時列表已經是 aria-busy，page object 不會在那一瞬間以為列表已更新完。
  const runBatch = async () => {
    const targets = batchSnapshot ?? [];
    confirmDialog(null);
    setBatchSnapshot(null);
    const seq = ++actionSeq.current;
    setReport(NO_REPORT);
    setBatchInFlight(true);
    await runAdminWrite({
      busy,
      cache,
      event: 'withdrawalBatchPaid',
      submit: async () => {
        const result = await batchMarkPaid(targets.map((w) => ({ id: w.id })));
        // 2xx 但形狀不對：讀欄位會擲錯——在這裡擲出就歸「結果不明」（可能已提交）。
        if (!Array.isArray(result?.succeeded) || !Array.isArray(result?.failed)) {
          throw new TypeError('批次標記的回應格式不符');
        }
        return result;
      },
      // 有任一筆成功才失效：那幾筆已經在狀態篩選之間移動。整批被後端拒絕（4xx，含整批回
      // 403）沒有提交；結果不明可能已提交，失效並請 admin 逐筆確認。
      committed: (result) => result.succeeded.length > 0,
      settle: (outcome) => {
        setBatchInFlight(false);
        if (outcome.kind === 'done') {
          const { succeeded, failed: rejectedRows } = outcome.result;
          if (rejectedRows.length > 0) {
            reportFailure(`${succeeded.length} 筆成功、${rejectedRows.length} 筆失敗`, seq);
          } else {
            reportStatus({ tone: 'success', text: `已標記匯款完成：${succeeded.length} 筆` });
          }
        } else {
          reportFailure(
            outcome.kind === 'unknown'
              ? UNKNOWN_OUTCOME.withdrawalBatch
              : messageOf(outcome.error, '批次標記失敗'),
            seq,
          );
        }
        clearSelection();
        announcer.reset();
      },
      reload,
    });
  };

  // 兩個必填理由的對話框共用同一個輸入 state：一次只會開一個，關掉就清空，
  // 免得上一次的理由殘留到下一筆（那會讓 admin 送出別人的說明）。
  const reasonFilled = reasonInput.trim().length > 0;
  const closeReasonDialog = () => {
    setRejectTarget(null);
    setCompleteTarget(null);
    setReasonInput('');
  };

  const copyAccount = (account: string) => {
    copyToClipboard(account);
  };

  const updateStatus = async (
    record: AdminWithdrawalRecord,
    status: 'awaiting_collection' | 'rejected' | 'completed',
    note?: string,
    bankRef?: string,
  ) => {
    const seq = ++actionSeq.current;
    setProcessing((prev) => new Set(prev).add(record.id));
    setReport(NO_REPORT);
    await runAdminWrite({
      busy,
      cache,
      event: 'withdrawalStatus',
      submit: () => submitStatus(record.id, status, note, bankRef),
      settle: (outcome) => {
        setProcessing((prev) => {
          const next = new Set(prev);
          next.delete(record.id);
          return next;
        });
        if (outcome.kind === 'done') {
          reportStatus({ tone: 'success', text: `${ACTION_DONE[status]}：${record.userName}` });
        } else if (outcome.kind === 'unknown') {
          // 標記已匯款是網銀轉出之後才按的：提醒勿重匯（裁決 E）。
          reportFailure(
            status === 'awaiting_collection'
              ? UNKNOWN_OUTCOME.withdrawalPaid(record.userName)
              : UNKNOWN_OUTCOME.withdrawal(record.userName),
            seq,
          );
        } else {
          reportFailure(`${record.userName}：${messageOf(outcome.error, '狀態更新失敗')}`, seq);
        }
        announcer.reset();
      },
      reload,
    });
  };

  // 收集可能要好幾秒（逐頁）。期間篩選與重新整理一併停用：收集迴圈用的是按下當下的
  // 篩選，中途換篩選會下載一份跟畫面不一致的檔案。列上的寫入動作、批次匯款與載入更多也
  // 停用：中途有列狀態改變而離開篩選，offset 分頁會整體前移。分頁也鎖住（busy），收完
  // 還要核對筆數與重複（K7）。收集範圍以確認過的 total 為準：閘門關著時 CSV 鈕不會呼叫到這裡。
  const downloadCSV = async () => {
    if (exportingRef.current || gate.paused) return;
    exportingRef.current = true;
    setIsExporting(true);
    const seq = ++actionSeq.current;
    setReport(NO_REPORT);
    const session = busy.startExport();
    const fail = (text: string) => reportFailure(text, seq);
    try {
      // W6：匯出的是**符合當前篩選的全部資料**，不是畫面上已載入的那幾列。給半份比明示
      // 拒絕糟得多——對帳是拿這份檔案去比銀行的轉出紀錄，少的那幾筆不會自己浮出來。超過
      // 上限就明說，並告訴 admin 怎麼縮小範圍。
      if (total > CSV_MAX_ROWS) {
        fail(
          `本次篩選有 ${total} 筆，超過匯出上限 ${CSV_MAX_ROWS} 筆。` +
            `請縮小日期範圍或狀態篩選後再匯出。`,
        );
        return;
      }
      let rows: AdminWithdrawalRecord[] = withdrawals;
      if (withdrawals.length < total) {
        try {
          const collected = await collectExportRows({
            total,
            pageSize: PAGE_SIZE,
            loadPage: list.loadPage,
            isMounted: () => mounted.current,
            onProgress: session.progress,
          });
          // tsconfig 非 strict，布林判別欄位不收窄聯集型別；改以欄位存在與否判斷。
          if ('reason' in collected) {
            if (collected.reason === 'changed') fail('匯出途中資料有變動，請重新匯出');
            return;
          }
          rows = collected.rows;
        } catch (err) {
          fail(messageOf(err, '匯出失敗，請稍後再試'));
          return;
        }
      }
      if (!mounted.current) return;

      const headers = [
        '會員',
        '提領金額',
        '手續費',
        '匯款金額',
        '收款銀行代號',
        '收款銀行帳號',
        '身分證字號',
        '申請時間',
        '狀態',
      ];
      const csvRows = rows.map((w) => [
        w.userName,
        w.amount + w.fee,
        w.fee,
        w.amount,
        w.bankCode ?? '未設定',
        w.bankAccount ?? '未設定',
        w.idNumber ?? '未設定',
        formatTwTimestamp(w.requestedAt),
        withdrawalStatusLabel(w.status),
      ]);

      // 逗號／引號／換行／前導 =+-@ 的跳脫走 src/utils/csv.ts（階段 2.1）——
      // 姓名帶逗號、備註帶換行都會把手刻的 join(',') 撕成錯位的欄。
      const blob = new Blob([buildCsvContent(headers, csvRows)], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `獎金提領申請_${twDayOf()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      // LINE 等內建瀏覽器的下載常無聲無息、甚至根本沒落檔，而 link.click() 偵測不到
      // ——那裡說「已匯出」可能是假成功，改成說出怎麼補救。
      reportStatus({
        tone: 'success',
        text: detectInAppBrowser().isInAppBrowser
          ? `已產生 ${rows.length} 筆，若沒收到檔案請用外部瀏覽器開啟`
          : `已匯出 ${rows.length} 筆`,
      });
    } finally {
      session.end();
      exportingRef.current = false;
      if (mounted.current) setIsExporting(false);
    }
  };

  // 載入更多完成而沒有更多了：鈕消失，焦點移到列表區（不掉到 body）。
  const wasLoadingMore = useRef(false);
  useEffect(() => {
    if (wasLoadingMore.current && !list.isLoadingMore && !list.hasMore) {
      if (!document.activeElement || document.activeElement === document.body) {
        listRef.current?.focus();
      }
    }
    wasLoadingMore.current = list.isLoadingMore;
  }, [list.isLoadingMore, list.hasMore]);

  const dataAge = (
    <DataAgeNote as="span" fetchedAt={dialogFetchedAt} now={list.now} className="mt-1 block" />
  );
  const batchTargets = batchSnapshot ?? [];

  return (
    // 手機的區塊間距 12px、桌面維持 24px:卡片列表本身就是 `space-y-3`，
    // 區塊之間卻是它的兩倍，同一頁上兩套節奏。24px × 兩個間隔在 812px 的
    // 視窗裡是純浪費，而桌面空間充裕、24px 幫助分群。
    <div className="space-y-3 sm:space-y-6">
      {viewRecord && (
        <IdCardDialog
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          onCloseAutoFocus={restoreDialogFocus}
        />
      )}

      {/* 「已匯款」與「退件」同屬金錢狀態操作，一律先確認——兩顆按鈕
          相鄰，單鍵直接執行會讓誤觸立即通知會員款項已匯出。 */}
      {paidTarget && (
        <AlertDialog open onOpenChange={() => setPaidTarget(null)}>
          <AlertDialogContent onCloseAutoFocus={restoreDialogFocus}>
            <AlertDialogHeader>
              <AlertDialogTitle>確認已完成匯款？</AlertDialogTitle>
              <AlertDialogDescription>
                {paidTarget.userName} 的提領 {paidTarget.amount} P， 匯入帳號末五碼{' '}
                {String(paidTarget.bankAccount ?? '').slice(-5) || '未提供'}。
                確認後該筆將轉為「待查收」並通知會員款項已匯出。
                {dataAge}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1 py-2">
              <Textarea
                value={bankRefInput}
                onChange={(e) => setBankRefInput(e.target.value)}
                placeholder="交易序號（選填，網銀轉出後的憑證編號）"
                aria-label="交易序號"
                rows={1}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBankRefInput('')}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = paidTarget;
                  const ref = bankRefInput.trim();
                  confirmDialog(target);
                  setPaidTarget(null);
                  setBankRefInput('');
                  if (target)
                    updateStatus(target, 'awaiting_collection', undefined, ref || undefined);
                }}
              >
                確認匯款
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {rejectTarget && (
        <AlertDialog open onOpenChange={() => closeReasonDialog()}>
          <AlertDialogContent onCloseAutoFocus={restoreDialogFocus}>
            <AlertDialogHeader>
              <AlertDialogTitle>確認退件？</AlertDialogTitle>
              <AlertDialogDescription>
                退件後，{rejectTarget.userName} 的 {rejectTarget.amount + rejectTarget.fee} P
                （含手續費）將自動退回其可提領點數。此操作無法復原。
                {dataAge}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* 理由必填：它是會員唯一會看到的說明。沒有它，被退件的人只會
                重送一模一樣的東西再被退一次。後端也強制要求（note_required）。 */}
            <div className="space-y-1 py-2">
              <Textarea
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="例：收款帳號與身分證姓名不符，請更正後重新申請"
                aria-label="退件理由"
                aria-invalid={!reasonFilled}
              />
              <FieldError error={reasonFilled ? undefined : '請填寫退件理由'} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeReasonDialog}>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={!reasonFilled}
                onClick={() => {
                  const target = rejectTarget;
                  const reason = reasonInput.trim();
                  confirmDialog(target);
                  closeReasonDialog();
                  if (target) updateStatus(target, 'rejected', reason);
                }}
              >
                確認退件
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {completeTarget && (
        <AlertDialog open onOpenChange={() => setCompleteTarget(null)}>
          <AlertDialogContent onCloseAutoFocus={restoreDialogFocus}>
            <AlertDialogHeader>
              <AlertDialogTitle>代為標記已完成？</AlertDialogTitle>
              <AlertDialogDescription>
                {completeTarget.userName} 的提領將由你代為結案。會員端會明示這是
                管理員代為完成，不會顯示成他本人查收。
                {dataAge}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* 理由必填且由 admin 自己寫：稽核要答得出「是誰、憑什麼認定會員
                已收到錢」。寫死一句固定文案只是機械滿足後端檢查。 */}
            <div className="space-y-1 py-2">
              <Textarea
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="例：2026-08-01 致電確認，會員回覆已收到款項"
                aria-label="代為結案理由"
                aria-invalid={!reasonFilled}
              />
              <FieldError error={reasonFilled ? undefined : '請填寫代為結案的理由'} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeReasonDialog}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={!reasonFilled}
                onClick={() => {
                  const target = completeTarget;
                  const reason = reasonInput.trim();
                  confirmDialog(target);
                  closeReasonDialog();
                  if (target) updateStatus(target, 'completed', reason);
                }}
              >
                確認代為完成
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 批次不可回退，所以確認框列出**受影響會員姓名**，不只給筆數與總額：
          金額相近時聚合數字不會露出異常，看到名字才會。 */}
      {batchSnapshot && (
        <AlertDialog open onOpenChange={() => setBatchSnapshot(null)}>
          <AlertDialogContent onCloseAutoFocus={restoreDialogFocus}>
            <AlertDialogHeader>
              <AlertDialogTitle>批次標記已匯款？</AlertDialogTitle>
              <AlertDialogDescription>
                以下 {batchTargets.length} 筆將轉為「待查收」，合計匯出{' '}
                {twd(batchTargets.reduce((s, w) => s + w.amount, 0))}。此操作無法復原。
                {dataAge}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="max-h-48 overflow-y-auto text-sm space-y-1 py-2">
              {batchTargets.map((w) => (
                <li key={w.id} className="flex justify-between gap-4">
                  <span>{w.userName}</span>
                  <span className="font-mono">{twd(w.amount)}</span>
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={runBatch}>確認批次匯款</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {historyRecord && (
        <Dialog open onOpenChange={() => setHistoryRecord(null)}>
          <DialogContent onCloseAutoFocus={restoreDialogFocus}>
            <DialogHeader>
              <DialogTitle>轉換歷史</DialogTitle>
              {/* 歷史讀的是點擊當下那一列內嵌的 events，與列表同齡（K5）：更新途中也能開，
                  資料時間放在說明裡，開框時報讀器會念。 */}
              <DialogDescription>
                {historyRecord.userName} 的提領處理紀錄
                {dataAge}
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 py-2 text-sm">
              {historyRecord.events.length === 0 ? (
                <li className="text-muted-foreground">尚無轉換紀錄</li>
              ) : (
                historyRecord.events.map((e) => (
                  <li key={e.createdAt} className="border-l-2 pl-3">
                    <p>
                      {withdrawalStatusLabel(e.fromStatus)} → {withdrawalStatusLabel(e.toStatus)}
                      <span className="text-muted-foreground ml-2">
                        {e.byAdmin ? '（管理員）' : '（會員本人）'}
                      </span>
                    </p>
                    {e.note && <p className="text-muted-foreground">{e.note}</p>}
                    {e.bankRef && <p className="font-mono text-xs">交易序號 {e.bankRef}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatTwTimestamp(e.createdAt)}
                    </p>
                  </li>
                ))
              )}
            </ol>
          </DialogContent>
        </Dialog>
      )}

      {/* 統計切回時是骨架、本次讀取確認後才出數字（A）：待審件數要即時，待匯款總額是對
          網銀轉出總額的依據，都不從快取顯示。失敗或逾時寫「—」。骨架是裝飾，aria-hidden。 */}
      <section aria-label="提領彙總">
        {/* 手機不是把卡片壓扁，而是**整組換成一行摘要**。壓扁過的四張卡仍佔
            153px，把第一筆記錄推到 y=677——第一屏只剩 135px，兩筆要 300px。
            admin 打開手機是為了處理那一筆，統計是背景資訊，一行就夠。
            桌面維持四張卡不動（那裡空間充裕，卡片好掃）。 */}
        {!isDesktop ? (
          confirmed || settledUnconfirmed ? (
            <dl className={SUMMARY_ROW}>
              {STAT_ITEMS.map((item, i) => (
                <div key={item.label} className="flex items-baseline gap-1">
                  <dt className="text-xs text-muted-foreground">{SUMMARY_LABELS[i]}</dt>
                  <dd className="font-bold">{confirmed && stats ? item.value(stats) : '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            // 同形骨架：同一組 flex-wrap、同樣的標籤，數值換成等寬的透明佔位字——換行與高度
            // 跟著摘要走。實測 375px 一行 46px、320px 兩行 70px；先前固定 h-14（56px）的骨架
            // 兩邊都差 10–14px，數字落地時下面整個跳一下（P2-20，test_admin_mobile_layout.py 量）。
            // 數值遠比典型值長時（七位數金額）仍可能多換一行，佔位取的是典型寬度。
            <div aria-hidden="true" className={SUMMARY_ROW}>
              {STAT_ITEMS.map((item, i) => (
                <div key={item.label} className="flex items-baseline gap-1">
                  <span className="text-xs text-muted-foreground">{SUMMARY_LABELS[i]}</span>
                  <Skeleton className="font-bold text-transparent">{item.placeholder}</Skeleton>
                </div>
              ))}
            </div>
          )
        ) : (
          <StatCardGrid>
            {STAT_ITEMS.map((item) => (
              <Card key={item.label}>
                {/* 手機把統計卡壓扁:標籤與數字同一列、內距減半。admin 打開手機是
                    為了處理那一筆，不是看儀表板——四張卡各佔 100px 高會把第一筆
                    記錄推到第一屏之外（實測 y=832 vs 視窗 812）。桌面維持原樣。
                    共用原語 StatCardGrid 不動:它也服務會員端的 RewardStats 與
                    ReferralStats，那兩處不在本 feature 範圍內。 */}
                <CardContent className="flex items-baseline justify-between gap-2 p-3 sm:block sm:p-6">
                  <p className="text-xs sm:text-sm text-muted-foreground">{item.label}</p>
                  {/* 六位數金額在 375px 的兩欄統計卡裡溢出 13px（實測）。點數是累積值、
                      前端無上限，所以縮字級而不是指望數字不會變大。 */}
                  {/* 確認了卻沒有統計（缺欄位的回應）也寫「—」，不停在骨架（P1-5）。 */}
                  {confirmed || settledUnconfirmed ? (
                    <p className="text-base sm:text-2xl font-bold">
                      {confirmed && stats ? item.value(stats) : '—'}
                    </p>
                  ) : (
                    <Skeleton aria-hidden="true" className="mt-1 h-6 w-20 sm:h-8" />
                  )}
                </CardContent>
              </Card>
            ))}
          </StatCardGrid>
        )}
      </section>

      {/* W1 同屏：admin 開著網銀打字，姓名／身分證／銀行代號／帳號／匯款金額
          必須同時在眼前。要捲動或點開才看得到，就是逼人在兩個視窗間來回對帳。
          本次讀取確認前不顯示（G）：更新中是骨架，失敗或逾時寫「暫停顯示」，複製鈕都不渲染。
          結果為空時整塊收掉。 */}
      {isDesktop && (list.isLoading || withdrawals.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>匯款作業面板</CardTitle>
            <CardDescription className="hidden sm:block">
              照這五欄打進網銀，帳號可一鍵複製
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* 五欄與手機版共用同一份 render（審查 R6）——各自手刻會長出
                兩份會各自演化的 JSX，而「手機少一欄」在桌面開發時看不見。 */}
            {confirmed && activeRecord ? (
              <>
                <WithdrawalFundingFields
                  record={activeRecord}
                  onCopyAccount={copyAccount}
                  formatAmount={twd}
                  ariaLabel="匯款作業面板"
                  className="grid gap-3 md:grid-cols-5"
                />
                <DataAgeNote fetchedAt={list.fetchedAt} now={list.now} className="mt-3" />
              </>
            ) : settledUnconfirmed ? (
              <p className="text-sm text-muted-foreground">資料未確認，暫停顯示</p>
            ) : (
              <div aria-hidden="true" className="grid gap-3 md:grid-cols-5">
                {FUNDING_FIELD_KEYS.map((key) => (
                  <Skeleton key={key} className="h-12 w-full" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        {/* 手機內距減半:工具列在 375px 實測 174px 高，其中 48px 是純內距
            （`pt-6` ＋ 原語的 `[&:last-child]:pb-6`）。桌面的留白節奏在手機
            是最貴的東西——同一個理由已經讓統計卡換成一行摘要、讓重複的
            CardHeader 收起來。
            ⚠️ `[&:last-child]:pb-6` 的 specificity 是 (0,2,0)，`p-3` 的
            (0,1,0) 蓋不掉它（同 `ui/table.tsx` 那個踩過的坑），所以下方
            內距要用同形狀的 `[&:last-child]:pb-3` 才壓得住。 */}
        <CardContent className="px-3 pt-3 [&:last-child]:pb-3 sm:px-6 sm:pt-6 sm:[&:last-child]:pb-6">
          {/* 篩選吃剩餘寬度、兩顆 icon 鈕在右，手機一行（S3 A2）。改版前三件
              平鋪靠 flex-wrap 換行，375px 下擠成兩行、斷點附近忽一行忽兩行。
              CSV 匯出是規格書 §13 明列的職責（含 2,000 筆上限），手機照樣有——
              isDesktop 是**寬度**判準，767px 的桌機視窗也會失去唯一的匯出路徑。 */}
          <AdminToolbar
            filter={
              <Select
                value={statusFilter}
                onValueChange={(next) => {
                  // 上一次的動作回報（「已匯出 N 筆」）、勾選、遮罩與「已更新 HH:mm」都屬於舊篩選，
                  // 換篩選就收掉。
                  setReport(NO_REPORT);
                  clearSelection();
                  setMaskHeld(false);
                  announcer.reset();
                  setStatusFilter(next);
                  cache?.writeView({ withdrawalStatus: next });
                }}
                disabled={isExporting}
              >
                <SelectTrigger className="w-full md:w-36">
                  <SelectValue placeholder="全部狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  {WITHDRAWAL_STATUS_VALUES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {withdrawalStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            onRefresh={manualRefresh}
            statusText={announcer.statusText}
            isUpdating={isUpdating}
            // 載入更多進行中真停用：loadMore 晚回來會把舊頁尾接到剛重設的列表上
            // （同會員頁）；這頁是批次匯款的依據，重複或錯位的列不能出現。
            refreshDisabled={list.isLoadingMore}
            onExport={downloadCSV}
            canExport={withdrawals.length > 0 && !list.isLoadingMore}
            exportGate={gate}
            exportDescribedBy={listFailedEmpty ? listErrorId : undefined}
            isExporting={isExporting}
            disabled={isExporting}
          />
          <AdminActionReport
            status={report.status}
            failure={report.failure}
            focusFailure={report.focusFailure}
            onDismiss={dismissReport}
          />
          {/* 不得靜默截斷（ui-ux-guidelines §5）：說出已顯示幾筆、總共幾筆。
              只寫「共 N 筆」會讓人以為 N 就是全部。移出工具列自成一行，
              不再參與工具列的寬度競爭。被閘的入口以 aria-describedby 指向這一行。 */}
          <AdminListStatus
            id={statusId}
            shown={withdrawals.length}
            total={total}
            state={list.isLoading ? 'loading' : listFailedEmpty ? 'hidden' : 'ready'}
            suffix={statusSuffix}
          />

          {selected.size > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-sm font-medium">已選取 {selected.size} 筆</span>
              {isDesktop && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    if (!gate.paused) {
                      openDialog(e.currentTarget, null, () => setBatchSnapshot(selectedRecords));
                    }
                  }}
                  disabled={isExporting}
                  className={PAUSED_LOOK}
                  {...pausedProps}
                >
                  批次標記已匯款
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearSelection();
                  focusList();
                }}
              >
                清除選取
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        {/* 手機隱藏:分頁標籤已經寫著「提領」，再標一次「獎金提領申請」
            是重複，而它佔掉的 70px 正是第一屏放不下第二筆的原因之一。 */}
        <CardHeader className="hidden sm:flex">
          <CardTitle>獎金提領申請</CardTitle>
          <CardDescription className="hidden sm:block">
            匯款完成後標記「已匯款」，會員確認查收後自動轉為已完成；退件會自動退回點數
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 有舊資料時的失敗或逾時：保留舊列並說出資料時間（E2）；收款資訊遮住，重試是背景重讀，
              遮罩留到本次讀取確認（A）。放在列表區外面：過期樣式的透明度不能疊到提示本身。 */}
          {notice && (
            <div ref={noticeRef} className="mb-4">
              {/* 更新中的提示也留著重試鈕（顯示進行中、按了不重送）：焦點不掉到 body。 */}
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
            aria-label="提領申請列表"
            aria-busy={updating || undefined}
            data-dimmed={dimmed ? 'true' : undefined}
            data-stale={stale ? 'true' : undefined}
            className="scroll-mt-20 transition-opacity data-[dimmed=true]:opacity-60 data-[stale=true]:opacity-[var(--stale-opacity)]"
          >
            {retryingEmpty && updating ? (
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
                label="載入提領申請中"
                variant={isDesktop ? 'rows' : 'cards'}
                message={list.isSlow ? '更新較久，仍在等待伺服器回應' : undefined}
              />
            ) : listFailedEmpty ? (
              // 三態的「錯」：說出錯在哪、給一顆重試。靜默的空表格會讓 admin
              // 以為今天沒人申請提領，而不是「沒讀到」。
              <AdminListError
                id={listErrorId}
                message={list.error ?? ''}
                retryLabel="重試"
                tone="flow"
                onRetry={retryFromError}
              />
            ) : withdrawals.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">目前沒有提領申請</p>
            ) : !isDesktop ? (
              <WithdrawalCardList
                records={withdrawals}
                activeId={activeId}
                onActivate={setActiveId}
                onCopyAccount={copyAccount}
                onOpenIdCard={(record, trigger) => {
                  if (!gate.paused) openDialog(trigger, record.id, () => setViewRecord(record));
                }}
                onOpenHistory={(record, trigger) =>
                  openDialog(trigger, record.id, () => setHistoryRecord(record))
                }
                onReject={(record, trigger) =>
                  openDialog(trigger, record.id, () => setRejectTarget(record))
                }
                onComplete={(record, trigger) =>
                  openDialog(trigger, record.id, () => setCompleteTarget(record))
                }
                processing={processing}
                actionsDisabled={isExporting}
                formatAmount={twd}
                masked={masked}
                fundingState={confirmed ? 'ready' : settledUnconfirmed ? 'paused' : 'pending'}
                idCardGate={gate}
                fetchedAt={list.fetchedAt}
                now={list.now}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* 觸控裝置上把勾選欄讓寬讓高，44px 熱區才有地方伸展。
                        熱區靠 checkbox 的負 inset 偽元素撐出來，而 Table 原語的
                        overflow-x-auto 容器會**裁掉伸出容器左緣的部分**——實測
                        左側只剩 16px 可用、可點區被削成 37px。

                        ⚠️ 只寫 pl-6 不寫 px-6:`ui/table.tsx` 的 TableHead/TableCell
                        基底帶 `[&:has([role=checkbox])]:pr-0`，specificity (0,2,0)
                        恆常生效，會蓋掉 `pointer-coarse:px-6` (0,1,0) 的
                        padding-right（實測 computed padding-right = 0px）。寫 px-6
                        會讓註解與實際行為不符——右側本來也不需要，熱區往右伸進的是
                        隔壁儲存格、不在容器邊緣。

                        垂直:表頭原語是釘死的 h-10（40px），放不下 44px（實測 44×42），
                        觸控時放大到 h-14。滑鼠裝置的密度完全不變。 */}
                    <TableHead className="w-10 pointer-coarse:pl-6 pointer-coarse:h-14">
                      <Checkbox
                        touchTarget="expanded"
                        aria-label="全選本頁的提領記錄"
                        checked={allPageSelected}
                        onCheckedChange={toggleAllOnPage}
                        className={PAUSED_LOOK}
                        {...pausedProps}
                      />
                    </TableHead>
                    <TableHead>會員</TableHead>
                    <TableHead>扣點</TableHead>
                    <TableHead>匯款金額</TableHead>
                    <TableHead>收款銀行</TableHead>
                    <TableHead>收款帳號</TableHead>
                    <TableHead>申請時間</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>身分證照片</TableHead>
                    <TableHead>歷史</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((w) => (
                    <TableRow
                      key={w.id}
                      // 程式化聚焦的落點（確認後、取消時鈕已不在）；不進 Tab 順序。
                      tabIndex={-1}
                      data-row-id={w.id}
                      className="scroll-mt-20"
                      data-state={w.id === activeRecord?.id ? 'selected' : undefined}
                      onClick={() => setActiveId(w.id)}
                    >
                      {/* 與表頭同理，見上方 TableHead 的說明 */}
                      <TableCell className="pointer-coarse:pl-6 pointer-coarse:py-4">
                        <Checkbox
                          touchTarget="expanded"
                          aria-label={`選取 ${w.userName} 的提領記錄`}
                          checked={selected.has(w.id)}
                          onCheckedChange={() => toggleOne(w.id)}
                          className={PAUSED_LOOK}
                          {...pausedProps}
                        />
                      </TableCell>
                      <TableCell>{w.userName}</TableCell>
                      {/* 扣點不遮（K6）：遮蔽只擋「照舊資料去網銀匯款」，扣點是客服回答
                          「為什麼扣我點數」用的。 */}
                      <TableCell>{w.amount + w.fee} P</TableCell>
                      <TableCell>{masked ? <HiddenValue /> : twd(w.amount)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {masked ? <HiddenValue /> : (w.bankCode ?? '-')}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {masked ? <HiddenValue /> : (w.bankAccount ?? '-')}
                      </TableCell>
                      <TableCell className="text-sm">{formatTwTimestamp(w.requestedAt)}</TableCell>
                      <TableCell>
                        <WithdrawalStatusBadge status={w.status} />
                      </TableCell>
                      <TableCell>
                        {/* 查看證件也在閘門內（K5）：簽名網址 1 小時，也是退件判斷的依據。 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            if (!gate.paused)
                              openDialog(e.currentTarget, w.id, () => setViewRecord(w));
                          }}
                          className={PAUSED_LOOK}
                          {...pausedProps}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          查看
                        </Button>
                      </TableCell>
                      <TableCell>
                        {/* 事件歷史手機也看得到（W8）：客服接到「我的錢呢」時，
                            需要的就是這條時間軸。 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) =>
                            openDialog(e.currentTarget, w.id, () => setHistoryRecord(w))
                          }
                        >
                          查看歷史
                        </Button>
                      </TableCell>
                      <TableCell>
                        {w.status === 'pending' ? (
                          <div className="flex gap-2">
                            {/* W8：只有這顆鎖在桌面——標記已匯款要同時開著網銀。 */}
                            {isDesktop && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  if (!gate.paused) {
                                    openDialog(e.currentTarget, w.id, () => setPaidTarget(w));
                                  }
                                }}
                                disabled={isExporting || processing.has(w.id)}
                                className={PAUSED_LOOK}
                                {...pausedProps}
                              >
                                標記已匯款
                              </Button>
                            )}
                            <Button
                              size="sm"
                              tone="destructive"
                              onClick={(e) =>
                                openDialog(e.currentTarget, w.id, () => setRejectTarget(w))
                              }
                              disabled={isExporting || processing.has(w.id)}
                            >
                              退件
                            </Button>
                          </div>
                        ) : w.status === 'awaiting_collection' ? (
                          <Button
                            size="sm"
                            tone="secondary"
                            onClick={(e) =>
                              openDialog(e.currentTarget, w.id, () => setCompleteTarget(w))
                            }
                            disabled={isExporting || processing.has(w.id)}
                          >
                            代為完成
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {withdrawals.length > 0 && list.hasMore && (
              <div className="space-y-2 pt-4 text-center">
                {/* 載入中與未確認時改 aria-disabled（不用原生 disabled）：焦點留在鈕上、不掉到
                    body。未確認的停用外觀與原因跟閘門同一個 0.3 秒判準（P1-4）——只擋不灰的話，
                    手機上按了沒反應也看不出原因。匯出期間照舊原生 disabled。載入更多失敗時原因
                    寫在同一行，已顯示的列保留。 */}
                <Button
                  tone="secondary"
                  onClick={() => {
                    if (list.canLoadMore) void list.loadMore();
                  }}
                  aria-disabled={!list.canLoadMore || undefined}
                  aria-describedby={loadMoreNote ? loadMoreNoteId : undefined}
                  data-paused={unconfirmedLook ? 'true' : undefined}
                  className={PAUSED_LOOK}
                  disabled={isExporting}
                >
                  {list.isLoadingMore ? '載入中…' : '載入更多'}
                </Button>
                {loadMoreNote && (
                  <p
                    id={loadMoreNoteId}
                    // 載入更多失敗以 alert 說出——焦點停在鈕上的人要聽得到（業主 Q7）；未確認的
                    // 原因只是說明，不打斷。
                    role={unconfirmedLook ? undefined : 'alert'}
                    className="text-sm text-muted-foreground"
                  >
                    {loadMoreNote}
                  </p>
                )}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
