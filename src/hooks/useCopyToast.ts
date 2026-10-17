import { useCallback } from 'react';
import { useNotification } from '../components/notifications/NotificationContext';
import { copyToClipboard } from '../utils/clipboard';

/**
 * 複製文字並提示結果。utils/clipboard 刻意不碰 toast（通知是呼叫端的責任），
 * 這裡是「呼叫端」那一半的共用版：推薦碼與邀請連結的複製鈕都用它，成功與
 * 失敗的提示只有一種寫法。
 */
export function useCopyToast(): (text: string, successMessage: string) => void {
  const { showToast } = useNotification();
  return useCallback(
    (text: string, successMessage: string) => {
      if (copyToClipboard(text)) showToast(successMessage, 'success');
      else showToast('複製失敗，請手動複製', 'error');
    },
    [showToast],
  );
}
