// 元件層用的遮罩 class：靜態引用（極小），analyticsConfig 的 blockClass 與它同源。

export const PH_BLOCK_CLASS = 'ph-no-capture';

/** 把 block class 併進既有欄位群組的 className（不新增節點，不影響版面）。 */
export function privateClass(extra?: string): string {
  return extra ? `${extra} ${PH_BLOCK_CLASS}` : PH_BLOCK_CLASS;
}
