import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '../ui/button';
import { Download, Share2, Copy } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import {
  buildInviteMessage,
  buildReferralLink,
  shareReferralInvite,
} from '../../utils/referralInvite';
import { detectInAppBrowser } from '../../utils/browserDetection';
import { drawInviteCard, inviteCardFileName } from '../../utils/inviteCardImage';

interface InviteFriendPanelContentProps {
  /** 會員專屬推薦碼；QR/連結都由它推導。空值時不渲染（呼叫端的按鈕會擋在加入計畫前）。 */
  referralCode?: string | null;
  /** 會員名稱，用於面板抬頭與下載檔名；可選，缺時退化成純推薦碼。 */
  memberName?: string | null;
}

/**
 * 邀請好友面板的「內容」——刻意與 Dialog 外殼分離：
 *   1. 內容是純呈現、不依賴 Radix Dialog，能在 jsdom 直接單元測試（Dialog 外殼
 *      需要的 focus-trap／portal 在 node 測試環境不穩）。
 *   2. 同一份內容未來若要換外殼（Sheet／獨立頁）也不必重寫。
 *
 * QR 內容即 buildReferralLink(code)=`${base}/register?ref=<code>`，與既有分享連結
 * 完全同源；掃碼落地由 AuthPage 讀 ?ref → savePendingReferral 撐過註冊漏斗，零後端。
 */
export function InviteFriendPanelContent({
  referralCode,
  memberName,
}: InviteFriendPanelContentProps) {
  const { showToast } = useNotification();
  const qrRef = useRef<HTMLDivElement>(null);

  const code = referralCode || '';
  const referralLink = code ? buildReferralLink(code) : '';
  // 下載在 LINE 等 in-app 瀏覽器對 <a download> 支援不一（常靜默開新分頁而非下載），
  // 與 shareReferralInvite 一致地偵測後給長按另存的提示。
  const { isInAppBrowser } = detectInAppBrowser();

  // 用隱藏 textarea + execCommand 複製（不受 Clipboard 權限限制，與專案其他複製一致）。
  const copyText = (text: string, successMsg: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg, 'success');
    } catch {
      showToast('複製失敗，請手動複製', 'error');
    }
    document.body.removeChild(textArea);
  };

  /** 把畫面上的 QR 重新組成一張「邀請卡」圖（含會員名/推薦碼/連結，不含任何按鈕）。 */
  const buildCardCanvas = (): HTMLCanvasElement | null => {
    const qrCanvas = qrRef.current?.querySelector('canvas');
    if (!qrCanvas) return null;
    return drawInviteCard({ qrCanvas, memberName, code, link: referralLink });
  };

  const downloadCard = () => {
    const card = buildCardCanvas();
    if (!card) {
      showToast('QR Code 尚未就緒，請稍後再試', 'error');
      return;
    }
    try {
      const link = document.createElement('a');
      link.download = inviteCardFileName(memberName, code);
      link.href = card.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('邀請卡已下載！', 'success');
    } catch {
      showToast('下載失敗，請長按圖片另存', 'error');
    }
  };

  /**
   * 分享：能分享圖片就連同邀請卡一起送出，否則退回原本的純文字分享。
   * 逐層降級——不支援檔案分享／使用者取消／轉檔失敗，都還有文字這條路可走。
   */
  const shareCard = async () => {
    const card = buildCardCanvas();
    if (card && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          card.toBlob((b) => resolve(b), 'image/png'),
        );
        if (blob) {
          const file = new File([blob], inviteCardFileName(memberName, code), {
            type: 'image/png',
          });
          const canShareFiles =
            typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
          if (canShareFiles) {
            await navigator.share({
              title: 'Uknow 專業服務平台',
              text: buildInviteMessage(code),
              files: [file],
            });
            return;
          }
        }
      } catch {
        // 取消或不支援 → 落回純文字分享（下方）。
      }
    }
    shareReferralInvite(code, showToast);
  };

  if (!code) return null;

  return (
    <div className="flex flex-col gap-4">
      {memberName ? (
        <p className="text-center text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{memberName}</span> 的推薦邀請
        </p>
      ) : null}

      <div
        ref={qrRef}
        role="img"
        aria-label={`推薦邀請 QR Code，內容為 ${referralLink}`}
        className="mx-auto rounded-xl border bg-white p-4 shadow-sm"
        data-testid="referral-qrcode"
      >
        <QRCodeCanvas
          value={referralLink}
          size={200}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#111111"
        />
      </div>

      {/* 推薦碼 + 明確複製按鈕（沿用專案「複製一律用按鈕」慣例，不做 tap-to-copy） */}
      <div className="flex items-center justify-center gap-2">
        <span className="font-mono text-lg tracking-wider text-purple-600">{code}</span>
        <Button variant="ghost" size="sm" onClick={() => copyText(code, '推薦碼已複製！')}>
          <Copy className="mr-1 h-4 w-4" />
          複製推薦碼
        </Button>
      </div>

      <p className="max-w-full break-all text-center text-xs text-muted-foreground">
        {referralLink}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={downloadCard}>
          <Download className="mr-1 h-4 w-4" />
          下載
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyText(referralLink, '推薦連結已複製到剪貼簿！')}
        >
          <Copy className="mr-1 h-4 w-4" />
          複製連結
        </Button>
        <Button size="sm" onClick={shareCard} data-testid="share-referral-button">
          <Share2 className="mr-1 h-4 w-4" />
          分享
        </Button>
      </div>

      {isInAppBrowser ? (
        <p className="text-center text-xs text-muted-foreground">
          若此瀏覽器無法下載，請長按上方 QR 圖片另存。
        </p>
      ) : null}
    </div>
  );
}
