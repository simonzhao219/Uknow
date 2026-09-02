import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
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
  /** 後端說這個名字是不是遮過的（一般會員遮、管理員全名）。 */
  nameMasked?: boolean;
  status: MemberVerifyStatus;
  activeUntil: string | null;
}

interface VerifyError {
  title: string;
  message: string;
}

const TONE_CLASS: Record<StatusTone, string> = {
  good: 'border-green-500 bg-green-50 text-green-800',
  warn: 'border-yellow-500 bg-yellow-50 text-yellow-800',
  bad: 'border-red-500 bg-red-50 text-red-800',
  neutral: 'border-muted bg-muted text-foreground',
};

/**
 * 錯誤標題依後端錯誤碼分流。**現場最怕的誤讀是把自己的問題讀成對方的問題**：
 * 舉著手機的人看到一個橘框，如果三種失敗長得一樣，「我的會籍剛過期」會被當成
 * 「這個人有問題」。訊息文字仍由後端給（單一事實來源），這裡只決定標題。
 */
const ERROR_TITLES: Record<string, string> = {
  verifier_not_eligible: '您目前無法掃描',
  rate_limited: '掃描過於頻繁',
};

function ToneIcon({ tone }: { tone: StatusTone }) {
  if (tone === 'good') return <CheckCircle2 className="h-6 w-6" aria-hidden />;
  if (tone === 'warn') return <Clock className="h-6 w-6" aria-hidden />;
  if (tone === 'bad') return <XCircle className="h-6 w-6" aria-hidden />;
  return <AlertTriangle className="h-6 w-6" aria-hidden />;
}

/**
 * 掃描驗證面板——「我的 QR」頁（`/dashboard/qr`）的第三個分頁。
 *
 * 為何是面板而不是頁：相機需要的全螢幕沉浸感由**整個頁面**提供（規格 §13 的
 * 判準沒變，只是那條獨立路由從 admin 區搬到了會員區）；這裡只負責取景與結果，
 * 頁首、分頁列與返回鍵都在 MyQrPage。**本檔刻意不碰 react-router**：面板不該
 * 知道自己被掛在哪條路由下。
 *
 * 掃碼庫 jsQR 動態 import（只解 QR，通用條碼庫要多帶 ~200KB 才多支援用不到的
 * 格式，會撞破 bundle 預算）；無相機或權限被拒時退手動輸入，功能不中斷。
 */
export function MemberVerifyScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<VerifyError | null>(null);
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
        buildApiUrl('/members/verify'),
        { method: 'POST', body: JSON.stringify({ token }) },
      );
      // 記下成功驗證的碼：按「繼續」時它多半還在鏡頭前，不記就會在下一幀
      // 又跳出同一個人（按鈕看起來沒作用），後端也多寫一筆稽核。
      // 失敗的碼刻意不記——那時「再送一次」正是掃描者要的重試。
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
      // 「驗證碼過期/無效」「掃描者自己沒資格」「太頻繁」是三件不同的事，
      // 標題分流；訊息一律用後端給的那句。
      const code = typeof err?.code === 'string' ? err.code : undefined;
      setError({
        title: (code && ERROR_TITLES[code]) || '無法驗證',
        message: err?.message || '驗證失敗，請重新掃描',
      });
      hapticAlert();
    } finally {
      setVerifying(false);
    }
  }, []);

  // 相機掃碼：getUserMedia 取後鏡頭串流，逐幀丟給 jsQR 解碼。
  // 不支援 / 拒絕權限 / 無相機 → 退手動輸入，功能不中斷。
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        const jsQR = (await import('jsqr')).default;
        const opened = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        // **先關掉再走**：cleanup 跑在 await 之前時，它看到的 stream 還是 null，
        // stop() 是 no-op；如果這裡只是 return，這條剛拿到手的串流就永遠沒有人
        // 關——相機指示燈一直亮，下次進來 getUserMedia 還可能因裝置忙碌而失敗。
        // 從獨立路由改成分頁之後，「切走」比「整頁導航」快得多，這個窄時間窗
        // 會常態發生。
        if (cancelled) {
          for (const t of opened.getTracks()) t.stop();
          return;
        }
        stream = opened;
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
  // 進雙套分支的話，「相機模式看得到、手動輸入模式看不到」這種不對稱只會在
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
            <p className="font-semibold">{error.title}</p>
            <p className="text-sm">{error.message}</p>
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
            {/* 未加入推薦計畫的人從沒在推薦網絡看過遮罩名，「四○○○哈」在需要對
                結果有信心的當下很容易被讀成掃錯人或系統壞掉。 */}
            {result.nameMasked ? (
              <p className="text-xs opacity-80">姓名部分遮蔽以保護隱私</p>
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
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted-foreground">
        {cameraFailed
          ? '此裝置無法使用相機掃描，請貼上對方畫面上的驗證碼。'
          : '對準對方出示的會員驗證碼，確認對方的會員身分與會籍。'}
      </p>

      {!cameraFailed ? (
        /* 取景框與結果的關係，是這個面板在手機上唯一真正的版面問題。
         *
         * 原症狀：video 只有 `w-full`，高度＝螢幕寬 × 相機串流原生比例
         * （手機直向多半 3:4 或 9:16，390px 寬即 520~693px 高），把結果卡擠出
         * 第一屏——而看結果正是這個分頁存在的唯一理由。
         *
         * 只要結果卡與取景框搶同一份垂直高度就無解，所以結果**疊在取景框上**、
         * 不佔流排版高度。遮住取景框下半部是可接受的，而且這正是本作法成立的
         * 關鍵：結果顯示期間 pausedRef.current === true，解碼是停的，此刻取景框
         * 本來就不需要被看見；按「繼續掃描下一位」後它就恢復完整。
         *
         * dvh 而非 vh：行動瀏覽器網址列收合時 vh 不更新（同 LegalDialog）。
         * object-cover 而非 contain：取景區視覺尺寸較大、好對準。**CSS 裁切
         * 不影響解碼範圍**——canvas 畫的是完整影格，所以掃描範圍比看到的更大。
         *
         * min-h 與「不加 overflow-hidden」是同一件事的兩道防線：疊上去的結果
         * 面板約 168px，視窗很矮時 45dvh 會小於它。min-h-[16rem] 讓這件事實際上
         * 不會發生；真發生時面板寧可溢出到取景框下方，也不要被裁掉——看不到結果
         * 正是當初要修的症狀本身。圓角因此掛在 video 上而非外層。
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
          <div className="flex gap-2">
            <Input
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="貼上驗證碼"
              aria-label="驗證碼"
            />
            <Button onClick={() => verifyToken(manualToken.trim())} disabled={!manualToken.trim()}>
              驗證
            </Button>
          </div>

          {/* 手動輸入沒有取景框可依附，三態走流排版——這裡沒有高度問題
              （輸入列本來就矮），節點與相機模式是同一份。 */}
          {statusRegion}
          {scanNextButton}
        </div>
      )}
    </div>
  );
}
