import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Loader2, RefreshCw, ScanLine } from 'lucide-react';
import { Button } from '../ui/button';
import { useMemberVerifyToken } from '../../hooks/useMemberVerifyToken';

interface MemberVerifyQrTabProps {
  /** 是否為當前選取分頁；只有選取時才取碼／輪替。 */
  active: boolean;
  /** 會員自身會籍狀態（讓本人先知道，不必等 admin 當面掃出）。 */
  accountStatus?: 'active' | 'expired';
}

/**
 * 會員中心「我的 QR」的「會員驗證碼」分頁：出示動態短效碼給店家（admin）掃描驗證。
 * QR 內容是不透明簽章 token（非推薦碼、非連結）：一般相機掃到也無意義，只有後端
 * 授權端點解得開。到期前 hook 會自動換發，倒數不歸零。
 */
export function MemberVerifyQrTab({ active, accountStatus }: MemberVerifyQrTabProps) {
  const { data, loading, error, refresh } = useMemberVerifyToken(active);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!data) {
      setSecondsLeft(null);
      return;
    }
    const tick = () =>
      setSecondsLeft(
        Math.max(0, Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 1000)),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data]);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-center text-sm text-muted-foreground">
        出示這組碼給店家掃描，即可確認您的會員身分與會籍。
      </p>

      {accountStatus ? (
        <p className="text-xs text-muted-foreground">
          您的會籍：
          <span className={accountStatus === 'active' ? 'text-green-600' : 'text-muted-foreground'}>
            {accountStatus === 'active' ? '有效' : '已過期'}
          </span>
        </p>
      ) : null}

      {loading && !data ? (
        <div className="flex h-[232px] items-center justify-center" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            重試
          </Button>
        </div>
      ) : data ? (
        <>
          <div
            role="img"
            aria-label="會員驗證 QR Code（動態短效，出示給店家掃描）"
            className="rounded-xl border bg-white p-4 shadow-sm"
            data-testid="member-verify-qrcode"
          >
            <QRCodeCanvas
              value={data.token}
              size={200}
              level="M"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#111111"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ScanLine className="h-4 w-4" />
            {secondsLeft !== null ? `${secondsLeft} 秒後自動更新` : '短效碼，會自動更新'}
          </div>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            重新產生
          </Button>
        </>
      ) : null}
    </div>
  );
}
