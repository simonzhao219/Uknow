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
import { hapticAlert, hapticSuccess } from '../../utils/haptics';
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
 * admin 會員驗證頁（獨立路由 /admin/verify）。
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
    pausedRef.current = true; // 送出驗證就停止解碼，結果顯示期間不再吃影格
    setVerifying(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiRequestJson<{ success: boolean; data: VerifyResult }>(
        buildApiUrl('/admin/members/verify'),
        { method: 'POST', body: JSON.stringify({ token }) },
      );
      // 記下成功驗證的碼：按「繼續」時它多半還在鏡頭前，不記就會在下一幀
      // 又跳出同一個人（按鈕看起來沒作用），後端也多寫一筆稽核。
      // 失敗的碼刻意不記——那時「再送一次」正是店家要的重試。
      verifiedTokenRef.current = token;
      setResult(res.data);
      // 震動分級：驗證成功（API 有回）不等於這個人可以放行。舉著手機對客人的碼、
      // 眼睛看客人不看螢幕時，觸覺是唯一到得了的通道——兩種結果若震得一樣，
      // 「已過期」會被當成「有效」放行。
      if (memberVerifyStatusDisplay(res.data.status).tone === 'good') {
        hapticSuccess();
      } else {
        hapticAlert();
      }
    } catch (err: any) {
      // 「驗證碼過期/無效」與「會籍過期」是不同語意——錯誤態獨立呈現，
      // 不能讓店家把碼過期誤讀成這個人會籍過期。
      setError(err?.message || '驗證失敗，請重新掃描');
      hapticAlert();
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

  const reset = () => {
    setResult(null);
    setError(null);
    setManualToken('');
    pausedRef.current = false; // 迴圈一直活著，這裡放行的是解碼
  };

  // 三態（載入／錯誤／結果）只有這一份節點，相機模式與手動輸入模式共用。
  // 進雙套分支的話，「手機看得到、手動輸入模式看不到」這種不對稱只會在
  // 相機壞掉的現場才被發現——而那正是最不能再出事的時候。
  //
  // aria-live 的容器必須恆存於 DOM（空時渲染空 div），否則後續變化不會被播報。
  const statusRegion = (
    <div aria-live="polite">
      {verifying ? (
        <div className="flex items-center gap-2 rounded-lg bg-background p-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          驗證中…
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-lg border-2 border-orange-500 bg-orange-50 p-4 text-orange-900">
          <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">無法驗證</p>
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
  );

  const scanNextButton =
    result || error ? (
      <Button variant="outline" className="w-full bg-background" onClick={reset}>
        繼續掃描下一位
      </Button>
    ) : null;

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
          <h1 className="text-2xl font-bold">會員驗證</h1>
          {/* 手機隱藏副標：這頁的垂直空間全部要留給取景框與結果，而 CardHeader
              的「對準會員的驗證 QR」已經把同一件事說完了。 */}
          <p className="hidden text-sm text-muted-foreground sm:block">
            掃描會員出示的驗證碼，確認身分與會籍
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            {cameraFailed ? '手動輸入驗證碼' : '對準會員的驗證 QR'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!cameraFailed ? (
            /* 取景框與結果的關係，是這頁在手機上唯一真正的版面問題。
             *
             * 原症狀：video 只有 `w-full`，高度＝螢幕寬 × 相機串流原生比例
             * （手機直向多半 3:4 或 9:16，390px 寬即 520~693px 高）。在它之前
             * Navbar(64)＋公告橫幅(40)＋main py-6(24)＋頁首(76)＋CardHeader 等
             * 已吃掉約 288px，結果卡必然落在第一屏之外——店家得往下滑才看得到
             * 「這個人會籍有沒有效」，而那是這頁存在的唯一理由。
             *
             * 只要結果卡與取景框搶同一份垂直高度就無解（算下來取景框只剩約
             * 200px 才塞得進第一屏，那太小、對不準）。所以結果**疊在取景框上**、
             * 不佔流排版高度。遮住取景框下半部是可接受的，而且這正是本作法成立
             * 的關鍵：結果顯示期間 pausedRef.current === true，解碼是停的，
             * 此刻取景框本來就不需要被看見；按「繼續掃描下一位」後它就恢復完整。
             *
             * dvh 而非 vh：行動瀏覽器網址列收合時 vh 不更新（同 LegalDialog）。
             * object-cover 而非 contain：取景區視覺尺寸較大、好對準。**CSS 裁切
             * 不影響解碼範圍**——canvas 畫的是完整影格，所以掃描範圍比看到的更大，
             * 是安全的方向（不會出現「明明對準了卻掃不到」）。
             *
             * min-h 與「不加 overflow-hidden」是同一件事的兩道防線：疊上去的結果
             * 面板約 168px（結果卡＋繼續鈕＋內距），視窗很矮時 45dvh 會小於它。
             * min-h-[16rem] 讓這件事實際上不會發生；真發生時面板寧可溢出到取景框
             * 下方（頁面多捲一點），也不要被 overflow-hidden 裁掉——看不到結果
             * 正是這次要修的症狀本身。圓角因此掛在 video 上而非外層。
             */
            <div className="relative" data-testid="scanner-viewport">
              <video
                ref={videoRef}
                className="block aspect-[4/3] max-h-[45dvh] min-h-[16rem] w-full rounded-lg bg-black object-cover"
                muted
                playsInline
              >
                <track kind="captions" />
              </video>

              {/* 取景輔助：只畫四角、不畫實框。實框會被讀成「只有框內有效」，
                  與上面那句「解碼吃的是完整影格」剛好相反。 */}
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute left-4 top-4 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-white/60" />
                <div className="absolute right-4 top-4 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-white/60" />
                <div className="absolute bottom-4 left-4 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-white/60" />
                <div className="absolute bottom-4 right-4 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-white/60" />
              </div>

              {/* 釘在取景框內而非視窗底部：手機底部已被 BottomNav 佔用
                  （App.tsx 的 main 有 pb-24），視窗級 fixed 會疊到導覽列上。 */}
              <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
                {statusRegion}
                {scanNextButton}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                此裝置無法使用相機掃描，請貼上會員畫面上的驗證碼。
              </p>
              <div className="flex gap-2">
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="貼上驗證碼"
                  aria-label="驗證碼"
                />
                <Button
                  onClick={() => verifyToken(manualToken.trim())}
                  disabled={!manualToken.trim()}
                >
                  驗證
                </Button>
              </div>

              {/* 手動輸入沒有取景框可依附，三態走流排版——這裡沒有高度問題
                  （輸入列本來就矮），節點與相機模式是同一份。 */}
              {statusRegion}
              {scanNextButton}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
