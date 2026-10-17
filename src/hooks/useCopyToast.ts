import { useCallback } from 'react';
import { useNotification } from '../components/notifications/NotificationContext';
import { copyWithToast } from '../utils/copyWithToast';

/** 元件用的 copyWithToast：推薦碼與邀請連結的複製鈕都用它。 */
export function useCopyToast(): (text: string, successMessage: string) => void {
  const { showToast } = useNotification();
  return useCallback(
    (text: string, successMessage: string) => {
      copyWithToast(text, successMessage, showToast);
    },
    [showToast],
  );
}
