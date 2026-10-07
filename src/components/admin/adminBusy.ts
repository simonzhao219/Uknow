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

export const NOOP_BUSY: AdminBusy = {
  locked: false,
  noteId: '',
  startWrite: () => () => {},
  startExport: () => ({ progress: () => {}, end: () => {} }),
};
