// 表單輔助工具 - 統一錯誤顯示樣式

/**
 * 生成輸入框錯誤樣式的 className
 * 用法: className={getInputErrorClass(!!errors.fieldName)}
 */
export function getInputErrorClass(hasError: boolean): string {
  return hasError ? 'border-destructive focus-visible:ring-destructive' : '';
}

/**
 * 錯誤訊息顯示組件
 * 用法: <FieldError error={errors.fieldName} />
 */
export function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-sm text-destructive mt-1">{error}</p>;
}
