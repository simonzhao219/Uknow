import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import type { RefreshOutcome } from '../../hooks/usePagedList';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { formatTwTimestamp } from '../../utils/twDate';
import type { SystemAlert, SystemAlertsResponse } from '@contract';
import { type AdminBusy, NOOP_BUSY } from './adminBusy';
import { runAdminWrite } from './adminWrite';
import { UNKNOWN_OUTCOME } from './writeOutcome';
import {
  DATA_AGE_TICK_MS,
  REVALIDATE_DIM_DELAY_MS,
  isForbidden,
  useDelayedFlag,
} from './useAdminList';
import { useRefreshAnnouncer } from './useRefreshAnnouncer';
import { AdminToolbar } from './AdminToolbar';
import { AdminListSkeleton } from './AdminListSkeleton';
import { AdminListError } from './AdminListError';
import { AdminStaleNotice, type AdminStaleNoticeProps } from './AdminStaleNotice';
import { formatDataAge } from './DataAgeNote';

// 系統告警（system_alerts）的維運介面。這張表收的是「需要人工介入」
// 的事件：付款處理失敗、對帳錯誤、金額不符待裁決——在這個 tab 之前
// 它們只進不出，除非維運直接下 SQL 否則無人看得到。
//
// **與 DI 慣例的例外**（業主裁決 H）：提領與會員的取數由 AdminDashboard 以 props 注入，這支仍
// 自己打 apiClient，也不快取、不走共用的分頁 hook——監控面板要的是即時資料。S5 只接共用的呈現
// （工具列、骨架、錯誤區、陳舊提示）與寫入協議。代價是自管的狀態（序號、`settled`、重讀旗標、
// 錯誤與資料時間）是 `usePagedList` 的第二份，同一個修正要改兩處。退場條件：下次改這支的取數或
// 寫入時，搬進 AdminDashboard 以 props 注入，並改接 `useAdminList`（`slot: null`，不快取）。
function getSeverityBadge(severity: SystemAlert['severity']) {
  switch (severity) {
    case 'error':
      return <Badge variant="destructive">error</Badge>;
    case 'warning':
      return <Badge variant="warning">warning</Badge>;
    default:
      return <Badge variant="outline">info</Badge>;
  }
}

export interface SystemAlertsProps {
  /** 寫入在途時鎖分頁（AdminConsole 注入）。 */
  busy?: AdminBusy;
  /** 讀取回 403：殼層清空後台快取。告警不經 useAdminList，所以由這裡通知（T16）。 */
  onAccessLost?: () => void;
}

interface AlertsState {
  alerts: SystemAlert[];
  /** 本次掛載讀到過資料（空清單也算）。 */
  hasData: boolean;
  /** 讀取在途（首次載入或背景更新）。 */
  reloading: boolean;
  error: string | null;
  /** 每次接受的落地 +1（焦點後備的觸發條件）。 */
  version: number;
  /** 畫面上這份資料的落地時間。 */
  fetchedAt: number | null;
}

const INITIAL: AlertsState = {
  alerts: [],
  hasData: false,
  reloading: true,
  error: null,
  version: 0,
  fetchedAt: null,
};

const LOAD_FAILED = '載入告警失敗，請檢查網路後再試';

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

