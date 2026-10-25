// 邀請分享 + 推薦碼跨步驟帶入。
//
// 兩件事收斂在這裡，讓「分享」與「自動帶入」只有一份實作、行為一致：
//   1. 分享：產生一段「同時含連結與推薦碼」的邀請訊息，先叫系統分享面板，用不了時
//      交給所在 App（LINE 好友選擇器），再不行才複製整段訊息到剪貼簿。
//   2. 帶入：把邀請連結上的推薦碼（?ref=）存進 localStorage，撐過
//      註冊漏斗（/register → OTP → 完善資料頁）後在完善資料頁自動帶入並驗證。
//
// 推薦碼不是機敏資料；真正的信任邊界仍在後端（/referrals/validate/:code 與
// /auth/register 照常驗證與綁定），這裡只是 UX 便利。

import { detectInAppBrowser, type InAppBrowserPlatform } from './browserDetection';
import { copyWithToast, type ShowToast } from './copyWithToast';
import { openExternalLink } from './externalLink';
import { normalizeReferralCode } from './referralCode';

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
export function buildInviteMessage(code: string, _memberName?: string | null): string {
  return `邀請你一起加入 Uknow：\n${buildReferralLink(code)}\n\n推薦碼 ${code}`;
}

/**
 * 複製整段邀請訊息並提示——分享的最後一順位。失敗時指向「我的 QR」頁的邀請連結欄位：
 * 會員中心與推薦管理沒有可手動複製的邀請文字（只露推薦碼）。面板被拒之後的複製發生在
 * .catch 裡、已脫離使用者手勢，WebKit 的 execCommand('copy') 在那裡可能更容易回 false
 * （推論，待真機驗證）。
 */
function copyInviteMessage(message: string, showToast: ShowToast): void {
  copyWithToast(
    message,
    '邀請訊息已複製到剪貼簿！',
    showToast,
    '複製失敗，請到「我的 QR」頁的邀請連結欄位複製',
  );
}

/**
 * 分享面板被拒時，哪些是使用者自己停手：AbortError＝在面板上按取消；InvalidStateError＝
 * 前一次 share() 還沒結束又按了一下（Web Share 規格，連點的第二下）。這兩種都不替使用者
 * 改走別條路。「邀請好友」與「分享 QR Code」共用這一條判斷。
 */
export function isShareStoppedByUser(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'InvalidStateError';
}

/** LINE 好友選擇器的分享網址。整段訊息編碼進 text：換行與連結裡的 `?ref=` 都要活著。 */
export function buildLineShareUrl(message: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(message)}`;
}

/**
 * 所在 App 自己的分享入口（第二順位），以 detectInAppBrowser 的 platform 為鍵。只收官方、
 * 不必註冊 App ID、按下就開好友選擇器的網址——目前只有 LINE 符合（Messenger 的傳送對話框
 * 要 Facebook App ID，IG 與微信沒有網頁分享入口）。要加一個 App 就在這裡加一列。
 */
const IN_APP_SHARE_URL: Partial<
  Record<NonNullable<InAppBrowserPlatform>, (message: string) => string>
> = {
  line: buildLineShareUrl,
};

/** 第二、三順位：所在 App 能直接分享就交給它，否則複製整段訊息並提示。 */
function shareViaHostAppOrCopy(message: string, showToast: ShowToast): void {
  const { platform } = detectInAppBrowser();
  const hostAppShareUrl = platform ? IN_APP_SHARE_URL[platform] : undefined;
  if (hostAppShareUrl) {
    // 只接得住導頁當下的同步例外（沙箱 iframe 禁止導頁之類）。開了 App 不等於送出了，
    // 所以不給任何成功提示。
    try {
      openExternalLink(hostAppShareUrl(message));
      return;
    } catch {
      /* 落到複製 */
    }
  }
  copyInviteMessage(message, showToast);
}

/**
 * 「邀請好友」——會員中心、推薦管理、我的 QR 頁都是這一支。使用者不一定透過 LINE
 * 分享（業主 2026-10-17），順位是：
 *   1. 系統分享面板（Web Share），讓使用者自己選 App 與對象——LINE 內建瀏覽器有面板時
 *      也一樣。text 帶完整邀請訊息（含連結＋推薦碼），不另外帶 url，避免部分 App 把
 *      url 再接到訊息尾端，導致連結出現兩次。使用者按取消（或連點）就停在那裡，不替他
 *      改走別條路。
 *   2. 面板確定用不了（不支援或出錯）時，所在 App 能直接分享就交給它（LINE → 好友選擇器）。
 *   3. 最後複製整段邀請訊息並提示，讓使用者自己貼。
 */
export function shareReferralInvite(
  code: string,
  showToast: ShowToast,
  _memberName?: string | null,
): void {
  if (!code) {
    showToast('推薦碼不存在', 'error');
    return;
  }

  const message = buildInviteMessage(code);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    navigator.share({ title: 'Uknow 專業服務平台', text: message }).catch((error: unknown) => {
      if (isShareStoppedByUser(error)) return;
      shareViaHostAppOrCopy(message, showToast);
    });
    return;
  }
  shareViaHostAppOrCopy(message, showToast);
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
    return raw?.trim() ? raw : null;
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
