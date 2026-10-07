import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Skeleton } from '../ui/skeleton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { FieldError } from '../../utils/formHelpers';
import type { AdminIdReview } from '@contract';
import { type AdminCache, adminQuery } from './adminCache';
import { type AdminBusy, NOOP_BUSY } from './adminBusy';
import { BreakableEmail } from '../common/BreakableEmail';
import { AdminActionReport } from './AdminActionReport';
import { AdminListError } from './AdminListError';
import { AdminListStatus } from './AdminListStatus';
import { AdminStaleNotice, type AdminStaleNoticeProps } from './AdminStaleNotice';
import { formatDataAge } from './DataAgeNote';
import { runAdminWrite } from './adminWrite';
import { UNKNOWN_OUTCOME } from './writeOutcome';
import { REVALIDATE_DIM_DELAY_MS, useAdminList, useDelayedFlag } from './useAdminList';
import { memberLabel } from './memberName';
import { PAUSED_LOOK } from './remittanceGate';

export interface IdReviewQueueProps {
  /** 取回審核佇列。注入而非直接呼叫 apiClient——與 ReferralTreeView 同慣例。 */
  loadReviews: (params: {
    limit: number;
    offset: number;
  }) => Promise<{ reviews: AdminIdReview[]; total: number }>;
  /** 送出審核結果。退回時 reason 必填。 */
  submitReview: (userId: string, approve: boolean, reason?: string) => Promise<void>;
  /** 後台記憶體快取：佇列不快取（槽恆為 null），拿 store 只為了讀取回 403 時整體清空。 */
  cache?: AdminCache;
  /** 寫入在途時鎖分頁（含會員區的子分頁，T14）。 */
  busy?: AdminBusy;
}

const QUEUE_PAGE_SIZE = 50;

/** 佇列上方的動作回報（同提領頁，ui-ux §4.3）：成功放狀態容器，失敗放錯誤區。 */
interface Report {
  status: { tone: 'success' | 'warning'; text: string } | null;
  failure: string | null;
  /** 這個失敗屬於剛按下的那個動作：捲進視線並取得焦點。晚到的不搶。 */
  focusFailure: boolean;
}

