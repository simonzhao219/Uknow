import { useEffect, useRef, useState } from 'react';
import type { RefreshOutcome } from '../../hooks/usePagedList';

/**
 * 手動重新整理（工具列的重新整理、錯誤區與陳舊提示的「重試」）的狀態文字。
 *
 * - 沒有更新在途時按下才 `reload()`；自動更新途中（鈕是 aria-disabled）不重送，接在
 *   `settled()` 上。
 * - 依**最後一次按下**所接的那條結算寫「已更新 HH:mm」或「更新失敗」，不從 `isUpdating`
 *   的邊緣推斷：慢更新 15 秒放行時 `isUpdating` 會先掉下去，邊緣推斷會在資料真正落地
 *   之前誤報「已更新」。
 * - 前一次按下還沒結算又按，文字在「正在更新」與「仍在更新」之間交替——同一串字報讀器
 *   不會再念一次，等於按了沒有回饋。
 * - 切回與寫入後的自動更新不寫、不播：只有按下的人需要回饋。
 * - 換篩選、寫入引起的重讀開始時頁面呼叫 `reset()`：上一次的「已更新」「更新失敗」已經
 *   不是在說眼前的列表；在等的那次按下一併作廢，晚到的結算不再寫入。
 */
export interface RefreshableList {
  /** 首次載入或背景更新中（慢更新時為 false，放行重新整理）。 */
  isUpdating: boolean;
  reload: () => Promise<RefreshOutcome>;
  settled: () => Promise<RefreshOutcome>;
}

const UPDATING = '正在更新';
const STILL_UPDATING = '仍在更新';

const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function useRefreshAnnouncer(list: RefreshableList): {
  statusText: string;
  refresh: () => void;
  reset: () => void;
} {
  const [statusText, setStatusText] = useState('');
  const shown = useRef('');
  const lastPress = useRef(0);
  const unsettled = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const show = (text: string) => {
    shown.current = text;
    setStatusText(text);
  };

  const refresh = () => {
    lastPress.current += 1;
    const press = lastPress.current;
    show(unsettled.current && shown.current === UPDATING ? STILL_UPDATING : UPDATING);
    unsettled.current = true;
    const outcome = list.isUpdating ? list.settled() : list.reload();
    void outcome.then((result) => {
      if (!mounted.current || press !== lastPress.current) return;
      unsettled.current = false;
      show(result === 'done' ? `已更新 ${clock(new Date())}` : '更新失敗');
    });
  };

  const reset = () => {
    lastPress.current += 1;
    unsettled.current = false;
    show('');
  };

  return { statusText, refresh, reset };
}
