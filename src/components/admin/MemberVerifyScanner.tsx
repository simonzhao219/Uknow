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
  // 解碼迴圈的閘門。放 ref 不放 state：迴圈跑在 rAF 上，每幀都要讀最新值，
  // 走 state 會讀到掛載當下那份閉包的舊值。
  const pausedRef = useRef(false);
  const verifiedTokenRef = useRef<string | null>(null);

  const verifyToken = useCallback(async (token: string) => {
    if (!token) return;
    pausedRef.current = true; // 送出核身就停止解碼，結果顯示期間不再吃影格
    setVerifying(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiRequestJson<{ success: boolean; data: VerifyResult }>(
        buildApiUrl('/admin/members/verify'),
        { method: 'POST', body: JSON.stringify({ token }) },
      );
      // 記下成功核身的碼：按「繼續」時它多半還在鏡頭前，不記就會在下一幀
      // 又跳出同一個人（按鈕看起來沒作用），後端也多寫一筆稽核。
      // 失敗的碼刻意不記——那時「再送一次」正是店家要的重試。
      verifiedTokenRef.current = token;
      setResult(res.data);
    } catch (err: any) {
      // 「核身碼過期/無效」與「會籍過期」是不同語意——錯誤態獨立呈現，
      // 不能讓店家把碼過期誤讀成這個人會籍過期。
      setError(err?.message || '核身失敗，請重新掃描');
    } finally {
      setVerifying(false);
    }
  }, []);

  // 相機掃碼：getUserMedia 取後鏡頭串流，逐幀丟給 jsQR 解碼。
  // 用 jsQR（只解 QR、動態 import）而非通用條碼庫：後者要多帶 ~200KB 進 bundle
  // 才多支援我們用不到的格式，會撞破專案的 bundle 預算閘門。
  // 不支援 / 拒絕權限 / 無相機 → 退手動輸入，功能不中斷。
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        const jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) throw new Error('no video element');
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // 迴圈只在卸載時結束，掃到碼是「暫停」而非「停止」——一旦 return 掉
        // 就沒有東西能把它接回來（本 effect 相依 verifyToken，那是常數）。
        const scan = () => {
          if (cancelled) return;
          if (!pausedRef.current && ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(image.data, image.width, image.height);
            if (found?.data && found.data !== verifiedTokenRef.current) {
              verifyToken(found.data);
            }
          }
          rafId = requestAnimationFrame(scan);
        };
        rafId = requestAnimationFrame(scan);
        controlsRef.current = {
          stop: () => {
            cancelAnimationFrame(rafId);
            for (const t of stream?.getTracks() ?? []) t.stop();
          },
        };
      } catch {
        if (!cancelled) setCameraFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      controlsRef.current?.stop();
      for (const t of stream?.getTracks() ?? []) t.stop();
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
                pausedRef.current = false; // 迴圈一直活著，這裡放行的是解碼
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
