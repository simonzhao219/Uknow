import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  ScanLine,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import {
  type MemberVerifyStatus,
  memberVerifyStatusDisplay,
  type StatusTone,
} from '../../utils/memberVerifyStatus';

interface VerifyResult {
  displayName: string;
  status: MemberVerifyStatus;
  activeUntil: string | null;
}

const TONE_CLASS: Record<StatusTone, string> = {
  good: 'border-green-500 bg-green-50 text-green-800',
  warn: 'border-yellow-500 bg-yellow-50 text-yellow-800',
  bad: 'border-red-500 bg-red-50 text-red-800',
  neutral: 'border-muted bg-muted text-foreground',
};

function ToneIcon({ tone }: { tone: StatusTone }) {
  if (tone === 'good') return <CheckCircle2 className="h-6 w-6" aria-hidden />;
  if (tone === 'warn') return <Clock className="h-6 w-6" aria-hidden />;
  if (tone === 'bad') return <XCircle className="h-6 w-6" aria-hidden />;
  return <AlertTriangle className="h-6 w-6" aria-hidden />;
}

/**
 * admin 掃碼核身頁（獨立路由 /admin/verify）。
 *
 * 為何獨立路由而非 AdminDashboard 第 6 個 Tab：相機需要全螢幕沉浸式體驗，
 * 且 AdminDashboard 桌面版是釘死的 5 欄 grid，硬插第 6 個會壞版面。
 * 判準：需全螢幕/裝置權限的即時互動走獨立路由；資料管理類走 Tabs。
 *
 * 掃碼庫 @zxing/browser 動態 import（僅本頁需要，不拖累 admin 其他頁）；
 * 無相機或權限被拒時退手動輸入，功能不中斷。
 */
export function MemberVerifyScanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [manualToken, setManualToken] = useState('');

  const verifyToken = useCallback(async (token: string) => {
    if (!token) return;
    setVerifying(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiRequestJson<{ success: boolean; data: VerifyResult }>(
        buildApiUrl('/admin/members/verify'),
        { method: 'POST', body: JSON.stringify({ token }) },
      );
      setResult(res.data);
    } catch (err: any) {
      // 「核身碼過期/無效」與「會籍過期」是不同語意——錯誤態獨立呈現，
      // 不能讓店家把碼過期誤讀成這個人會籍過期。
      setError(err?.message || '核身失敗，請重新掃描');
    } finally {
      setVerifying(false);
    }
  }, []);

  // 相機掃碼：動態載入 @zxing/browser；不支援/拒絕權限即退手動輸入。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (res) => {
            if (res && !cancelled) verifyToken(res.getText());
          },
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch {
        if (!cancelled) setCameraFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [verifyToken]);

  const display = result ? memberVerifyStatusDisplay(result.status) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/admin')}
          className="shrink-0"
          aria-label="返回管理後台"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">掃碼核身</h1>
          <p className="text-sm text-muted-foreground">掃描會員出示的核身碼，確認身分與會籍</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            {cameraFailed ? '手動輸入核身碼' : '對準會員的核身 QR'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!cameraFailed ? (
            <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline>
              <track kind="captions" />
            </video>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                此裝置無法使用相機掃描，請貼上會員畫面上的核身碼。
              </p>
              <div className="flex gap-2">
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="貼上核身碼"
                  aria-label="核身碼"
                />
                <Button
                  onClick={() => verifyToken(manualToken.trim())}
                  disabled={!manualToken.trim()}
                >
                  核身
                </Button>
              </div>
            </div>
          )}

          {/* 結果／錯誤：aria-live 讓非主動觸發的變化也會被讀出 */}
          <div aria-live="polite" className="min-h-[4rem]">
            {verifying ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                核身中…
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 rounded-lg border-2 border-orange-500 bg-orange-50 p-4 text-orange-900">
                <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">無法核身</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            ) : result && display ? (
              <div
                className={`flex items-center gap-3 rounded-lg border-2 p-4 ${TONE_CLASS[display.tone]}`}
                data-testid="verify-result"
              >
                <ToneIcon tone={display.tone} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{result.displayName}</p>
                  <p className="text-sm font-medium">{display.label}</p>
                  {result.activeUntil ? (
                    <p className="text-xs opacity-80">
                      效期至 {new Date(result.activeUntil).toLocaleDateString('zh-TW')}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {(result || error) && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setResult(null);
                setError(null);
                setManualToken('');
              }}
            >
              繼續掃描下一位
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
