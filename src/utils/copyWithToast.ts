// TDD 紅燈 stub：綠燈實作會換掉。
type ShowToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

export function copyWithToast(
  _text: string,
  _successMessage: string,
  _showToast: ShowToast,
  _failureMessage?: string,
): boolean {
  return false;
}
