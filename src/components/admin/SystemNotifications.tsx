import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Bell, Send, Trash2, Loader2 } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { formatTwTimestamp } from '../../utils/twDate';
import { type AdminCache, adminQuery } from './adminCache';
import { type AdminBusy, NOOP_BUSY } from './adminBusy';
import { runAdminWrite } from './adminWrite';
import { refusal, UNKNOWN_OUTCOME } from './writeOutcome';
import { REVALIDATE_DIM_DELAY_MS, useAdminList, useDelayedFlag } from './useAdminList';
import { AdminListSkeleton } from './AdminListSkeleton';
import { AdminListError } from './AdminListError';
import { AdminStaleNotice, type AdminStaleNoticeProps } from './AdminStaleNotice';
import { formatDataAge } from './DataAgeNote';

interface AdminAnnouncement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * 系統公告：建立/刪除全站公告橫幅（前台 MaintenanceBanner 讀
 * GET /announcements/active）。取代過去寫死在 constants.ts 的
 * 系統維護預告。
 *
 * **與 DI 慣例的例外**（業主裁決 H）：提領與會員的取數由 AdminDashboard 以 props 注入，這支仍
 * 自己打 apiClient——S5 只接快取、骨架、錯誤區與寫入協議，不搬取數。退場條件：下次改這支的取數
 * 或寫入時，搬進 AdminDashboard 以 props 注入。
 */
