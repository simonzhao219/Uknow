/**
 * 匯款類閘門（S5 §2.6、業主裁決 D、K5）：標記已匯款、勾選與批次、CSV、查看證件。
 *
 * 本次讀取確認前（與批次在途時）擋下點擊——第一個 render 就生效；停用的外觀與原因延遲
 * 0.3 秒，跟列表淡化同一個判準，0.3 秒內結束的更新不閃灰。不用原生 disabled：被按的鈕
 * 變停用，焦點會掉到 body，報讀器也聽不到原因。
 *
 * 提領頁的鈕與勾選框、工具列的 CSV、手機卡片的 ⋯ 選單共用這個形狀（中途對照 P2-12）。
 */
export interface RemittanceGate {
  /** 擋下點擊：`aria-disabled`、處理函式不動作。 */
  paused: boolean;
  /** 停用的外觀：更新超過 0.3 秒、失敗、逾時或批次在途。 */
  look: boolean;
  /** 原因所在節點的 id；暫停時以 `aria-describedby` 指向它。 */
  describedBy?: string;
  /** 觸控用的短原因（⋯ 選單項目內的小字）；報讀器走 `describedBy`。 */
  hint?: string;
}

/** 停用的外觀：只在 `data-paused="true"` 時套。 */
export const PAUSED_LOOK = 'data-[paused=true]:cursor-not-allowed data-[paused=true]:opacity-50';

/** 被閘的鈕與勾選框共用的屬性（外觀另套 `PAUSED_LOOK`）。 */
export function gateProps(gate: RemittanceGate) {
  return {
    'aria-disabled': gate.paused || undefined,
    'aria-describedby': gate.paused ? gate.describedBy : undefined,
    'data-paused': gate.paused && gate.look ? 'true' : undefined,
  };
}
