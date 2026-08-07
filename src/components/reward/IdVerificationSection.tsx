import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { AlertCircle, Upload } from 'lucide-react';
import type { IdPhotosResponse } from '@contract';

export type IdPhotosData = IdPhotosResponse['data'];

export interface IdVerificationSectionProps {
  /** 取回目前的證件狀態。注入而非直接呼叫 apiClient——與 ReferralTreeView 同慣例。 */
  loadStatus: () => Promise<IdPhotosData>;
  /** 重新上傳證件照。至少要帶一面。 */
  uploadPhotos: (files: { front?: File; back?: File }) => Promise<void>;
}

/**
 * 會員端的證件**退回警示卡**——只在 `rejected` 時渲染。
 *
 * 其餘狀態一律回 null:上傳入口本就在提領流程步驟 3(守衛 5b 的鏡像),
 * `pending` 不擋申請也不擋匯款(§5.3 一般原則),`approved` 無事可做——
 * 常駐渲染只是紅色噪音。載入中/載入失敗也不渲染:先閃骨架再消失是新的
 * 噪音,而這張卡只是輔助通道,提領流程內還有一道 rejected 引導。
 *
 * 為什麼 rejected 需要這張卡:(1) 被動發現——不想提領的人也該知道證件
 * 被退了,而不是下次提領才踩到;(2) 流程外的重傳通道——流程內重傳要走
 * 完整申請,暫時不能提領的人得有地方補救,否則退回狀態會一直掛著。
 */
export function IdVerificationSection({ loadStatus, uploadPhotos }: IdVerificationSectionProps) {
  const [info, setInfo] = useState<IdPhotosData | null>(null);
  const [front, setFront] = useState<File | undefined>();
  const [back, setBack] = useState<File | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setInfo(await loadStatus());
    } catch {
      // 靜默:此卡是輔助通道,載入失敗不值得在獎勵頁打擾使用者;
      // rejected 的硬引導在提領流程步驟 3 還有一道。
      setInfo(null);
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
      // 雙面齊全的重傳會轉 pending(上傳端點清退回理由)——refresh 後
      // 這張卡自然消失,不需要額外的成功文案。
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (info?.verificationStatus !== 'rejected') return null;

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-5 w-5 text-red-600" />
          證件審核未通過
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:bg-red-950/30">
          <p className="text-xs text-muted-foreground mb-1">退回原因</p>
          <p className="text-sm font-medium">{info.rejectReason ?? '請聯繫客服了解原因'}</p>
        </div>

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
      </CardContent>
    </Card>
  );
}
