import { useState, useEffect, useCallback } from 'react';
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
 * 公告管理：建立/刪除全站公告橫幅（前台 MaintenanceBanner 讀
 * GET /announcements/active）。取代過去寫死在 constants.ts 的
 * 系統維護預告。
 */
export function SystemNotifications() {
  const { showSuccess, showToast, showWarning } = useNotification();

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'info' as 'info' | 'warning' | 'error',
    startsAt: '',
    endsAt: '',
  });

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiRequestJson<{ success: boolean; data: { announcements: AdminAnnouncement[] } }>(
        buildApiUrl('/admin/announcements')
      );
      if (result.success) setAnnouncements(result.data.announcements);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無法取得公告列表', 'error');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showWarning('資料不完整', '請填寫完整的公告標題與內容');
      return;
    }
    setIsSubmitting(true);
    try {
      // datetime-local 沒有時區資訊——一律視為台灣時間
      const toIso = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : undefined);
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
        }
      );
      if (result.success) {
        showSuccess('公告已發布', '生效期間內全站橫幅將顯示這則公告');
        setForm({ title: '', message: '', type: 'info', startsAt: '', endsAt: '' });
        await fetchAnnouncements();
      } else {
        showToast(result.error?.message ?? '公告建立失敗', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '公告建立失敗', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await apiRequestJson<{ success: boolean }>(
        buildApiUrl(`/admin/announcements/${id}`),
        { method: 'DELETE' }
      );
      if (result.success) {
        showSuccess('公告已刪除', '');
        await fetchAnnouncements();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '公告刪除失敗', 'error');
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'info':    return <Badge variant="default">資訊</Badge>;
      case 'warning': return <Badge className="bg-orange-500">警告</Badge>;
      case 'error':   return <Badge variant="destructive">錯誤</Badge>;
      default:        return <Badge variant="outline">{type}</Badge>;
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
          <CardDescription>
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

          <Button onClick={handleCreate} className="w-full" disabled={isSubmitting}>
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
          <CardDescription>
            查看與管理所有公告
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : announcements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">尚無公告</p>
          ) : (
            <div className="space-y-4">
              {announcements.map((a) => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{a.title}</h4>
                    <div className="flex items-center gap-2">
                      {getTypeBadge(a.type)}
                      {isCurrentlyActive(a) ? (
                        <Badge className="bg-green-600">生效中</Badge>
                      ) : (
                        <Badge variant="outline">未生效</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(a.id)}
                        aria-label="刪除公告"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{a.message}</p>
                  <p className="text-xs text-muted-foreground">
                    生效：{formatTwTimestamp(a.startsAt)}
                    {a.endsAt ? ` ~ ${formatTwTimestamp(a.endsAt)}` : '（無期限）'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
