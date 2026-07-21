import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { QrCode, Download, Share2, Copy } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { buildReferralLink, shareReferralInvite } from '../../utils/referralInvite';

interface ReferralQRCodeProps {
  /** 會員的專屬推薦碼；QR Code 直接編碼成註冊邀請連結（含此推薦碼）。 */
  referralCode?: string | null;
  /** 會員名稱，僅用於下載檔名，讓業主一眼看出是誰的 QR Code。 */
  memberName?: string | null;
  className?: string;
}

/**
 * 會員專屬推薦 QR Code。
 *
 * 業主需求拆解：
 *   1.「刷了就知道是哪個會員」——QR 編碼的是會員專屬推薦碼（唯一），掃出來的連結
 *      帶著 ?ref=<code>，後端即可對應到是哪位會員。
 *   2.「刷了別人的可用於推薦」——別人掃這張 QR 就是走推薦流程。
 *   3.「掃了直接轉跳註冊且帶推薦碼」——QR 內容就是 buildReferralLink()，即
 *      `${base}/register?ref=<code>`；AuthPage 落地時會把 ?ref 存進 localStorage，
 *      撐過整個註冊漏斗（見 referralInvite.ts）。
 *
 * 因此這張 QR Code 與現有「分享推薦連結」用的是同一條連結、同一套帶碼機制，
 * 只是把「連結」換成「可掃描的圖」，不新增任何後端邏輯。
 */
export function ReferralQRCode({ referralCode, memberName, className = '' }: ReferralQRCodeProps) {
  const { showToast } = useNotification();
  const containerRef = useRef<HTMLDivElement>(null);

  const code = referralCode || '';
  const referralLink = code ? buildReferralLink(code) : '';

  const copyLink = () => {
    // 用隱藏 textarea + execCommand，與專案其他複製行為一致（不受 Clipboard 權限限制）。
    const textArea = document.createElement('textarea');
    textArea.value = referralLink;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('推薦連結已複製到剪貼簿！', 'success');
    } catch {
      showToast('複製失敗，請手動複製', 'error');
    }
    document.body.removeChild(textArea);
  };

  const downloadQRCode = () => {
    // qrcode.react 以 <canvas> 繪製，直接匯出成 PNG 讓業主可印製、貼在名片或店面。
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) {
      showToast('QR Code 尚未就緒，請稍後再試', 'error');
      return;
    }
    try {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeName = (memberName || 'uknow').replace(/[^\w一-龥-]+/g, '_');
      link.download = `Uknow-推薦QRCode-${safeName}-${code}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('QR Code 已下載！', 'success');
    } catch {
      showToast('下載失敗，請長按圖片另存', 'error');
    }
  };

  if (!code) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            我的推薦 QR Code
          </CardTitle>
          <CardDescription>加入推薦計畫並取得專屬推薦碼後，即可產生 QR Code。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          我的推薦 QR Code
        </CardTitle>
        <CardDescription>
          讓對方用手機相機掃描，即可直接前往註冊並自動帶入您的推薦碼。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div
            ref={containerRef}
            className="rounded-xl border bg-white p-4 shadow-sm"
            data-testid="referral-qrcode"
          >
            <QRCodeCanvas
              value={referralLink}
              size={200}
              level="M"
              marginSize={2}
              // 高對比、加白邊，確保各家相機／掃描 App 都能穩定辨識。
              bgColor="#ffffff"
              fgColor="#111111"
            />
          </div>
          <p className="font-mono text-sm tracking-wider text-purple-600">{code}</p>
          <p className="max-w-full break-all text-center text-xs text-muted-foreground">
            {referralLink}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={downloadQRCode} variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" />
            下載
          </Button>
          <Button onClick={copyLink} variant="outline" size="sm">
            <Copy className="mr-1 h-4 w-4" />
            複製連結
          </Button>
          <Button onClick={() => shareReferralInvite(code, showToast)} size="sm">
            <Share2 className="mr-1 h-4 w-4" />
            分享
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
