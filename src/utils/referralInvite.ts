// 邀請分享 + 推薦碼跨步驟帶入。
//
// 兩件事收斂在這裡，讓「分享」與「自動帶入」只有一份實作、行為一致：
//   1. 分享：產生一段「同時含連結與推薦碼」的邀請訊息。手機與 LINE 內建瀏覽器直接
//      開 LINE 好友選擇器（shareToLine）；其餘優先叫系統原生分享面板，不支援（或在
//      會壞掉的 in-app 瀏覽器）時退回複製整段訊息到剪貼簿。
//   2. 帶入：把邀請連結上的推薦碼（?ref=）存進 localStorage，撐過
//      註冊漏斗（/register → OTP → 完善資料頁）後在完善資料頁自動帶入並驗證。
//
// 推薦碼不是機敏資料；真正的信任邊界仍在後端（verify-referral-code 與
// /auth/register 照常驗證與綁定），這裡只是 UX 便利。

import { detectInAppBrowser } from './browserDetection';
import { copyToClipboard } from './clipboard';
import { openExternalLink } from './externalLink';
import { normalizeReferralCode } from './referralCode';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

const PENDING_KEY = 'pending_referral_code';

/**
 * 邀請連結的網域來源：優先用建置時設定的正式網域（VITE_PUBLIC_APP_URL），
 * 否則退回目前站台 origin，這樣預覽環境也能產生可用連結、正式環境可用環境變數釘死。
 */
function appBaseUrl(): string {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

/** 產生帶推薦碼的邀請連結：`${base}/register?ref=<code>`。 */
export function buildReferralLink(code: string): string {
  return `${appBaseUrl()}/register?ref=${code}`;
}

/**
 * 產生分享用的邀請訊息 —— 無論原生分享或複製 fallback，內容一律同時含
 * 「連結」與「推薦碼」。連結只出現一次（分享時不再另外帶 url 欄位，避免部分
 * App 把 url 再接到訊息尾端造成重複）。
 */
export function buildInviteMessage(code: string): string {
  return `邀請你一起加入 Uknow：\n${buildReferralLink(code)}\n\n推薦碼 ${code}`;
}

/** 複製整段邀請訊息並提示——分享路徑的共同退路。 */
function copyInviteMessage(message: string, showToast: ShowToast): void {
  if (copyToClipboard(message)) {
    showToast('邀請訊息已複製到剪貼簿！', 'success');
  } else {
    showToast('複製失敗，請手動複製', 'error');
  }
}

/**
 * 系統原生分享面板；不支援或在會壞掉的 in-app 瀏覽器時退回複製。
 * text 帶完整邀請訊息（含連結＋推薦碼），不另外帶 url，避免部分 App 把 url
 * 再接到訊息尾端，導致連結出現兩次。
 */
function shareViaSystem(message: string, showToast: ShowToast): void {
  const { isInAppBrowser } = detectInAppBrowser();
  if (
    !isInAppBrowser &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    navigator.share({ title: 'Uknow 專業服務平台', text: message }).catch(() => {
      // 使用者取消分享，或分享失敗——安靜退回複製，讓邀請仍可完成。
      if (copyToClipboard(message)) {
        showToast('邀請訊息已複製到剪貼簿！', 'success');
      }
    });
    return;
  }
  copyInviteMessage(message, showToast);
}

/** LINE 好友選擇器的分享網址。整段訊息編碼進 text：換行與連結裡的 `?ref=` 都要活著。 */
export function buildLineShareUrl(message: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(message)}`;
}

/**
 * 開得起 LINE 的環境：LINE 內建瀏覽器本身，或觸控為主的裝置（手機／平板，LINE app
 * 接得住 line.me 的通用連結）。桌機多半沒有 LINE app，line.me 只會把人帶離本站
 * （openExternalLink 在原分頁開，沒有新分頁可退）。
 */
function opensLineDirectly(): boolean {
  if (detectInAppBrowser().platform === 'line') return true;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * 已加入者按「邀請好友」：直接開 LINE 好友選擇器，少掉「系統分享面板 → 選 LINE」
 * 那一層（業主 2026-10-17）。開不了 LINE 的環境（桌機）退回系統分享面板或複製。
 * 開了 LINE 不等於送出了，所以不給任何「已送出」提示。
 */
export function shareToLine(message: string, showToast: ShowToast): void {
  if (!opensLineDirectly()) {
    shareViaSystem(message, showToast);
    return;
  }
  try {
    openExternalLink(buildLineShareUrl(message));
  } catch {
    copyInviteMessage(message, showToast);
  }
}

/**
 * 「我的 QR」頁的「邀請好友」。LINE 內建瀏覽器改走 shareToLine（與會員中心的
 * 邀請好友同一支）——那裡的原生分享面板會壞，原本只能退回複製。其餘照舊：
 * 系統分享面板，不支援時複製。
 */
export function shareReferralInvite(code: string, showToast: ShowToast): void {
  if (!code) {
    showToast('推薦碼不存在', 'error');
    return;
  }

  const message = buildInviteMessage(code);
  if (detectInAppBrowser().platform === 'line') {
    shareToLine(message, showToast);
    return;
  }
  shareViaSystem(message, showToast);
}

// --- 推薦碼跨步驟帶入（撐過註冊漏斗）---

/** 記住邀請連結帶進來的推薦碼；存前一律正規化（NFKC + 小寫 + 去空白）。空值不寫入。 */
export function savePendingReferral(code: string): void {
  // `?ref=` 來自使用者可編輯的網址，全形數字同樣進得來。
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  try {
    localStorage.setItem(PENDING_KEY, normalized);
  } catch {
    // 忽略 storage 不可用（例如隱私模式）
  }
}

/** 讀取待帶入的推薦碼；沒有時回傳 null。 */
export function getPendingReferral(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

/** 註冊完成或放棄流程時清除，避免污染下一位使用者。 */
export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // 忽略
  }
}
