import { copyToClipboard } from './clipboard';

export type ShowToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

/**
 * 複製文字並提示結果——「複製＋提示」只有這一份。clipboard.ts 刻意不碰 toast（通知是
 * 呼叫端的責任），這裡是呼叫端那一半的共用版：useCopyToast（推薦碼、邀請連結的複製鈕）
 * 與 referralInvite（邀請好友的最後一順位）都呼叫它。失敗提示可由呼叫端指定，指向
 * 使用者能手動複製的地方。
 */
export function copyWithToast(
  text: string,
  successMessage: string,
  showToast: ShowToast,
  failureMessage = '複製失敗，請手動複製',
): boolean {
  if (copyToClipboard(text)) {
    showToast(successMessage, 'success');
    return true;
  }
  showToast(failureMessage, 'error');
  return false;
}
