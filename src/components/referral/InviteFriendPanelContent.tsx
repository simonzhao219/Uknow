import { useContext, useRef } from 'react';
import type React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Download, Share2, Copy } from 'lucide-react';
import { UserContext } from '../../App';
import { useNotification } from '../notifications/NotificationContext';
import { ReferralCodeWithCopy } from './ReferralCodeWithCopy';
import { myQrTabsForUser } from '../../utils/myQrTabPreference';
import {
  buildReferralLink,
  isShareStoppedByUser,
  shareReferralInvite,
} from '../../utils/referralInvite';
import { detectInAppBrowser } from '../../utils/browserDetection';
import { drawInviteCard, inviteCardFileName } from '../../utils/inviteCardImage';
import { PIXEL_INK, PIXEL_PAPER } from '../../utils/pixelColors';
import { useCopyToast } from '../../hooks/useCopyToast';

/**
 * 邀請好友面板的「內容」——刻意與 Dialog 外殼分離：
 *   1. 內容不依賴 Radix Dialog，能在 jsdom 直接單元測試（Dialog 外殼需要的
 *      focus-trap／portal 在 node 測試環境不穩）。
 *   2. 同一份內容未來若要換外殼（Sheet／獨立頁）也不必重寫。
 *
 * 推薦碼、會員名與閘門只有一個來源：UserContext（myQrTabsForUser）。QR、連結、邀請卡、
 * 分享鈕與其中的 ReferralCodeWithCopy 讀同一份，呼叫端不另傳碼——兩份碼只靠註解
 * 保證同源，就是已退場的 MyQrEntry 記下的那個教訓（註解不會編譯失敗）。
 *
 * QR 內容即 buildReferralLink(code)=`${base}/register?ref=<code>`，與既有分享連結
 * 完全同源；掃碼落地由 AuthPage 讀 ?ref → savePendingReferral 撐過註冊漏斗，零後端。
 */
export function InviteFriendPanelContent() {
  const { user } = useContext(UserContext);
  const { showToast } = useNotification();
  const copy = useCopyToast();
  const qrRef = useRef<HTMLDivElement>(null);

  // 沒簽參加契約書之前不出示、不分享推薦碼（碼在付款成功時就已產生）。
  const code: string = myQrTabsForUser(user).invite ? user.referralCode : '';
  const memberName: string | null | undefined = user?.name;
  const referralLink = code ? buildReferralLink(code) : '';
  // 下載在 LINE 等 in-app 瀏覽器對 <a download> 支援不一（常靜默開新分頁而非下載），
  // 偵測到 in-app 瀏覽器時給長按另存的提示。
  const { isInAppBrowser } = detectInAppBrowser();

  // 點進欄位就整段反白，長按「拷貝」一次到位。iOS Safari 的 select() 不一定選得到
  // 唯讀欄位，所以再補一次 setSelectionRange。
  const selectAll = (event: React.SyntheticEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    field.select();
    field.setSelectionRange(0, field.value.length);
  };

  /** 把畫面上的 QR 重新組成一張「邀請卡」圖（含會員名/推薦碼/連結，不含任何按鈕）。 */
  const buildCardCanvas = (): HTMLCanvasElement | null => {
    const qrCanvas = qrRef.current?.querySelector('canvas');
    if (!qrCanvas) return null;
    return drawInviteCard({ qrCanvas, memberName, code, link: referralLink });
  };

  /** 下載邀請卡（也是「分享 QR Code」在不支援檔案分享時的退路）。 */
  const downloadCard = (card: HTMLCanvasElement) => {
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
   * 分享 QR Code：只送圖片，**不夾帶文字**。
   *
   * 為什麼不再把 text 與 files 一起送：Web Share API 附帶檔案時，文字要不要保留
   * 完全由接收端 App 決定，Android 的 Chrome/Edge 實測只會帶出圖片、把文字丟掉；
   * 而 navigator.canShare() 只驗證「檔案類型可分享」，**無法**告訴你文字會不會活著。
   * 混送等於賭運氣，賭輸的代價是推薦連結與推薦碼整個消失（推薦就斷了）。
   * 所以拆成兩顆按鈕：這顆專送圖（圖裡本來就有 QR 與推薦碼），文字交給「邀請好友」。
   * 不支援檔案分享的環境（多數桌機瀏覽器）或分享失敗時退回下載，使用者仍拿得到圖；
   * 使用者在面板上按取消（或連點）就停，與「邀請好友」同一套語意。
   */
  const shareQrCode = async () => {
    const card = buildCardCanvas();
    if (!card) {
      showToast('QR Code 尚未就緒，請稍後再試', 'error');
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          card.toBlob((b) => resolve(b), 'image/png'),
        );
        if (blob) {
          const file = new File([blob], inviteCardFileName(memberName, code), {
            type: 'image/png',
          });
          if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      } catch (error) {
        if (isShareStoppedByUser(error)) return;
        // 分享失敗 → 落回下載，圖片仍到得了手上。
      }
    }
    downloadCard(card);
  };

  if (!code) return null;

  return (
    <div className="flex flex-col gap-4">
      {memberName ? (
        <p className="text-center text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{memberName}</span> 的Uknow邀請
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
          bgColor={PIXEL_PAPER}
          fgColor={PIXEL_INK}
        />
      </div>

      {/* 推薦碼＋複製：與會員資訊卡、推薦管理共用同一顆。 */}
      <ReferralCodeWithCopy layout="centered" />

      {/* 邀請連結：唯讀欄位（不跳鍵盤、改不到；不換行，長了在框內橫捲），點進去整段
          反白；右側一顆複製鈕給不想手動複製的人。 */}
      <div className="space-y-1.5">
        <Label htmlFor="invite-link-field" className="text-muted-foreground">
          邀請連結
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="invite-link-field"
            readOnly
            value={referralLink}
            onFocus={selectAll}
            onClick={selectAll}
            className="bg-muted font-mono"
          />
          <Button
            tone="secondary"
            size="icon"
            className="shrink-0"
            onClick={() => copy(referralLink, '邀請連結已複製！')}
            aria-label="複製邀請連結"
            title="複製邀請連結"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* 兩顆按鈕各司其職，刻意不合併：文字與圖片一起送時，文字會被多數
          Android 分享目標丟掉（見 shareQrCode 的說明）。「邀請好友」永遠只送
          文字，推薦連結與推薦碼保證送達。 */}
      <div className="flex flex-wrap justify-center gap-2">
        <Button tone="secondary" size="sm" onClick={shareQrCode}>
          <Download className="mr-1 h-4 w-4" />
          分享 QR Code
        </Button>
        <Button
          tone="secondary"
          size="sm"
          onClick={() => shareReferralInvite(code, showToast)}
          data-testid="share-referral-button"
        >
          <Share2 className="mr-1 h-4 w-4" />
          邀請好友
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
