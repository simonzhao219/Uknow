import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { RefreshCw } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { formatTwTimestamp } from '../../utils/twDate';
import type { SystemAlert, SystemAlertsResponse } from '@contract';

// 系統告警（system_alerts）的維運介面。這張表收的是「需要人工介入」
// 的事件：付款處理失敗、對帳錯誤、金額不符待裁決——在這個 tab 之前
// 它們只進不出，除非維運直接下 SQL 否則無人看得到。
function getSeverityBadge(severity: SystemAlert['severity']) {
  switch (severity) {
    case 'error':
      return <Badge variant="destructive">error</Badge>;
    case 'warning':
      return <Badge className="bg-orange-500">warning</Badge>;
    default:
      return <Badge variant="outline">info</Badge>;
  }
}

export function SystemAlerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { showToast } = useNotification();

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await apiRequestJson<SystemAlertsResponse>(buildApiUrl('/admin/system-alerts'));
      setAlerts(res.data.alerts);
    } catch (error) {
      console.error('SystemAlerts: 載入告警失敗:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const resolveAlert = async (alert: SystemAlert) => {
    setResolvingId(alert.id);
    try {
      await apiRequestJson(buildApiUrl(`/admin/system-alerts/${alert.id}/resolve`), {
        method: 'POST',
      });
      showToast('已標記處理', 'success');
      await fetchAlerts();
    } catch (error) {
      console.error('SystemAlerts: 標記告警失敗:', error);
      showToast('標記失敗，請重試', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Card>
      {/* P11:長 CardDescription 與「重新整理」鍵在 375px 下對撞。 */}
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>系統告警</CardTitle>
          <CardDescription>
            需要人工介入的事件（付款處理失敗、對帳錯誤、金額不符）。處理完成後標記，
            同類事件才會再次告警。
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-1" />
          重新整理
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="py-4">
            {/* F14:列表載入用骨架屏，不要單一置中 spinner（ui-ux-guidelines §5）。
                原本是 Loader2，本階段順手還債（碰到的檔案）。 */}
            <div className="w-full space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        )}

        {!isLoading && loadError && (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">載入告警失敗，請檢查網路後再試</p>
            <Button variant="outline" onClick={fetchAlerts}>
              重新載入
            </Button>
          </div>
        )}

        {!isLoading && !loadError && alerts.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">目前沒有未處理的告警</p>
        )}

        {!isLoading &&
          !loadError &&
          alerts.length > 0 &&
          (!isDesktop ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  role="group"
                  aria-label={`${alert.source} 的系統告警`}
                  className="space-y-2 rounded-lg border p-3"
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
                      <Button variant="outline" size="sm" className="w-full">
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
                    variant="outline"
                    className="w-full"
                    onClick={() => resolveAlert(alert)}
                    disabled={resolvingId === alert.id}
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
                  <TableRow key={alert.id}>
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
                        variant="outline"
                        onClick={() => resolveAlert(alert)}
                        disabled={resolvingId === alert.id}
                      >
                        標記已處理
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
      </CardContent>
    </Card>
  );
}
