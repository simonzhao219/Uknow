import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Upload } from 'lucide-react';
import type { IdPhotosResponse } from '@contract';

export type IdPhotosData = IdPhotosResponse['data'];

export interface IdVerificationSectionProps {
  /** 取回目前的證件狀態。注入而非直接呼叫 apiClient——與 ReferralTreeView 同慣例。 */
  loadStatus: () => Promise<IdPhotosData>;
  /** 重新上傳證件照。至少要帶一面。 */
  uploadPhotos: (files: { front?: File; back?: File }) => Promise<void>;
}

const HEADING: Record<IdPhotosData['verificationStatus'], string> = {
  none: '尚未上傳身分證',
  pending: '證件審核中',
  approved: '證件已通過審核',
  rejected: '證件審核未通過',
};

/**
 * 會員端的證件審核狀態。
 *
 * 為什麼這個區塊要有自己的上傳入口:被退回(rejected)的人**無法**靠提領流程
 * 重傳——那條路會被 request_withdrawal 的守衛 #5a 擋下。沒有這個入口,被退回
 * 的會員就無路可走。
 */
export function IdVerificationSection({ loadStatus, uploadPhotos }: IdVerificationSectionProps) {
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading');
  const [info, setInfo] = useState<IdPhotosData | null>(null);
  const [front, setFront] = useState<File | undefined>();
  const [back, setBack] = useState<File | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setState('loading');
    try {
      setInfo(await loadStatus());
      setState('done');
    } catch {
      setState('error');
    }
  }, [loadStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async () => {
    if (!front && !back) return;
    setSubmitting(true);
    try {
      await uploadPhotos({ front, back });
      setFront(undefined);
      setBack(undefined);
      if (frontRef.current) frontRef.current.value = '';
      if (backRef.current) backRef.current.value = '';
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <Card>
        <CardContent className="pt-6">
          {/* 骨架屏而非置中 spinner（ui-ux-guidelines §5）：資料到位時版面不跳動。 */}
          <output aria-label="載入證件狀態中" aria-busy="true" className="block space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
          </output>
        </CardContent>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">無法取得證件審核狀態</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            重試
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = info?.verificationStatus ?? 'none';
  const approved = status === 'approved';

  return (
    // 已通過的人不需要每次都看到整段說明，預設收起；其餘狀態都是「還有事要做」，
    // 預設展開（plan §4）。
    <Collapsible defaultOpen={!approved}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
            <CardTitle className="flex items-center gap-2 text-base">
              {approved ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : status === 'pending' ? (
                <Clock className="h-5 w-5 text-orange-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              {HEADING[status]}
            </CardTitle>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {status === 'pending' && (
              <p className="text-sm text-muted-foreground">
                通常 3 個工作天內完成。
                {/* 審核只擋 rejected（migration 0802 0002 的守衛 #5a）。不寫清楚，
                    會員看到「審核中」會以為要乾等，那個裁決省下的等待就白費了。 */}
                <strong className="text-foreground">審核期間仍可正常申請提領。</strong>
              </p>
            )}

            {status === 'approved' && (
              <p className="text-sm text-muted-foreground">
                之後的提領不需要再次上傳，除非你更換證件照片。
              </p>
            )}

            {status === 'rejected' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:bg-red-950/30">
                <p className="text-xs text-muted-foreground mb-1">退回原因</p>
                <p className="text-sm font-medium">{info?.rejectReason ?? '請聯繫客服了解原因'}</p>
              </div>
            )}

            {status === 'none' && (
              <p className="text-sm text-muted-foreground">
                提領前需要上傳身分證正反面，正反面都齊全才會送出審核。
              </p>
            )}

            {!approved && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="id-front" className="text-sm font-medium">
                      身分證正面
                    </label>
                    <input
                      ref={frontRef}
                      id="id-front"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="block w-full text-sm"
                      onChange={(e) => setFront(e.target.files?.[0])}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="id-back" className="text-sm font-medium">
                      身分證反面
                    </label>
                    <input
                      ref={backRef}
                      id="id-back"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="block w-full text-sm"
                      onChange={(e) => setBack(e.target.files?.[0])}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => void submit()}
                  disabled={(!front && !back) || submitting}
                  className="w-full sm:w-auto"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  送出審核
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
