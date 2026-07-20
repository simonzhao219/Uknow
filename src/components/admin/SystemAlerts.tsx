import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { formatTwTimestamp } from '../../utils/twDate';
import type { SystemAlert, SystemAlertsResponse } from '@contract';

// 系統告警（system_alerts）的維運介面。這張表收的是「需要人工介入」
// 的事件：付款處理失敗、對帳錯誤、金額不符待裁決——在這個 tab 之前
// 它們只進不出，除非維運直接下 SQL 否則無人看得到。
function getSeverityBadge(severity: SystemAlert['severity']) {
  switch (severity) {
    case 'error':   return <Badge variant="destructive">error</Badge>;
    case 'warning': return <Badge className="bg-orange-500">warning</Badge>;
    default:        return <Badge variant="outline">info</Badge>;
  }
}

export function SystemAlerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const { showToast } = useNotification();

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await apiRequestJson<SystemAlertsResponse>(
        buildApiUrl('/admin/system-alerts')
      );
      setAlerts(res.data.alerts);
    } catch (error) {
      console.error('SystemAlerts: 載入告警失敗:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const resolveAlert = async (alert: SystemAlert) => {
    setResolvingId(alert.id);
    try {
      await apiRequestJson(
        buildApiUrl(`/admin/system-alerts/${alert.id}/resolve`),
        { method: 'POST' }
      );
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && loadError && (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">載入告警失敗，請檢查網路後再試</p>
            <Button variant="outline" onClick={fetchAlerts}>重新載入</Button>
          </div>
        )}

        {!isLoading && !loadError && alerts.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">目前沒有未處理的告警</p>
        )}

        {!isLoading && !loadError && alerts.length > 0 && (
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
                  <TableCell>{alert.message}</TableCell>
                  <TableCell className="max-w-xs">
                    <code className="text-xs text-muted-foreground break-all">
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
        )}
      </CardContent>
    </Card>
  );
}
