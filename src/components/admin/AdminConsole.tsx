import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { type AdminCache, createAdminCache } from './adminCache';
import { type AdminBusy, type AdminExportSession, LOCKED_TAB_LOOK } from './adminBusy';
import { REVALIDATE_DIM_DELAY_MS, SLOW_UPDATE_MS, useDelayedFlag } from './useAdminList';
import { WithdrawalManagement, type WithdrawalManagementProps } from './WithdrawalManagement';
import { MemberManagement, type MemberManagementProps } from './MemberManagement';
import { SystemNotifications } from './SystemNotifications';
import { SystemAlerts } from './SystemAlerts';

/**
 * 後台的分頁區（S5 §2.1、§2.4、§2.11）。AdminDashboard 以 `user.id` 為 key 掛它：使用者一變，
 * 分頁區連同快取 store、忙碌狀態與各分頁的 state 整個重掛，不會顯示前一位讀到的資料。
 *
 * **store 的 open／dispose 成對。** store 建立在 state 裡、effect 內 `open()`、cleanup
 * `dispose()`。離開 /admin、登出、session 過期、失去管理員都會卸載這裡（AdminRoute 導走）→
 * `dispose()` 清空資料與切回位置、拒收之後晚到的寫回。成對而不是只在 cleanup 清：不依賴 cleanup
 * 的執行次數，日後啟用 StrictMode（掛載→卸載→再掛載）也安全。
 *
 * **寫入在途也鎖分頁**（業主裁決 F、K4）：Radix Tabs 只掛 active 的分頁，切走＝卸載在途的元件——
 * 結算回來時沒有人回報結果、也沒有人重讀。匯出同理（收集迴圈隨卸載中止）。鎖立即生效（原生
 * disabled）；停用外觀與說明行等 0.3 秒，跟列表淡化同一個判準，一般寫入 0.3 秒內結束時不閃。
 *
 * **說明行在分頁列正下方**（T13）：公告與證件審核沒有工具列，鎖分頁的原因要寫在每個分頁都看得到
 * 的地方。可見文字、不是 live region：停用的分頁以 aria-describedby 指向它；匯出的播報由工具列的
 * 宣告區負責。
 */
export interface AdminConsoleProps {
  withdrawals: Pick<
    WithdrawalManagementProps,
    'loadWithdrawals' | 'updateStatus' | 'batchMarkPaid'
  >;
  members: Omit<MemberManagementProps, 'cache' | 'busy'>;
  /** 測試接縫：可觀察的 store 工廠。預設 `createAdminCache`。 */
  createCache?: () => AdminCache;
}

// 分頁的兩個名字：畫面上的二字（四欄一列放得下），與完整的無障礙名稱。
const ADMIN_TABS = [
  { value: 'withdrawals', visible: '提領', name: '獎金提領管理' },
  { value: 'members', visible: '會員', name: '會員管理' },
  { value: 'announcements', visible: '公告', name: '系統公告' },
  { value: 'system-alerts', visible: '告警', name: '系統告警' },
] as const;

type AdminTabValue = (typeof ADMIN_TABS)[number]['value'];

const SLOW_WRITE_HINT = '・仍在等待伺服器回應，離開此頁不會取消已送出的操作';

// 可見二字＋完整名稱整串放一個 sr-only 節點、由 aria-labelledby 指過來——寫法與
// 理由見 ui-ux-guidelines §9。id 由 useId 在同一處產生並同時給兩端，不手組字串。
function AdminTab({
  value,
  visible,
  name,
  locked,
  look,
  noteId,
}: {
  value: string;
  visible: string;
  name: string;
  locked: boolean;
  look: boolean;
  noteId: string;
}) {
  const nameId = useId();
  return (
    <TabsTrigger
      value={value}
      aria-labelledby={nameId}
      disabled={locked}
      aria-describedby={locked ? noteId : undefined}
      data-locked={locked && look ? 'true' : undefined}
      className={LOCKED_TAB_LOOK}
    >
      {visible}
      <span id={nameId} className="sr-only">
        {name}
      </span>
    </TabsTrigger>
  );
}

/**
 * 寫入與匯出的忙碌狀態。計數放 ref：`release` 的閉包可能來自換新之前的 busy 物件，也要減同一個
 * 計數（中途對照 P1-3）；`release` 冪等。busy 物件只在 `locked`／`noteId` 變化時換新。
 */
