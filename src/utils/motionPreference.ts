/** 使用者是否偏好減少動態（作業系統設定）。matchMedia 不存在時（測試、舊瀏覽器）視為不減少。 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