export function SystemAlerts({ busy = NOOP_BUSY, onAccessLost }: SystemAlertsProps = {}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { showToast } = useNotification();
  const listRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // 標記在途的告警，可以同時有好幾則。
  const [processing, setProcessing] = useState<ReadonlySet<string>>(new Set());
  // 標記的那一則因重讀離開列表時，焦點移到下一則→上一則→列表區（ui-ux §4.3 焦點後備）。
  const rowFocus = useRef<{ id: string; index: number } | null>(null);

  // 取數與 state 留在元件內（H）；序號擋晚到覆蓋，結算的 promise 給 useRefreshAnnouncer。
  const [state, setState] = useState<AlertsState>(INITIAL);
  const stateRef = useRef(state);
  const commit = (next: AlertsState) => {
    stateRef.current = next;
    setState(next);
  };
  const requests = useLatestRequest();
  const mounted = useRef(false);
  const waiters = useRef<((outcome: RefreshOutcome) => void)[]>([]);
  const lastOutcome = useRef<RefreshOutcome>('done');
  const onAccessLostRef = useRef(onAccessLost);
  onAccessLostRef.current = onAccessLost;

  const finish = (outcome: RefreshOutcome) => {
    lastOutcome.current = outcome;
    const pending = waiters.current;
    waiters.current = [];
    for (const resolve of pending) resolve(outcome);
  };

  // 背景更新：保留列表、只標更新中；結算只認最後一次（之前在等的一併兌現）。
  const fetchAlerts = (): Promise<RefreshOutcome> => {
    if (!mounted.current) return Promise.resolve('failed');
    const outcome = new Promise<RefreshOutcome>((resolve) => waiters.current.push(resolve));
    const ticket = requests.begin();
    commit({ ...stateRef.current, reloading: true, error: null });
    const current = () => mounted.current && requests.isLatest(ticket);
    void (async () => {
      try {
        const res = await apiRequestJson<SystemAlertsResponse>(buildApiUrl('/admin/system-alerts'));
        // 形狀不合（契約漂移、代理回了別的東西）走錯誤態，不退回空清單：監控
        // 面板的「沒有未處理的告警」必須是真的沒有——fail-open 等於沒有監控。
        // 也不讓 undefined 往下讀把整個後台弄壞（同 WithdrawalManagement 的理由）。
        const list = res?.data?.alerts;
        if (!Array.isArray(list)) throw new Error('system-alerts 回應形狀不符');
        if (!current()) return;
        const prev = stateRef.current;
        commit({
          alerts: list,
          hasData: true,
          reloading: false,
          error: null,
          version: prev.version + 1,
          fetchedAt: Date.now(),
        });
        finish('done');
      } catch (err) {
        // 沒有權限了：不論這次是否已被後來的讀取取代，都讓殼層清空快取（K2）。
        if (isForbidden(err)) onAccessLostRef.current?.();
        if (!current()) return;
        console.error('SystemAlerts: 載入告警失敗:', err);
        const error = messageOf(err, LOAD_FAILED);
        commit(
          isForbidden(err)
            ? { ...INITIAL, reloading: false, error, version: stateRef.current.version }
            : { ...stateRef.current, reloading: false, error },
        );
        finish('failed');
      }
    })();
    return outcome;
  };

  const settled = (): Promise<RefreshOutcome> => {
    if (!mounted.current) return Promise.resolve('failed');
    if (!stateRef.current.reloading) return Promise.resolve(lastOutcome.current);
    return new Promise((resolve) => waiters.current.push(resolve));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在掛載時讀一次；fetchAlerts 讀的是 ref
  useEffect(() => {
    mounted.current = true;
    void fetchAlerts();
    return () => {
      mounted.current = false;
      // 卸載後不再有結算：在等的一律以 failed 兌現。
      const pending = waiters.current;
      waiters.current = [];
      for (const resolve of pending) resolve('failed');
    };
  }, []);

  const { alerts, hasData, error } = state;
  const updating = state.reloading;
  const failed = error !== null;
  const isLoading = !hasData && !failed;
  // 有舊列時的失敗：保留舊列並說出資料時間（E2）。告警沒有 15 秒慢更新（那在 useAdminList，H）。
  const stale = alerts.length > 0 && failed;
  const listFailedEmpty = failed && alerts.length === 0;
  // 更新中的淡化延遲 0.3 秒才出現、離開立即；失敗是靜態狀態，立即顯示。
  const dimmed = useDelayedFlag(updating, REVALIDATE_DIM_DELAY_MS);

  // 陳舊提示掛著時，資料時間每分鐘重算（停在頁面上沒有 re-render 時「剛剛」才會變老）。
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!stale) return;
    const timer = setInterval(() => setTick((n) => n + 1), DATA_AGE_TICK_MS);
    return () => clearInterval(timer);
  }, [stale]);

  const announcer = useRefreshAnnouncer({ isUpdating: updating, reload: fetchAlerts, settled });

  // 手動按下（工具列、陳舊提示、錯誤區的重試）的那條結算若失敗，狀態文字已經播過「更新
  // 失敗」，陳舊提示就不再以 alert 打斷；新的一次讀取開始（錯誤清掉）時歸零。
  const [failureAnnounced, setFailureAnnounced] = useState(false);
  useEffect(() => {
    if (!failed) setFailureAnnounced(false);
  }, [failed]);
  const manualRefresh = () => {
    announcer.refresh();
    void settled().then((outcome) => setFailureAnnounced(outcome === 'failed'));
  };

  // 重試期間錯誤區或陳舊提示留在原位、改寫「正在更新…」（焦點留在鈕上、不掉到 body）；結算後
  // 若被列表取代，焦點移到列表區。
  const [retrying, setRetrying] = useState<'notice' | 'empty' | null>(null);
  const retryHadFocus = useRef(false);
  useEffect(() => {
    if (updating) return;
    setRetrying(null);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (retryHadFocus.current && lost) listRef.current?.focus();
    retryHadFocus.current = false;
  }, [updating]);

  const now = Date.now();
  const age = formatDataAge(state.fetchedAt ?? now, now);
  const notice: AdminStaleNoticeProps | null = stale
    ? { kind: 'failed', age, reason: error ?? undefined, announce: !failureAnnounced }
    : retrying === 'notice' && updating && alerts.length > 0
      ? { kind: 'updating', age }
      : null;
  const retryFromNotice = () => {
    retryHadFocus.current = !!noticeRef.current?.contains(document.activeElement);
    setRetrying('notice');
    manualRefresh();
  };
  const retryFromError = () => {
    retryHadFocus.current = !!listRef.current?.contains(document.activeElement);
    setRetrying('empty');
    manualRefresh();
  };

  const focusRow = (id: string) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [];
    const row = Array.from(rows).find((el) => el.dataset.rowId === id);
    (row ?? listRef.current)?.focus();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 資料版本一變就做，本身就是觸發條件
  useEffect(() => {
    const pending = rowFocus.current;
    if (!pending || state.version === 0) return;
    rowFocus.current = null;
    if (alerts.some((a) => a.id === pending.id)) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = alerts[pending.index] ?? alerts[pending.index - 1];
    if (next) focusRow(next.id);
    else listRef.current?.focus();
  }, [state.version]);

  const resolveAlert = async (alert: SystemAlert) => {
    // 送出後焦點落在該則（鈕送出中是停用的，留在它身上等於掉到 body）；它因重讀離開列表時移到
    // 下一則。標記不受閘門約束（D）：後端擋不合法的操作，失敗照常說出來。
    rowFocus.current = {
      id: alert.id,
      index: stateRef.current.alerts.findIndex((a) => a.id === alert.id),
    };
    focusRow(alert.id);
    setProcessing((prev) => new Set(prev).add(alert.id));
    // 寫入走 runAdminWrite：成功與結果不明都重讀一次（K3）；後端拒絕沒有提交，只說出來。告警不快取，
    // 沒有要失效的事件。
    await runAdminWrite({
      busy,
      event: null,
      submit: () =>
        apiRequestJson(buildApiUrl(`/admin/system-alerts/${alert.id}/resolve`), {
          method: 'POST',
        }),
      settle: (outcome) => {
        setProcessing((prev) => {
          const next = new Set(prev);
          next.delete(alert.id);
          return next;
        });
        if (outcome.kind === 'done') {
          showToast('已標記處理', 'success');
        } else if (outcome.kind === 'unknown') {
          showToast(UNKNOWN_OUTCOME.alertResolve, 'warning');
        } else {
          console.error('SystemAlerts: 標記告警失敗:', outcome.error);
          showToast('標記失敗，請重試', 'error');
        }
        // 接著的重讀改變了列表：上一次手動重新整理的「已更新」「更新失敗」不再是在說它。
        if (outcome.kind !== 'rejected') announcer.reset();
      },
      reload: (outcome) => (outcome.kind === 'rejected' ? undefined : fetchAlerts()),
    });
  };

  return (
    <Card>
      {/* P11:長 CardDescription 與「重新整理」鍵在 375px 下對撞。 */}
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>系統告警</CardTitle>
          {/* 一行寫完：JSX 文字換行會在「，」後面多出一個半形空白。 */}
          <CardDescription className="hidden sm:block">
            需要人工介入的事件（付款處理失敗、對帳錯誤、金額不符）。處理完成後標記，同類事件才會再次告警。
          </CardDescription>
        </div>
        {/* 同其他分頁的 AdminToolbar：沒有篩選，重新整理靠右（H、主 #43）。重新整理交給
            useRefreshAnnouncer：更新途中再按不重送、只改寫狀態文字。 */}
        <div className="ml-auto text-right">
          <AdminToolbar
            onRefresh={manualRefresh}
            statusText={announcer.statusText}
            isUpdating={updating}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* 有舊列時的失敗：保留舊列並說出資料時間與原因（E2），重試是背景重讀。放在列表區外面：
            過期樣式的透明度不能疊到提示本身。 */}
        {notice && (
          <div ref={noticeRef} className="mb-4">
            <AdminStaleNotice {...notice} onRetry={retryFromNotice} />
          </div>
        )}
        {/* 更新中 aria-busy，0.3 秒後才淡化（快網路不閃）；失敗改用固定的過期樣式。 */}
        <section
          ref={listRef}
          tabIndex={-1}
          aria-label="告警列表"
          aria-busy={updating || undefined}
          data-dimmed={dimmed ? 'true' : undefined}
          data-stale={stale ? 'true' : undefined}
          className="scroll-mt-20 transition-opacity data-[dimmed=true]:opacity-60 data-[stale=true]:opacity-[var(--stale-opacity)]"
        >
          {retrying === 'empty' && updating ? (
            <AdminListError
              message=""
              retrying
              retryLabel="重新載入"
              tone="flow"
              onRetry={retryFromError}
            />
          ) : isLoading ? (
            // F14:列表載入用骨架屏，不要單一置中 spinner（ui-ux-guidelines §5）；四頁共用一個。
            <AdminListSkeleton label="載入告警中" variant={isDesktop ? 'rows' : 'cards'} />
          ) : listFailedEmpty ? (
            // 這是最危險的一種失效：載入失敗若渲染成空清單，維運會讀成「目前沒有未處理的告警」
            // ——把故障讀成健康。錯誤字維持現況原文（T10），中性字（§13 第 4 條）。
            <AdminListError
              message={LOAD_FAILED}
              retryLabel="重新載入"
              tone="flow"
              onRetry={retryFromError}
            />
          ) : alerts.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">目前沒有未處理的告警</p>
          ) : !isDesktop ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  role="group"
                  aria-label={`${alert.source} 的系統告警`}
                  // 程式化聚焦的落點（標記送出後）；不進 Tab 順序。
                  tabIndex={-1}
                  data-row-id={alert.id}
                  className="scroll-mt-20 space-y-2 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {getSeverityBadge(alert.severity)}
                    <span className="font-mono text-xs break-all">{alert.source}</span>
                  </div>
                  {/* 訊息全文可讀:break-words 而不是截斷——告警看不完等於沒看。 */}
                  <p className="text-sm break-words">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTwTimestamp(alert.created_at)}
                  </p>
                  {/* context 是 jsonb 原文、長度無上限（正式站的
                      time_domain_backfill 告警有四個欄位），攤開會把卡片撐爆
                      ——這條路由實測溢出 294px。預設收合，要看再展開。
                      用 Collapsible 而不是裸 <details>:全站 details 用量 0，
                      Collapsible 已有三個使用點，開合狀態也受 React 控制
                      （審查 N2）。 */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button tone="secondary" size="sm" className="w-full">
                        詳細資訊
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <code className="mt-2 block break-all text-xs text-muted-foreground">
                        {JSON.stringify(alert.context)}
                      </code>
                    </CollapsibleContent>
                  </Collapsible>
                  <Button
                    size="sm"
                    tone="secondary"
                    className="w-full"
                    onClick={() => void resolveAlert(alert)}
                    disabled={processing.has(alert.id)}
                  >
                    標記已處理
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>等級</TableHead>
                  <TableHead>來源</TableHead>
                  <TableHead>訊息</TableHead>
                  <TableHead>詳細資訊</TableHead>
                  <TableHead>發生時間</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow
                    key={alert.id}
                    // 程式化聚焦的落點（標記送出後）；不進 Tab 順序。
                    tabIndex={-1}
                    data-row-id={alert.id}
                    className="scroll-mt-20"
                  >
                    <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                    <TableCell className="font-mono text-sm">{alert.source}</TableCell>
                    {/*
                    message 與 context 長度都無上限（context 是 jsonb，後端寫
                    什麼就存什麼），而 TableCell 基底帶 whitespace-nowrap。
                    換行、限寬、block 三者必須落在同一個內層元素上：
                    - nowrap 會讓 break-all 完全失效，內層要自己宣告
                      whitespace-normal（white-space 是繼承屬性，顯式宣告即勝出）
                    - max-width 加在 <td> 上，auto table layout 只當提示
                      （CSS 2.1 §17.5.2 明訂效果 undefined），既不約束也不裁切
                    - max-width 對 inline 元素無效，所以要 block
                    缺一項，長內容就會以單行畫到隔壁欄位的文字上面。
                  */}
                    <TableCell>
                      <span className="block max-w-sm whitespace-normal break-words">
                        {alert.message}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="block max-w-xs whitespace-normal break-all text-xs text-muted-foreground">
                        {JSON.stringify(alert.context)}
                      </code>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatTwTimestamp(alert.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        tone="secondary"
                        onClick={() => void resolveAlert(alert)}
                        disabled={processing.has(alert.id)}
                      >
                        標記已處理
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
