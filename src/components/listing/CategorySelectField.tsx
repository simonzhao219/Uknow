/** 階段 3 stub——只求型別過,行為留空(TDD 紅燈期)。 */

export interface CategorySelectFieldProps {
  value: string;
  onChange: (category: string) => void;
  customCategories: readonly string[];
  error?: string;
  /** 測試接縫:直接以自訂模式開場,免去驅動 Radix 下拉的 portal 互動。 */
  startInCustomMode?: boolean;
}

export function CategorySelectField(_props: CategorySelectFieldProps) {
  return null;
}
