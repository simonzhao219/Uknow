import { useCallback, useState } from 'react';

/**
 * 批次匯款的勾選。勾選屬於「某一批資料」：資料換一批（接受的落地，`dataVersion` +1）就不再
 * 成立——留著會讓「已選取 N 筆」指向已經不在畫面上的列，而下一步是不可回退的批次匯款。
 *
 * 以資料版本為鍵在 render 時推導，不靠落地後的 effect 清空（中途對照 P2-18）：effect 要等
 * 那一次 commit 之後才跑，新資料第一次出現的那個 render 仍會帶著舊勾選。
 */
export interface BatchSelection {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  /** 整頁取代（「全選」只勾已載入的這一頁）。 */
  replace: (ids: Iterable<string>) => void;
  clear: () => void;
}

const NONE: ReadonlySet<string> = new Set();

interface Marked {
  version: number;
  ids: ReadonlySet<string>;
}

export function useBatchSelection(version: number): BatchSelection {
  const [state, setState] = useState<Marked>({ version, ids: NONE });
  const toggle = useCallback(
    (id: string) =>
      setState((prev) => {
        const next = new Set(prev.version === version ? prev.ids : NONE);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { version, ids: next };
      }),
    [version],
  );
  const replace = useCallback(
    (ids: Iterable<string>) => setState({ version, ids: new Set(ids) }),
    [version],
  );
  const clear = useCallback(() => setState({ version, ids: NONE }), [version]);
  return {
    selected: state.version === version ? state.ids : NONE,
    toggle,
    replace,
    clear,
  };
}
