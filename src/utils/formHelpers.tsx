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
 * 用法: <FieldError id="field-error" error={errors.fieldName} />
 * 搭配 Input 的 aria-describedby="field-error" 使用
 */
export function FieldError({ error, id }: { error?: string; id?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive mt-1" role="alert">
      {error}
    </p>
  );
}

/**
 * 生成 Input 的 ARIA 屬性，供 Design for Testing 使用
 * 讓自動化測試可以透過 aria-invalid / aria-describedby 定位錯誤狀態
 *
 * 用法:
 *   <Input {...getInputAriaProps('email', errors.email)} />
 *   <FieldError id="email-error" error={errors.email} />
 */
export function getInputAriaProps(fieldId: string, error?: string) {
  return {
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${fieldId}-error` : undefined,
    'aria-required': true as const,
  };
}
