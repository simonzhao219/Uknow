import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Copy, Download, Eye, RefreshCw } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { WithdrawalCardList } from './WithdrawalCardList';
import { WithdrawalFundingFields } from './WithdrawalFundingFields';
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
import { StatCardGrid } from '../ui/stat-card-grid';
import type {
  AdminWithdrawalRecord,
  AdminWithdrawalStats,
  AdminWithdrawalsResponse,
} from '@contract';

// 提領生命週期（與後端 SQL 函數一致）：
//   pending（待處理）→ awaiting_collection（已匯款，待查收）
//                   → completed（用戶已確認查收）
//   pending → rejected（退件，點數自動退回）
const STATUS_LABEL: Record<string, string> = {
  pending: '待處理',
  awaiting_collection: '待查收',
  completed: '已完成',
  rejected: '已退件',
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">待處理</Badge>;
    case 'awaiting_collection':
      return <Badge className="bg-orange-500">待查收</Badge>;
    case 'completed':
      return <Badge variant="outline">已完成</Badge>;
    case 'rejected':
      return <Badge variant="destructive">已退件</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

interface IdCardDialogProps {
  record: AdminWithdrawalRecord;
  onClose: () => void;
}

function IdCardDialog({ record, onClose }: IdCardDialogProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      {/* P5:max-w-3xl 經 twMerge 會蓋掉 dialog 原語的行動端護欄
          `max-w-[calc(100%-2rem)]`（ui/dialog.tsx:41），安全邊距歸零、對話框
          貼齊螢幕邊緣。實測**沒有**溢出（w-full 在 fixed 元素上已依視窗定寬
          375px，max-w-3xl 比它大所以不生效），所以「有沒有水平捲軸」永遠測
          不出這個退化——要量盒子與視窗邊界的間距。 */}
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
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
          <Button onClick={onClose}>關閉</Button>
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

const EMPTY_STATS: AdminWithdrawalStats = {
  pendingAmount: 0,
  byStatus: { pending: 0, awaiting_collection: 0, completed: 0, rejected: 0 },
};

const twd = (n: number) => `$${n.toLocaleString('en-US')}`;

// 動作完成後的回報。刻意**留在畫面上**而不是彈個 toast 就消失：admin 做完
// 一筆會切去網銀，回來時 toast 早就沒了，於是不確定剛才那下到底送出去沒有。
const ACTION_DONE: Record<string, string> = {
  awaiting_collection: '已標記匯款完成',
  rejected: '已退件',
  completed: '已代為結案',
};

export function WithdrawalManagement({
  loadWithdrawals,
  updateStatus: submitStatus,
  batchMarkPaid,
}: WithdrawalManagementProps) {
  // W8：「標記已匯款」需要同時開著網銀，手機上做不到，所以鎖在桌面。
  // 退件與代為完成不鎖——那是客服接到電話當下就該能處理的事。
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AdminWithdrawalStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewRecord, setViewRecord] = useState<AdminWithdrawalRecord | null>(null);
  const [historyRecord, setHistoryRecord] = useState<AdminWithdrawalRecord | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdminWithdrawalRecord | null>(null);
  const [paidTarget, setPaidTarget] = useState<AdminWithdrawalRecord | null>(null);
  const [completeTarget, setCompleteTarget] = useState<AdminWithdrawalRecord | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  // 退件與代為結案的理由。後端對這兩個轉換強制要求非空 note（btrim 後為空
  // 也算沒填），所以沒有輸入欄＝那顆按鈕在正式環境每次都 400。
  const [reasonInput, setReasonInput] = useState('');
  // 交易序號選填（需求方裁決）：網銀不一定當下給得出來，強制必填會逼 admin
  // 亂填。但它是唯一能跟銀行對帳的錨點，所以要有地方可以填。
  const [bankRefInput, setBankRefInput] = useState('');

  // R7:useMediaQuery 是即時訂閱 change 事件的，視窗跨過 768px 會即時重渲染
  // 成另一套版面。Q2 裁決手機不渲染勾選框，但 `selected` 不會自己消失——
  // 「已選取 N 筆」橫幅還在、卻沒有任何逐筆取消的入口。不會寫壞資料（批次
  // 動作仍鎖在 isDesktop 之後），但那是一個看得到、動不了的殭屍狀態。
  useEffect(() => {
    if (!isDesktop) setSelected(new Set());
  }, [isDesktop]);

  const fetchWithdrawals = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await loadWithdrawals({ status: statusFilter, limit: PAGE_SIZE, offset: 0 });
      const rows = data.withdrawals ?? [];
      setWithdrawals(rows);
      // 缺欄位就退回保守值，不要讓它變成 undefined 再往下讀。這一段是 e2e
      // 教出來的：舊 mock 不回 total／stats，`stats.pendingAmount` 直接擲錯，
      // 而 WithdrawalManagement 是 AdminDashboard 的預設分頁——一個面板的
      // payload 形狀不合，**五個分頁一起打不開**。爆炸半徑不該這麼大。
      setTotal(data.total ?? rows.length);
      setStats(data.stats ?? EMPTY_STATS);
      // 換一批資料就清掉勾選：留著會讓「已選取 N 筆」指向畫面上已經不存在
      // 的列，而下一步是不可回退的批次匯款。
      setSelected(new Set());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '無法取得提領申請');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const data = await loadWithdrawals({
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: withdrawals.length,
      });
      setWithdrawals((prev) => [...prev, ...(data.withdrawals ?? [])]);
      setTotal((prev) => data.total ?? prev);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '無法取得提領申請');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 作業面板預設盯著第一筆：admin 開著網銀時，面板必須一進畫面就有內容，
  // 而不是先點一下才出現。
  const activeRecord = withdrawals.find((w) => w.id === activeId) ?? withdrawals[0] ?? null;
  const selectedRecords = withdrawals.filter((w) => selected.has(w.id));
  const pageIds = withdrawals.map((w) => w.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleAllOnPage = () => {
    // 「全選」= 這一頁，不是整個篩選結果。悄悄擴大到未載入的頁，等於使用者
    // 以為勾了 2 筆、實際送出 37 筆——而批次匯款不可回退。
    setSelected(allPageSelected ? new Set() : new Set(pageIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runBatch = async () => {
    const items = selectedRecords.map((w) => ({ id: w.id }));
    setBatchOpen(false);
    try {
      const result = await batchMarkPaid(items);
      // **先重抓，再報告。** 反過來寫的話 fetchWithdrawals 的 setLoadError(null)
      // 會把剛寫上去的訊息清掉——admin 做完 12 筆、其中 1 筆失敗，畫面卻什麼
      // 都不說，他會以為全部成功。批次不可回退，那筆漏掉的不會自己浮出來。
      await fetchWithdrawals();
      if (result.failed.length) {
        setLoadError(`${result.succeeded.length} 筆成功、${result.failed.length} 筆失敗`);
      } else {
        setActionMessage(`已標記匯款完成：${result.succeeded.length} 筆`);
      }
      return;
    } catch (err) {
      await fetchWithdrawals();
      setLoadError(err instanceof Error ? err.message : '批次標記失敗');
    }
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
    setProcessingId(record.id);
    setActionMessage(null);
    try {
      await submitStatus(record.id, status, note, bankRef);
      setActionMessage(`${ACTION_DONE[status]}：${record.userName}`);
      await fetchWithdrawals();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '狀態更新失敗');
    } finally {
      setProcessingId(null);
    }
  };

  const downloadCSV = async () => {
    // W6：匯出的是**符合當前篩選的全部資料**，不是畫面上已載入的那幾列。
    // 給半份比明示拒絕糟得多——對帳是拿這份檔案去比銀行的轉出紀錄，少的
    // 那幾筆不會自己浮出來。超過上限就明說，並告訴 admin 怎麼縮小範圍。
    if (total > CSV_MAX_ROWS) {
      setActionMessage(null);
      setLoadError(
        `本次篩選有 ${total} 筆，超過匯出上限 ${CSV_MAX_ROWS} 筆。` +
          `請縮小日期範圍或狀態篩選後再匯出。`,
      );
      return;
    }

    let rows: AdminWithdrawalRecord[] = withdrawals;
    if (withdrawals.length < total) {
      try {
        const collected: AdminWithdrawalRecord[] = [];
        // **依實際回傳筆數前進，不是依要求的 limit。** 伺服器可以回得比要求的
        // 少（上限被夾、篩選期間資料變動），照固定步長跳就會靜默跳過那幾筆
        // ——而那正是這條修復想根除的「安靜地少給」。
        while (collected.length < total) {
          const data = await loadWithdrawals({
            status: statusFilter,
            limit: PAGE_SIZE,
            offset: collected.length,
          });
          const batch = data.withdrawals ?? [];
          if (batch.length === 0) break; // 回空頁就停，避免無限迴圈
          collected.push(...batch);
        }
        rows = collected;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '匯出失敗，請稍後再試');
        return;
      }
    }

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
      STATUS_LABEL[w.status] ?? w.status,
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
  };

  return (
    <div className="space-y-6">
      {viewRecord && <IdCardDialog record={viewRecord} onClose={() => setViewRecord(null)} />}

      {/* 「已匯款」與「退件」同屬金錢狀態操作，一律先確認——兩顆按鈕
          相鄰，單鍵直接執行會讓誤觸立即通知會員款項已匯出。 */}
      {paidTarget && (
        <AlertDialog open onOpenChange={() => setPaidTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認已完成匯款？</AlertDialogTitle>
              <AlertDialogDescription>
                {paidTarget.userName} 的提領 {paidTarget.amount} P， 匯入帳號末五碼{' '}
                {String(paidTarget.bankAccount ?? '').slice(-5) || '未提供'}。
                確認後該筆將轉為「待查收」並通知會員款項已匯出。
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認退件？</AlertDialogTitle>
              <AlertDialogDescription>
                退件後，{rejectTarget.userName} 的 {rejectTarget.amount + rejectTarget.fee} P
                （含手續費）將自動退回其可提領點數。此操作無法復原。
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
                disabled={!reasonFilled}
                onClick={() => {
                  const target = rejectTarget;
                  const reason = reasonInput.trim();
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>代為標記已完成？</AlertDialogTitle>
              <AlertDialogDescription>
                {completeTarget.userName} 的提領將由你代為結案。會員端會明示這是
                管理員代為完成，不會顯示成他本人查收。
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
      {batchOpen && (
        <AlertDialog open onOpenChange={() => setBatchOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>批次標記已匯款？</AlertDialogTitle>
              <AlertDialogDescription>
                以下 {selectedRecords.length} 筆將轉為「待查收」，合計匯出{' '}
                {twd(selectedRecords.reduce((s, w) => s + w.amount, 0))}。此操作無法復原。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="max-h-48 overflow-y-auto text-sm space-y-1 py-2">
              {selectedRecords.map((w) => (
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>轉換歷史</DialogTitle>
              <DialogDescription>{historyRecord.userName} 的提領處理紀錄</DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 py-2 text-sm">
              {historyRecord.events.length === 0 ? (
                <li className="text-muted-foreground">尚無轉換紀錄</li>
              ) : (
                historyRecord.events.map((e) => (
                  <li key={e.createdAt} className="border-l-2 pl-3">
                    <p>
                      {STATUS_LABEL[e.fromStatus] ?? e.fromStatus} →{' '}
                      {STATUS_LABEL[e.toStatus] ?? e.toStatus}
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

      {actionMessage && (
        <div
          role="status"
          className="flex items-center justify-between rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"
        >
          <span>{actionMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionMessage(null)}>
            知道了
          </Button>
        </div>
      )}

      <section aria-label="提領彙總">
        {/* 手機不是把卡片壓扁，而是**整組換成一行摘要**。壓扁過的四張卡仍佔
            153px，把第一筆記錄推到 y=677——第一屏只剩 135px，兩筆要 300px。
            admin 打開手機是為了處理那一筆，統計是背景資訊，一行就夠。
            桌面維持四張卡不動（那裡空間充裕，卡片好掃）。 */}
        {!isDesktop ? (
          <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
            <div className="flex items-baseline gap-1">
              <dt className="text-xs text-muted-foreground">待匯款</dt>
              <dd className="font-bold">{twd(stats.pendingAmount)}</dd>
            </div>
            <div className="flex items-baseline gap-1">
              <dt className="text-xs text-muted-foreground">待處理</dt>
              <dd className="font-bold">{stats.byStatus.pending}</dd>
            </div>
            <div className="flex items-baseline gap-1">
              <dt className="text-xs text-muted-foreground">待查收</dt>
              <dd className="font-bold">{stats.byStatus.awaiting_collection}</dd>
            </div>
            <div className="flex items-baseline gap-1">
              <dt className="text-xs text-muted-foreground">已完成</dt>
              <dd className="font-bold">{stats.byStatus.completed}</dd>
            </div>
          </dl>
        ) : (
          <StatCardGrid>
            {/* 待匯款總額用 amount（銀行實付），不含平台收的手續費——admin 拿這個
            數字去對網銀的轉出總額，混進手續費就對不起來。 */}
            <Card>
              {/* 手機把統計卡壓扁:標籤與數字同一列、內距減半。admin 打開手機是
                為了處理那一筆，不是看儀表板——四張卡各佔 100px 高會把第一筆
                記錄推到第一屏之外（實測 y=832 vs 視窗 812）。桌面維持原樣。
                共用原語 StatCardGrid 不動:它也服務會員端的 RewardStats 與
                ReferralStats，那兩處不在本 feature 範圍內。 */}
              <CardContent className="flex items-baseline justify-between gap-2 p-3 sm:block sm:p-6">
                <p className="text-xs sm:text-sm text-muted-foreground">待匯款總額</p>
                {/* 六位數金額在 375px 的兩欄統計卡裡溢出 13px（實測）。點數是累積值、
                  前端無上限，所以縮字級而不是指望數字不會變大。 */}
                <p className="text-base sm:text-2xl font-bold">{twd(stats.pendingAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-baseline justify-between gap-2 p-3 sm:block sm:p-6">
                <p className="text-xs sm:text-sm text-muted-foreground">待處理</p>
                <p className="text-base sm:text-2xl font-bold">{stats.byStatus.pending}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-baseline justify-between gap-2 p-3 sm:block sm:p-6">
                <p className="text-xs sm:text-sm text-muted-foreground">待查收</p>
                <p className="text-base sm:text-2xl font-bold">
                  {stats.byStatus.awaiting_collection}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-baseline justify-between gap-2 p-3 sm:block sm:p-6">
                <p className="text-xs sm:text-sm text-muted-foreground">已完成</p>
                <p className="text-base sm:text-2xl font-bold">{stats.byStatus.completed}</p>
              </CardContent>
            </Card>
          </StatCardGrid>
        )}
      </section>

      {/* W1 同屏：admin 開著網銀打字，姓名／身分證／銀行代號／帳號／匯款金額
          必須同時在眼前。要捲動或點開才看得到，就是逼人在兩個視窗間來回對帳。 */}
      {isDesktop && activeRecord && (
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
            <WithdrawalFundingFields
              record={activeRecord}
              onCopyAccount={copyAccount}
              formatAmount={twd}
              ariaLabel="匯款作業面板"
              className="grid gap-3 md:grid-cols-5"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {/* P3:375px 下 Select(w-36) + 兩顆按鈕 + 筆數擠成一列（實測 +95px）。
              flex-wrap 讓它們換行，筆數在手機自己成一列。 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="全部狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  <SelectItem value="pending">待處理</SelectItem>
                  <SelectItem value="awaiting_collection">待查收</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="rejected">已退件</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchWithdrawals} disabled={isLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                重新整理
              </Button>
              {/* 不用 isDesktop 閘掉:曾經以「手機下載試算表沒有下一步」為由
                  只留桌面，但那既不在規劃書裡、也沒有任何 reviewer 看過，而且
                  isDesktop 是**寬度**判準（Q4 已裁決不改成觸控偵測）——767px 的
                  桌機視窗、分割畫面、高縮放比都會失去唯一的匯出路徑。
                  CSV 匯出是規格書 §13 明列的職責（連 2,000 筆上限都寫進規格），
                  要移除得走 §6 的開放問題流程並同步改規格書，不是一行註解。
                  實測放回來零代價:工具列 36→76px（flex-wrap 自己換行、無溢出），
                  第一筆提領卡仍在第一屏內。 */}
              <Button
                variant="default"
                size="sm"
                onClick={downloadCSV}
                disabled={!withdrawals.length}
              >
                <Download className="h-4 w-4 mr-2" />
                下載CSV
              </Button>
            </div>
            {/* 不得靜默截斷（ui-ux-guidelines §5）：說出已顯示幾筆、總共幾筆。
                只寫「共 N 筆」會讓人以為 N 就是全部。 */}
            <p className="text-sm text-muted-foreground">
              已顯示 {withdrawals.length} / {total} 筆
            </p>
          </div>

          {selected.size > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-sm font-medium">已選取 {selected.size} 筆</span>
              {isDesktop && (
                <Button size="sm" onClick={() => setBatchOpen(true)}>
                  批次標記已匯款
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                清除選取
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        {/* 手機隱藏:分頁標籤已經寫著「獎金提領管理」，再標一次「獎金提領申請」
            是重複，而它佔掉的 70px 正是第一屏放不下第二筆的原因之一。 */}
        <CardHeader className="hidden sm:flex">
          <CardTitle>獎金提領申請</CardTitle>
          <CardDescription className="hidden sm:block">
            匯款完成後標記「已匯款」，會員確認查收後自動轉為已完成；退件會自動退回點數
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div role="status" aria-label="載入提領申請中" className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : loadError ? (
            // 三態的「錯」：說出錯在哪、給一顆重試。靜默的空表格會讓 admin
            // 以為今天沒人申請提領，而不是「沒讀到」。
            <div className="py-12 text-center space-y-3">
              <p className="text-destructive">{loadError}</p>
              <Button variant="outline" onClick={fetchWithdrawals}>
                重試
              </Button>
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">目前沒有提領申請</p>
          ) : !isDesktop ? (
            <WithdrawalCardList
              records={withdrawals}
              activeId={activeId}
              onActivate={setActiveId}
              onCopyAccount={copyAccount}
              onOpenIdCard={setViewRecord}
              onOpenHistory={setHistoryRecord}
              onReject={setRejectTarget}
              onComplete={setCompleteTarget}
              processingId={processingId}
              statusBadge={getStatusBadge}
              formatAmount={twd}
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
                      />
                    </TableCell>
                    <TableCell>{w.userName}</TableCell>
                    <TableCell>{w.amount + w.fee} P</TableCell>
                    <TableCell>{twd(w.amount)}</TableCell>
                    <TableCell className="font-mono text-sm">{w.bankCode ?? '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{w.bankAccount ?? '-'}</TableCell>
                    <TableCell className="text-sm">{formatTwTimestamp(w.requestedAt)}</TableCell>
                    <TableCell>{getStatusBadge(w.status)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setViewRecord(w)}>
                        <Eye className="h-4 w-4 mr-1" />
                        查看
                      </Button>
                    </TableCell>
                    <TableCell>
                      {/* 事件歷史手機也看得到（W8）：客服接到「我的錢呢」時，
                          需要的就是這條時間軸。 */}
                      <Button variant="ghost" size="sm" onClick={() => setHistoryRecord(w)}>
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
                              onClick={() => setPaidTarget(w)}
                              disabled={processingId === w.id}
                            >
                              標記已匯款
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectTarget(w)}
                            disabled={processingId === w.id}
                          >
                            退件
                          </Button>
                        </div>
                      ) : w.status === 'awaiting_collection' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCompleteTarget(w)}
                          disabled={processingId === w.id}
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

          {!isLoading && !loadError && withdrawals.length < total && (
            <div className="pt-4 text-center">
              <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? '載入中…' : '載入更多'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