export interface SystemNotificationsProps {
  /** 後台記憶體快取（AdminConsole 建立）。不給＝不跨卸載保留。 */
  cache?: AdminCache;
  /** 寫入在途時鎖分頁。 */
  busy?: AdminBusy;
}

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export function SystemNotifications({ cache, busy = NOOP_BUSY }: SystemNotificationsProps = {}) {
  const { showSuccess, showToast, showWarning } = useNotification();
  const listRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 刪除在途的公告，可以同時有好幾則。
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  // 刪除的那一則因重讀離開列表時，焦點移到下一則→上一則→列表區（ui-ux §4.3 焦點後備）。
  const rowFocus = useRef<{ id: string; index: number } | null>(null);
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'info' as 'info' | 'warning' | 'error',
    startsAt: '',
    endsAt: '',
  });

  // 切回時拿快取當種子：立即出現、背景重讀。單頁清單（端點最多回 100 筆，上限記遺留）：total
  // 取已讀筆數，不會出現載入更多，也不寫「共 N 則」。
  const list = useAdminList<AdminAnnouncement>({
    cache,
    query: adminQuery.announcements(),
    pageSize: 100,
    load: async () => {
      const result = await apiRequestJson<{
        success: boolean;
        data: { announcements: AdminAnnouncement[] };
      }>(buildApiUrl('/admin/announcements'));
      const items = result?.data?.announcements;
      // 形狀不合時走錯誤態，不退回空清單：「尚無公告」必須是真的沒有。
      if (!result?.success || !Array.isArray(items)) throw new Error('無法取得公告列表');
      return { items, total: items.length };
    },
  });
  const announcements = list.items;
  const updating = list.isLoading || list.isRevalidating;
  const failed = list.error !== null;
  // 有舊列時的失敗或逾時：保留舊列並說出資料時間（E2）。
  const stale = announcements.length > 0 && (failed || list.isSlow);
  const listFailedEmpty = failed && announcements.length === 0;
  // 更新中的淡化延遲 0.3 秒才出現、離開立即；失敗與逾時是靜態狀態，立即顯示。
  const dimmed = useDelayedFlag(updating && !list.isSlow, REVALIDATE_DIM_DELAY_MS);

  const focusRow = (id: string) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [];
    const row = Array.from(rows).find((el) => el.dataset.rowId === id);
    (row ?? listRef.current)?.focus();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 資料版本一變就做，本身就是觸發條件
  useEffect(() => {
    const pending = rowFocus.current;
    if (!pending || list.dataVersion === 0) return;
    rowFocus.current = null;
    if (announcements.some((a) => a.id === pending.id)) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = announcements[pending.index] ?? announcements[pending.index - 1];
    if (next) focusRow(next.id);
    else listRef.current?.focus();
  }, [list.dataVersion]);

  // 重試期間錯誤區或陳舊提示留在原位、改寫「正在更新…」（焦點留在鈕上、不掉到 body）；結算後若
  // 被列表取代，焦點移到列表區。沒有工具列：提示本身就是回饋。
  const [retrying, setRetrying] = useState<'notice' | 'empty' | null>(null);
  const retryHadFocus = useRef(false);
  useEffect(() => {
    if (updating) return;
    setRetrying(null);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (retryHadFocus.current && lost) listRef.current?.focus();
    retryHadFocus.current = false;
  }, [updating]);

  const age = formatDataAge(list.fetchedAt ?? list.now, list.now);
  const notice: AdminStaleNoticeProps | null = stale
    ? { kind: failed ? 'failed' : 'slow', age, reason: list.error ?? undefined }
    : retrying === 'notice' && updating && announcements.length > 0
      ? { kind: 'updating', age }
      : null;
  const retry = (from: 'notice' | 'empty') => {
    const region = from === 'notice' ? noticeRef.current : listRef.current;
    retryHadFocus.current = !!region?.contains(document.activeElement);
    setRetrying(from);
    void list.reload();
  };

  const handleCreate = async () => {
    // 送出中鈕是 aria-disabled（焦點留在鈕上）：點擊在這裡擋，不重送。
    if (isSubmitting) return;
    if (!form.title.trim() || !form.message.trim()) {
      showWarning('資料不完整', '請填寫完整的公告標題與內容');
      return;
    }
    setIsSubmitting(true);
    // datetime-local 沒有時區資訊——一律視為台灣時間
    const toIso = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : undefined);
    // 寫入走 runAdminWrite：成功與結果不明讓公告快取失效並重讀（K3）；後端拒絕沒有提交，只說出原因。
    await runAdminWrite({
      busy,
      cache,
      event: 'announcementCreate',
      submit: async () => {
        const result = await apiRequestJson<{ success: boolean; error?: { message: string } }>(
          buildApiUrl('/admin/announcements'),
          {
            method: 'POST',
            body: JSON.stringify({
              title: form.title.trim(),
              message: form.message.trim(),
              type: form.type,
              startsAt: toIso(form.startsAt),
              endsAt: toIso(form.endsAt) ?? null,
            }),
          },
        );
        if (!result?.success) throw refusal(result?.error?.message ?? '公告建立失敗');
      },
      settle: (outcome) => {
        setIsSubmitting(false);
        if (outcome.kind === 'done') {
          showSuccess('公告已發布', '生效期間內全站橫幅將顯示這則公告');
          setForm({ title: '', message: '', type: 'info', startsAt: '', endsAt: '' });
        } else if (outcome.kind === 'unknown') {
          // 表單不清：可能沒建立成功，admin 確認列表後要能直接重發。
          showToast(UNKNOWN_OUTCOME.announcementCreate, 'warning');
        } else {
          showToast(messageOf(outcome.error, '公告建立失敗'), 'error');
        }
      },
      reload: (outcome) => (outcome.kind === 'rejected' ? undefined : list.reload()),
    });
  };

  const handleDelete = async (id: string) => {
    // 送出後焦點落在該則（刪除鈕送出中是停用的，留在它身上等於掉到 body）；它因重讀離開列表時移到
    // 下一則。刪除不受閘門約束（D）：後端擋不合法的操作，失敗照常說出來。
    rowFocus.current = { id, index: announcements.findIndex((a) => a.id === id) };
    focusRow(id);
    setDeleting((prev) => new Set(prev).add(id));
    await runAdminWrite({
      busy,
      cache,
      event: 'announcementDelete',
      submit: async () => {
        const result = await apiRequestJson<{ success: boolean; error?: { message: string } }>(
          buildApiUrl(`/admin/announcements/${id}`),
          { method: 'DELETE' },
        );
        if (!result?.success) throw refusal(result?.error?.message ?? '公告刪除失敗');
      },
      settle: (outcome) => {
        setDeleting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // toast 而不是 showSuccess：成功彈窗會搶走焦點，送出時落在該則、它離開後移到下一則的
        // 後備就落空。
        if (outcome.kind === 'done') showToast('公告已刪除', 'success');
        else if (outcome.kind === 'unknown')
          showToast(UNKNOWN_OUTCOME.announcementDelete, 'warning');
        else showToast(messageOf(outcome.error, '公告刪除失敗'), 'error');
      },
      reload: (outcome) => (outcome.kind === 'rejected' ? undefined : list.reload()),
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'info':
        return <Badge variant="default">資訊</Badge>;
      case 'warning':
        return <Badge variant="warning">警告</Badge>;
      case 'error':
        return <Badge variant="destructive">錯誤</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const isCurrentlyActive = (a: AdminAnnouncement) => {
    const now = Date.now();
    return (
      a.isActive &&
      new Date(a.startsAt).getTime() <= now &&
      (!a.endsAt || new Date(a.endsAt).getTime() >= now)
    );
  };

  return (
    <div className="space-y-6">
      {/* 發布公告 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            發布全站公告
          </CardTitle>
          <CardDescription className="hidden sm:block">
            公告會顯示在全站頂部橫幅（例如系統維護預告）；生效區間外自動消失
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">公告標題</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：系統維護預告"
              />
            </div>

            <div className="space-y-2">
              <Label>公告類型</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value as typeof form.type })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">資訊</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="error">錯誤</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">公告內容</Label>
            <Textarea
              id="message"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="請輸入公告內容..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startsAt">生效時間（台灣時間，留空 = 立即）</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endsAt">結束時間（台灣時間，留空 = 無期限）</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>

          {/* 送出中用 aria-disabled 不用原生 disabled：按下的鈕不離開焦點順序（ui-ux §9）。 */}
          <Button
            onClick={handleCreate}
            aria-disabled={isSubmitting || undefined}
            className="w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            發布公告
          </Button>
        </CardContent>
      </Card>

      {/* 公告列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            公告列表
          </CardTitle>
          <CardDescription className="hidden sm:block">查看與管理所有公告</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 有舊列時的失敗或逾時：保留舊列並說出資料時間（E2）。沒有工具列，逾時的提示也附重試。
              放在列表區外面：過期樣式的透明度不能疊到提示本身。 */}
          {notice && (
            <div ref={noticeRef} className="mb-4">
              <AdminStaleNotice {...notice} onRetry={() => retry('notice')} />
            </div>
          )}
          {/* 更新中 aria-busy，0.3 秒後才淡化（快網路不閃）；失敗與逾時改用固定的過期樣式。 */}
          <section
            ref={listRef}
            tabIndex={-1}
            aria-label="公告列表"
            aria-busy={updating || undefined}
            data-dimmed={dimmed ? 'true' : undefined}
            data-stale={stale ? 'true' : undefined}
            className="scroll-mt-20 transition-opacity data-[dimmed=true]:opacity-60 data-[stale=true]:opacity-[var(--stale-opacity)]"
          >
            {retrying === 'empty' && updating ? (
              <AdminListError
                message=""
                retrying
                retryLabel="重試"
                tone="secondary"
                onRetry={() => retry('empty')}
              />
            ) : list.isLoading ? (
              // 骨架取代置中的轉圈（ui-ux §5）。
              <AdminListSkeleton
                label="載入公告中"
                variant="cards"
                message={list.isSlow ? '更新較久，仍在等待伺服器回應' : undefined}
              />
            ) : listFailedEmpty ? (
              // 沒讀到不是沒有公告：說出錯在哪、給一顆重試。同頁另有流程鈕「發布公告」，重試用次要（§12.11）。
              <AdminListError
                message={list.error ?? '無法取得公告列表'}
                retryLabel="重試"
                tone="secondary"
                onRetry={() => retry('empty')}
              />
            ) : announcements.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">尚無公告</p>
            ) : (
              <div className="space-y-4">
                {announcements.map((a) => (
                  // fieldset＝隱含 group 角色（以標題為名）；min-w-0 蓋掉 fieldset 預設的 min-content
                  // 寬度——不然長網址會把整則撐出版面（P15）。
                  <fieldset
                    key={a.id}
                    aria-label={a.title}
                    // 程式化聚焦的落點（刪除送出後）；不進 Tab 順序。
                    tabIndex={-1}
                    data-row-id={a.id}
                    className="min-w-0 scroll-mt-20 border rounded-lg p-4"
                  >
                    {/* P12:標題與右側三個 badge ＋ 刪除鍵在 375px 下互相擠壓。 */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium break-words">{a.title}</h4>
                      <div className="flex items-center gap-2">
                        {getTypeBadge(a.type)}
                        {isCurrentlyActive(a) ? (
                          <Badge variant="success">生效中</Badge>
                        ) : (
                          <Badge variant="outline">未生效</Badge>
                        )}
                        {/* icon 鈕原尺寸：觸控 44px（ui-ux §1，主 #43）。先前 h-7 w-7 壓成 28px。 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive-subtle-foreground"
                          onClick={() => void handleDelete(a.id)}
                          disabled={deleting.has(a.id)}
                          aria-label="刪除公告"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {/* P15:公告內文沒有長度上限，實務上會貼網址——長 token 不斷行
                      實測撐破 +153px。 */}
                    <p className="text-sm text-muted-foreground mb-2 break-words">{a.message}</p>
                    <p className="text-xs text-muted-foreground">
                      生效：{formatTwTimestamp(a.startsAt)}
                      {a.endsAt ? ` ~ ${formatTwTimestamp(a.endsAt)}` : '（無期限）'}
                    </p>
                  </fieldset>
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
