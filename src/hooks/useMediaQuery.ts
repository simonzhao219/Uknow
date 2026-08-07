import { useEffect, useState } from 'react';

/**
 * 訂閱 CSS media query 的比對結果。
 *
 * 原本是 `ReferralTreeView.tsx` 的檔內私有函式，提領作業台要用它做 W8
 * （手機鎖「標記已匯款」）時抽出來——與階段 2.2 的 `copyText` 同一個理由：
 * 復用不先抽取就會變成複製貼上，兩份各自演化到某天行為不一致。
 *
 * SSR 安全：`window` 不存在時回 false。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
