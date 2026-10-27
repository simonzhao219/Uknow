/**
 * 後台的「忙碌」：寫入在途或匯出中時鎖分頁（S5 §2.11）。
 *
 * AdminConsole 持有實作並往下傳；各頁以選填 prop 接，預設 NOOP_BUSY（不鎖）——既有測試
 * 不傳就照舊。型別一次定案（含讀取側的 locked／noteId），殼層接上時不再改簽名。
 *
 * 寫入站點一律 `const release = busy.startWrite(); try { await 送出 } finally { release(); }`：
 * 只包住寫入請求，結算後立即釋放、不等後續的重讀。release 冪等（重複呼叫不讓計數變負）。
 */
export interface AdminExportSession {
  progress(collected: number, total: number): void;
  end(): void;
}

export interface AdminBusy {
  /** 有寫入在途或匯出中。 */
  locked: boolean;
  /** 說明行的 id：停用的分頁以 aria-describedby 指向它。 */
  noteId: string;
  startWrite(): () => void;
  startExport(): AdminExportSession;
}

/**
 * 鎖住的分頁（外層四個、會員區的兩個子分頁）：原生 disabled 立即生效——Radix 鍵盤導覽跳過、點
 * 不動；停用的外觀等 0.3 秒，跟列表淡化同一個判準，0.3 秒內結束的寫入不閃灰。外觀只在
 * `data-locked="true"` 時套；蓋掉 TabsTrigger 基底的 `disabled:opacity-50`。
 */
const LOCKED_TAB_LOOK = 'disabled:opacity-100 data-[locked=true]:disabled:opacity-50';

/**
 * 被擋下的鈕與勾選框（`aria-disabled`，不離開焦點順序）的停用外觀：只在 `data-paused="true"` 時套。
 * 匯款類閘門（`remittanceGate.ts` 的 `gateProps`）與未確認時的「載入更多」共用——外觀不是閘門語意，
 * 所以住在這裡（最後對照 P2-3）。
 */
export const PAUSED_LOOK = 'data-[paused=true]:cursor-not-allowed data-[paused=true]:opacity-50';

/**
 * 鎖住的分頁共用的屬性（比照 `gateProps()`）：停用與 `aria-describedby` 指向說明行在鎖定當下
 * 生效，`look`（延遲 0.3 秒的旗標）為真才帶停用外觀。
 */
export function lockedTabProps(locked: boolean, look: boolean, noteId: string) {
  return {
    disabled: locked,
    'aria-describedby': locked ? noteId : undefined,
    'data-locked': locked && look ? 'true' : undefined,
    className: LOCKED_TAB_LOOK,
  };
}

export const NOOP_BUSY: AdminBusy = {
  locked: false,
  noteId: '',
  startWrite: () => () => {},
  startExport: () => ({ progress: () => {}, end: () => {} }),
};
