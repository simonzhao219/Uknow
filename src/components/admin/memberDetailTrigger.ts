/**
 * 「查看」觸發鈕的標記：父層關閉面板時用它把焦點還給開出面板的那顆鈕（載入期間鈕
 * 被停用，Radix 記不到它）。桌機表格與手機卡片兩處都掛同一個——這是跨檢視的契約，
 * 所以放在兩個檢視之外，只在這裡定義一次。
 */
const ATTR = 'data-member-detail-trigger';

export const memberDetailTriggerProps = (id: string) => ({ [ATTR]: id });

/** 逐一比對屬性值，不把 id 拼進選擇器——id 含引號或反斜線時選擇器會壞。 */
export function findMemberDetailTrigger(id: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(`[${ATTR}]`)).find(
      (el) => el.getAttribute(ATTR) === id,
    ) ?? null
  );
}