function useAdminBusy(noteId: string) {
  const writes = useRef(0);
  const slowWrites = useRef(0);
  const exports = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [writing, setWriting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ collected: number; total: number } | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const startWrite = useCallback(() => {
    writes.current += 1;
    setWriting(true);
    let released = false;
    let counted = false;
    // 同一筆寫入超過 SLOW_UPDATE_MS 才接等候提示：各筆各自計時，接力的兩筆不算。
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      counted = true;
      slowWrites.current += 1;
      setSlow(true);
    }, SLOW_UPDATE_MS);
    timers.current.add(timer);
    return () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      timers.current.delete(timer);
      if (counted) {
        slowWrites.current -= 1;
        setSlow(slowWrites.current > 0);
      }
      writes.current -= 1;
      setWriting(writes.current > 0);
    };
  }, []);

  const startExport = useCallback((): AdminExportSession => {
    exports.current += 1;
    setExporting(true);
    setProgress(null);
    let ended = false;
    return {
      progress(collected, total) {
        if (!ended) setProgress({ collected, total });
      },
      end() {
        if (ended) return;
        ended = true;
        exports.current -= 1;
        if (exports.current > 0) return;
        setExporting(false);
        setProgress(null);
      },
    };
  }, []);

  const locked = writing || exporting;
  const busy = useMemo<AdminBusy>(
    () => ({ locked, noteId, startWrite, startExport }),
    [locked, noteId, startWrite, startExport],
  );
  // 第一頁回來之前還沒有筆數：只寫「匯出中」。
  const note = exporting
    ? `匯出中${progress ? `（已收集 ${progress.collected} / ${progress.total} 筆）` : ''}，完成前無法切換分頁，離開此頁會中止`
    : `處理中，完成前無法切換分頁${slow ? SLOW_WRITE_HINT : ''}`;
  return { busy, note };
}

export function AdminConsole({
  withdrawals,
  members,
  createCache = createAdminCache,
}: AdminConsoleProps) {
  const [cache] = useState(createCache);
  useEffect(() => {
    cache.open();
    return () => cache.dispose();
  }, [cache]);
  // 告警不經 useAdminList（裁決 H），讀取回 403 時由它通知這裡清空同一個 store（T16）。
  const onAccessLost = useCallback(() => cache.invalidate('accessLost'), [cache]);

  const noteId = useId();
  const { busy, note } = useAdminBusy(noteId);
  const look = useDelayedFlag(busy.locked, REVALIDATE_DIM_DELAY_MS);
  const [tab, setTab] = useState<AdminTabValue>('withdrawals');

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as AdminTabValue)} className="w-full">
      {/* 手機與桌面都是四欄一列。
          **四個 class 缺一不可**——TabsList 原語的 base 是
          `inline-flex h-9 w-fit ... flex overflow-x-auto`（ui/tabs.tsx:32）:
          少了無前綴的 `grid`，grid-cols-4 對 display:flex 容器毫無作用；
          少了 `w-full`，容器縮成 w-fit 的內容寬度、四欄等分不會發生；
          少了 `h-auto`，釘死的 h-9 撐不出下面補的 44px。

          一列成立靠的是**可見標籤只有二字**。實測（375px）:四欄 track 各
          84.25px，扣 TabsTrigger 的 px-2+border 共 18px，可放文字約 66px；
          二字 `text-sm` 約 28px。原本的「獎金提領管理」要 84px，四欄放不下
          ——那是過去只能排成 3+2 兩列的原因。320px 下可放文字仍有約 52px。
          真瀏覽器量測把關:e2e/test_admin_mobile_layout.py 的一列、ink
          overflow 與 320px 三條。

          **無障礙名稱維持完整**（獎金提領管理／會員管理／系統公告／系統告警，
          見上方 AdminTab）:e2e 與 journey 都以
          `get_by_role("tab", name=…)` 找分頁——journey 只在晉升 PR 上跑，
          名稱漂掉要到那時才紅。

          `h-auto` 的代價是格子高度完全由內容決定——原語的 `py-1` ＋
          `text-sm` 只撐得出 30px，低於 §1 的 44px。分頁列是這一頁最上層
          的導覽，按它的頻率高於卡片上的任何一顆按鈕，所以在這裡補回來。
          **只補在 admin、不動 `ui/tabs.tsx` 基底**:比照 checkbox 與
          CardOverflowMenu 的先例，改基底會連帶把會員中心、獎勵頁等所有
          分頁列各加 14px，那是範圍外的視覺變更。
          寫在 TabsList 而不是四顆 TabsTrigger 上:同一條規則貼四次，
          日後加第五個分頁時漏貼不會有任何東西提醒你。 */}
      <TabsList className="w-full grid grid-cols-4 h-auto pointer-coarse:[&>[role=tab]]:min-h-[44px]">
        {ADMIN_TABS.map((t) => (
          <AdminTab
            key={t.value}
            {...t}
            locked={busy.locked && t.value !== tab}
            look={look}
            noteId={noteId}
          />
        ))}
      </TabsList>
      {look && (
        <p id={noteId} className="text-sm text-muted-foreground">
          {note}
        </p>
      )}

      <TabsContent value="withdrawals">
        <WithdrawalManagement {...withdrawals} cache={cache} busy={busy} />
      </TabsContent>

      <TabsContent value="members">
        <MemberManagement {...members} cache={cache} busy={busy} />
      </TabsContent>

      <TabsContent value="announcements">
        <SystemNotifications cache={cache} busy={busy} />
      </TabsContent>

      <TabsContent value="system-alerts">
        <SystemAlerts busy={busy} onAccessLost={onAccessLost} />
      </TabsContent>
    </Tabs>
  );
}