const NO_REPORT: Report = { status: null, failure: null, focusFailure: false };

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export function IdReviewQueue({
  loadReviews,
  submitReview,
  cache,
  busy = NOOP_BUSY,
}: IdReviewQueueProps) {
  const statusId = useId();
  const listErrorId = useId();
  const loadMoreNoteId = useId();
  const queueRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminIdReview | null>(null);
  const [reason, setReason] = useState('');
  // 寫入在途的卡，可以同時有好幾張：先回來的那張不能把另一張的處理中一起解開。
  const [processing, setProcessing] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<Report>(NO_REPORT);
  // 每個動作開始時取號；失敗時號碼還是最新的，才算「剛按下的」。
  const actionSeq = useRef(0);
  // 退回確認框沒有 Trigger（Radix 關閉時只會把焦點還給 Trigger，沒有就掉到 body）：取消或 Esc
  // 時焦點還給開框的退回鈕，鈕已不在→該卡；確認時落在該卡。
  const rejectFocus = useRef<{ trigger: HTMLElement | null; id: string; confirmed: boolean }>({
    trigger: null,
    id: '',
    confirmed: false,
  });
  // 送出後焦點落在的那張卡；它因重讀離開佇列時移到下一張→上一張→佇列區（ui-ux §4.3 焦點後備）。
  const cardFocus = useRef<{ id: string; index: number } | null>(null);

  // 佇列不快取（即時資料，也是通過／退回的依據）：槽恆為 null，切回照舊出骨架；拿 store 只為了
  // 讀取回 403 時整體清空。分頁照舊：後端一頁預設 50 筆，backfill 上線當日佇列就可能超過——看不到
  // 總數的 admin 會以為「今天審完了」，那正是 ui-ux-guidelines §5「不得靜默截斷」要防的情況。
  const list = useAdminList<AdminIdReview>({
    cache,
    query: adminQuery.idReviews(),
    pageSize: QUEUE_PAGE_SIZE,
    load: async (_params, { limit, offset }) => {
      const data = await loadReviews({ limit, offset });
      return { items: data.reviews ?? [], total: data.total };
    },
  });
  const rows = list.items;
  const updating = list.isLoading || list.isRevalidating;
  const failed = list.error !== null;
  // 有舊列時的失敗或逾時：保留本次掛載的舊列並說出資料時間（E2）。
  const stale = rows.length > 0 && (failed || list.isSlow);
  const listFailedEmpty = failed && rows.length === 0;
  // 更新中的淡化延遲 0.3 秒才出現、離開立即；失敗與逾時是靜態狀態，立即顯示。
  const dimmed = useDelayedFlag(updating && !list.isSlow, REVALIDATE_DIM_DELAY_MS);
  // 未確認時載入更多按不出去（舊列後面不接新頁）；外觀與原因跟淡化同一個 0.3 秒判準。通過與退回
  // 不受閘門約束（D）：後端狀態機擋不合法的轉換。
  const unconfirmedLook = !list.isConfirmed && (dimmed || failed || list.isSlow);
  const statusSuffix = unconfirmedLook ? (failed ? '更新失敗' : '更新中') : undefined;

  const focusQueue = () => queueRef.current?.focus();
  const focusCard = (id: string) => {
    const cards = queueRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [];
    const card = Array.from(cards).find((el) => el.dataset.rowId === id);
    (card ?? queueRef.current)?.focus();
  };

  // 換一批資料（接受的落地）時，剛審完的那張卡若因這次重讀離開佇列，焦點移到下一張。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 資料版本一變就做，本身就是觸發條件
  useEffect(() => {
    const pending = cardFocus.current;
    if (!pending || list.dataVersion === 0) return;
    cardFocus.current = null;
    if (rows.some((r) => r.userId === pending.id)) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = rows[pending.index] ?? rows[pending.index - 1];
    if (next) focusCard(next.userId);
    else focusQueue();
  }, [list.dataVersion]);

  // 重試期間錯誤區或陳舊提示留在原位、改寫「正在更新…」（焦點留在鈕上、不掉到 body）；結算後若
  // 被佇列取代，焦點移到佇列區。沒有工具列：沒有「已更新 HH:mm」的狀態文字，提示本身就是回饋。
  const [retrying, setRetrying] = useState<'notice' | 'empty' | null>(null);
  const retryHadFocus = useRef(false);
  useEffect(() => {
    if (updating) return;
    setRetrying(null);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (retryHadFocus.current && lost) queueRef.current?.focus();
    retryHadFocus.current = false;
  }, [updating]);

  // 載入更多完成而沒有更多了：鈕消失，焦點移到佇列區（不掉到 body；同提領頁）。
  const wasLoadingMore = useRef(false);
  useEffect(() => {
    if (wasLoadingMore.current && !list.isLoadingMore && !list.hasMore) {
      if (!document.activeElement || document.activeElement === document.body) {
        queueRef.current?.focus();
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
        announce: !report.failure,
      }
    : retrying === 'notice' && updating && rows.length > 0
      ? { kind: 'updating', age }
      : null;
  const retry = (from: 'notice' | 'empty') => {
    const region = from === 'notice' ? noticeRef.current : document.getElementById(listErrorId);
    retryHadFocus.current = !!region?.contains(document.activeElement);
    setRetrying(from);
    void list.reload();
  };

  // 動作結算併進目前的回報：狀態換新、失敗累加——同時在途的另一張卡寫下的失敗不能被蓋掉。
  const reportStatus = (text: string) =>
    setReport((r) => ({ ...r, status: { tone: 'success', text } }));
  const reportFailure = (text: string, seq: number) =>
    setReport((r) => ({
      ...r,
      failure: r.failure ? `${r.failure}；${text}` : text,
      focusFailure: seq === actionSeq.current,
    }));
  const dismissReport = () => {
    setReport(NO_REPORT);
    focusQueue();
  };

  // 寫入走 runAdminWrite（不入失效表：佇列不快取，審核狀態只在不快取的詳情裡）。成功重讀佇列；
  // 失敗——後端拒絕或結果不明——印在佇列上方的錯誤區，同樣重讀一次（E4），佇列回到真實狀態。
  const act = async (target: AdminIdReview, approve: boolean, why?: string) => {
    const seq = ++actionSeq.current;
    const name = memberLabel(target);
    cardFocus.current = {
      id: target.userId,
      index: rows.findIndex((r) => r.userId === target.userId),
    };
    setProcessing((prev) => new Set(prev).add(target.userId));
    setReport(NO_REPORT);
    await runAdminWrite({
      busy,
      cache,
      event: null,
      submit: () => submitReview(target.userId, approve, why),
      settle: (outcome) => {
        setProcessing((prev) => {
          const next = new Set(prev);
          next.delete(target.userId);
          return next;
        });
        if (outcome.kind === 'done') {
          reportStatus(`${approve ? '已通過' : '已退回'}：${name}`);
        } else {
          reportFailure(
            outcome.kind === 'unknown'
              ? UNKNOWN_OUTCOME.idReview(name)
              : `${name}：${messageOf(outcome.error, '審核送出失敗')}`,
            seq,
          );
        }
      },
      reload: () => list.reload(),
    });
  };

  const approve = (target: AdminIdReview) => {
    // 送出後焦點落在該卡：被按的鈕送出中是停用的，留在它身上等於掉到 body。
    focusCard(target.userId);
    void act(target, true);
  };

  const restoreRejectFocus = (event: Event) => {
    event.preventDefault();
    const { trigger, id, confirmed } = rejectFocus.current;
    rejectFocus.current.confirmed = false;
    if (!confirmed && trigger?.isConnected && !trigger.hasAttribute('disabled')) trigger.focus();
    else focusCard(id);
  };

  // btrim 後為空不算填了理由，與後端 admin_review_id 的判準一致。
  // 兩邊不一致的話會是「前端放行、後端擋下」，admin 看到一個沒說清楚的失敗。
  const reasonFilled = reason.trim().length > 0;

  return (
    <div className="space-y-4">
      {rejectTarget && (
        <AlertDialog
          open
          onOpenChange={() => {
            setRejectTarget(null);
            setReason('');
          }}
        >
          <AlertDialogContent onCloseAutoFocus={restoreRejectFocus}>
            <AlertDialogHeader>
              <AlertDialogTitle>退回 {memberLabel(rejectTarget)} 的證件</AlertDialogTitle>
              <AlertDialogDescription>
                理由會直接顯示給會員。寫得具體一點，他才知道要改什麼——
                只寫「不符規定」的話，他會重送一模一樣的照片。
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-1">
              <label htmlFor="reject-reason" className="text-sm font-medium">
                退回理由
              </label>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例如：背面反光，出生年月日看不清楚"
                aria-invalid={!reasonFilled}
                aria-describedby="reject-reason-error"
              />
              {/* 只把送出鍵變灰不說原因是既有的 a11y 反模式，新元件不再添這筆債。 */}
              <FieldError
                id="reject-reason-error"
                error={reasonFilled ? undefined : '請填寫退回理由'}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={!reasonFilled || processing.has(rejectTarget.userId)}
                onClick={() => {
                  const target = rejectTarget;
                  const why = reason.trim();
                  rejectFocus.current.confirmed = true;
                  setRejectTarget(null);
                  setReason('');
                  void act(target, false, why);
                }}
              >
                確認退回
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 佇列上方的回報（ui-ux §4.3）：狀態容器常駐（live region 要先在才念得出來，業主裁決 B）、
          失敗只在有內容時渲染。 */}
      <AdminActionReport
        status={report.status}
        failure={report.failure}
        focusFailure={report.focusFailure}
        onDismiss={dismissReport}
      />

      {/* 有舊列時的失敗或逾時：保留本次掛載的舊列並說出資料時間（E2）。沒有工具列，逾時的提示也附
          重試。放在佇列區外面：過期樣式的透明度不能疊到提示本身。 */}
      {notice && (
        <div ref={noticeRef}>
          <AdminStaleNotice {...notice} onRetry={() => retry('notice')} announceUpdating />
        </div>
      )}

      {/* 更新中 aria-busy，0.3 秒後才淡化（快網路不閃）；失敗與逾時改用固定的過期樣式。 */}
      <section
        ref={queueRef}
        tabIndex={-1}
        aria-label="證件審核佇列"
        aria-busy={updating || undefined}
        data-dimmed={dimmed ? 'true' : undefined}
        data-stale={stale ? 'true' : undefined}
        className="scroll-mt-20 space-y-4 transition-opacity data-[dimmed=true]:opacity-60 data-[stale=true]:opacity-[var(--stale-opacity)]"
      >
        {/* 重試途中留在原位：判「更新中」而不是「載入中」——有過資料但清單為空之後的失敗（兩張卡
            並發，第一次重讀回空、第二次失敗）重試時不在載入中，會閃出空狀態（同其他四頁）。 */}
        {retrying === 'empty' && updating ? (
          <AdminListError
            id={listErrorId}
            message=""
            retrying
            announceUpdating
            retryLabel="重試"
            tone="flow"
            onRetry={() => retry('empty')}
          />
        ) : list.isLoading ? (
          <>
            {/* 骨架形狀不動（大圖卡）；慢更新的說明放在 output 外面：busy 的 live region 暫不播報新增
                的文字。 */}
            <output aria-label="載入審核佇列中" aria-busy="true" className="block space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </output>
            {list.isSlow && (
              <p className="text-sm text-muted-foreground">更新較久，仍在等待伺服器回應</p>
            )}
          </>
        ) : listFailedEmpty ? (
          // 整區載入失敗時唯一的出路＝流程鈕，與提領台的重試一致（§12.11）；中性字（§13 第 4 條）。
          <AdminListError
            id={listErrorId}
            message="無法取得審核佇列"
            retryLabel="重試"
            tone="flow"
            onRetry={() => retry('empty')}
          />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              {/* 空態要說得出口——空白畫面會讓 admin 分不出「沒事做」與「壞了」。 */}
              <p className="text-center text-muted-foreground">目前沒有待審核的證件</p>
            </CardContent>
          </Card>
        ) : (
          rows.map((r) => {
            const label = memberLabel(r);
            return (
              <Card
                key={r.userId}
                role="group"
                aria-label={`${label} 的證件`}
                // 程式化聚焦的落點（送出後、取消時鈕已不在）；不進 Tab 順序。
                tabIndex={-1}
                data-row-id={r.userId}
                className="scroll-mt-20"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{label}</CardTitle>
                  <CardDescription>
                    <BreakableEmail email={r.email} />
                    {r.phone ? ` ｜ ${r.phone}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 大圖而非縮圖：審核的實質工作就是看清楚證件上的字。 */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ['正面', r.idCardFrontUrl],
                        ['反面', r.idCardBackUrl],
                      ] as const
                    ).map(([side, url]) => (
                      <div key={side} className="space-y-1">
                        <p className="text-xs text-muted-foreground">身分證{side}</p>
                        {url ? (
                          <img
                            src={url}
                            alt={`${label} 的身分證${side}`}
                            className="w-full h-auto rounded-lg border"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
                            未上傳
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 「退回」在左、「通過」在右（§12.11 次要左、主要右）；手機兩顆等寬，桌機卡尾靠右
                      （業主裁決 C）。通過沒有確認框、退回有——憑舊位置操作的人可能一觸誤通過，PR 描述
                      與驗收清單另註明。 */}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <Button
                      tone="destructive"
                      disabled={processing.has(r.userId)}
                      onClick={(e) => {
                        rejectFocus.current = {
                          trigger: e.currentTarget,
                          id: r.userId,
                          confirmed: false,
                        };
                        setReason('');
                        setRejectTarget(r);
                      }}
                    >
                      退回
                    </Button>
                    <Button disabled={processing.has(r.userId)} onClick={() => approve(r)}>
                      通過
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {rows.length > 0 && (
          <div className="pt-2 text-center space-y-2 text-sm text-muted-foreground">
            {/* 不得靜默截斷（ui-ux-guidelines §5）。未確認時接「・更新中」——載入更多按不出去的原因，
                鈕以 aria-describedby 指向這一行。 */}
            <AdminListStatus
              id={statusId}
              shown={rows.length}
              total={list.total}
              state="ready"
              suffix={statusSuffix}
            />
            {list.hasMore && (
              <>
                {/* 載入中與未確認時改 aria-disabled（不用原生 disabled）：焦點留在鈕上、不掉到 body。
                    載入更多失敗時原因寫在鈕下，已顯示的卡保留（中途對照 P1-1）。 */}
                <Button
                  tone="secondary"
                  size="sm"
                  onClick={() => {
                    if (list.canLoadMore) void list.loadMore();
                  }}
                  aria-disabled={!list.canLoadMore || undefined}
                  aria-describedby={
                    list.loadMoreError ? loadMoreNoteId : unconfirmedLook ? statusId : undefined
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
    </div>
  );
}
