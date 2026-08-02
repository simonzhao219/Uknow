import { useCallback, useState } from 'react';
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
import { usePagedList } from '../../hooks/usePagedList';
import type { AdminIdReview } from '@contract';

export interface IdReviewQueueProps {
  /** 取回審核佇列。注入而非直接呼叫 apiClient——與 ReferralTreeView 同慣例。 */
  loadReviews: (params: {
    limit: number;
    offset: number;
  }) => Promise<{ reviews: AdminIdReview[]; total: number }>;
  /** 送出審核結果。退回時 reason 必填。 */
  submitReview: (userId: string, approve: boolean, reason?: string) => Promise<void>;
}

const QUEUE_PAGE_SIZE = 50;

export function IdReviewQueue({ loadReviews, submitReview }: IdReviewQueueProps) {
  const [rejectTarget, setRejectTarget] = useState<AdminIdReview | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // 分頁走共用 hook：後端一頁預設 50 筆，backfill 上線當日佇列就可能超過。
  // 看不到總數的 admin 會以為「今天審完了」，實際上第 51 筆之後的人還在等
  // ——那正是 ui-ux-guidelines §5「不得靜默截斷」要防的情況。
  const list = usePagedList<AdminIdReview>({
    pageSize: QUEUE_PAGE_SIZE,
    deps: [],
    load: useCallback(
      async ({ limit, offset }: { limit: number; offset: number }) => {
        const data = await loadReviews({ limit, offset });
        return { items: data.reviews ?? [], total: data.total ?? 0 };
      },
      [loadReviews],
    ),
  });
  const rows = list.items;
  const state = list.isLoading ? 'loading' : list.error ? 'error' : 'done';
  const refresh = list.reload;

  const act = async (userId: string, approve: boolean, why?: string) => {
    setBusyId(userId);
    try {
      await submitReview(userId, approve, why);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (state === 'loading') {
    return (
      <output aria-label="載入審核佇列中" aria-busy="true" className="block space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </output>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">無法取得審核佇列</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            重試
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-12">
          {/* 空態要說得出口——空白畫面會讓 admin 分不出「沒事做」與「壞了」。 */}
          <p className="text-center text-muted-foreground">目前沒有待審核的證件</p>
        </CardContent>
      </Card>
    );
  }

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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                退回 {rejectTarget.name ?? rejectTarget.email} 的證件
              </AlertDialogTitle>
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
                disabled={!reasonFilled || busyId === rejectTarget.userId}
                onClick={() => {
                  const target = rejectTarget;
                  const why = reason.trim();
                  setRejectTarget(null);
                  setReason('');
                  void act(target.userId, false, why);
                }}
              >
                確認退回
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {rows.map((r) => (
        <Card key={r.userId}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{r.name ?? '（未填姓名）'}</CardTitle>
            <CardDescription>
              {r.email}
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
                      alt={`${r.name ?? r.email} 的身分證${side}`}
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

            <div className="flex gap-2">
              <Button
                disabled={busyId === r.userId}
                onClick={() => void act(r.userId, true, undefined)}
              >
                通過
              </Button>
              <Button
                variant="destructive"
                disabled={busyId === r.userId}
                onClick={() => {
                  setReason('');
                  setRejectTarget(r);
                }}
              >
                退回
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="pt-2 text-center space-y-2 text-sm text-muted-foreground">
        {/* 不得靜默截斷（ui-ux-guidelines §5）。 */}
        <p>
          已顯示 {rows.length} / {list.total} 筆
        </p>
        {list.hasMore && (
          <Button variant="outline" size="sm" onClick={list.loadMore} disabled={list.isLoadingMore}>
            {list.isLoadingMore ? '載入中…' : '載入更多'}
          </Button>
        )}
      </div>
    </div>
  );
}
