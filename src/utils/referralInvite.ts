// 邀請分享 + 推薦碼跨步驟帶入。
//
// 兩件事收斂在這裡，讓「分享」與「自動帶入」只有一份實作、行為一致：
//   1. 分享：產生一段「同時含連結與推薦碼」的邀請訊息，優先叫系統原生分享面板，
//      不支援（或在會壞掉的 in-app 瀏覽器）時退回複製整段訊息到剪貼簿。
//   2. 帶入：把邀請連結上的推薦碼（?ref=）存進 localStorage，撐過
//      註冊漏斗（/register → OTP → 完善資料頁）後在完善資料頁自動帶入並驗證。
//
// 推薦碼不是機敏資料；真正的信任邊界仍在後端（verify-referral-code 與
// /auth/register 照常驗證與綁定），這裡只是 UX 便利。

import { detectInAppBrowser } from './browserDetection';

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
 * 「連結」與「推薦碼」。
 */
export function buildInviteMessage(code: string): string {
  return `邀請你一起加入：\nUknow ${buildReferralLink(code)}\n推薦碼 ${code}`;
}

/** 用隱藏 textarea + execCommand 複製文字（不受 Clipboard API 權限限制，相容性佳）。 */
function copyTextFallback(text: string): boolean {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch (err) {
    console.error('複製邀請訊息失敗:', err);
    return false;
  }
}

/**
 * 分享我的推薦邀請。
 * - 支援 Web Share API 且非會壞掉的 in-app 瀏覽器：叫系統原生分享面板，
 *   text 帶完整邀請訊息（含連結＋推薦碼），另帶 url 讓部分 App 直接吃連結預覽。
 * - 否則：複製整段邀請訊息到剪貼簿並提示。
 */
export function shareReferralInvite(code: string, showToast: ShowToast): void {
  if (!code) {
    showToast('推薦碼不存在', 'error');
    return;
  }

  const message = buildInviteMessage(code);
  const url = buildReferralLink(code);
  const { isInAppBrowser } = detectInAppBrowser();

  if (!isInAppBrowser && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    navigator
      .share({ title: 'Uknow 專業服務平台', text: message, url })
      .catch(() => {
        // 使用者取消分享，或分享失敗——安靜退回複製，讓邀請仍可完成。
        if (copyTextFallback(message)) {
          showToast('邀請訊息已複製到剪貼簿！', 'success');
        }
      });
    return;
  }

  if (copyTextFallback(message)) {
    showToast('邀請訊息已複製到剪貼簿！', 'success');
  } else {
    showToast('複製失敗，請手動複製', 'error');
  }
}

// --- 推薦碼跨步驟帶入（撐過註冊漏斗）---

/** 記住邀請連結帶進來的推薦碼；存前一律轉小寫去空白（比對後端小寫慣例）。空值不寫入。 */
export function savePendingReferral(code: string): void {
  const normalized = (code ?? '').toLowerCase().trim();
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
