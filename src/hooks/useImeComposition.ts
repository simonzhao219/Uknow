import { useRef } from 'react';
import type React from 'react';

interface ImeCompositionOptions {
  /** 組字進行中的每一次 input。**必須原樣 setState**,不得轉換或驗證。 */
  onCompose: (raw: string) => void;
  /** 組字結束,或根本沒在組字的一般輸入/貼上。這裡才可以安全地改寫值。 */
  onCommit: (value: string) => void;
}

/**
 * 讓「會改寫自己的值」的受控 input 在 IME 組字期間閉嘴。
 *
 * 為什麼需要這支 hook:React 受控元件在 re-render 時會比對 `props.value` 與
 * DOM 的 `node.value`,不一致就把 DOM 的值蓋掉。而 IME 組字期間,瀏覽器會把
 * 「正在組的字」當成 input 的值持續丟出 input 事件——此時只要 onChange 把值
 * 改寫成別的東西(轉換、截斷、或乾脆拒收讓值倒帶),React 就會在組字進行中
 * 寫回 `input.value`。
 *
 * WebKit(iOS Safari)遇到這種外部改寫會**丟掉 composition range 卻不清掉 IME
 * 自己的緩衝**,於是下一次按鍵時 IME 把整個緩衝當成新文字再插一次:注音符號
 * 一輪一輪累積(實測 8 → 32 字),最後選出來的漢字只能接在那串垃圾後面。
 * Desktop Chrome 與 Android 的復原行為寬容得多,所以在那些環境重現不出來。
 * 完整根因見 docs/plans/friction-log.md 的 2026-08-07 條。
 *
 * 用法:把回傳值展開到 input/textarea 上,並把原本的 onChange 邏輯拆成兩段——
 * 組字期間原樣收下(`onCompose`),組字結束才套用改寫(`onCommit`)。
 * 「原樣收下」不能省略成「不 setState」:那樣 React 會拿舊值寫回 DOM,
 * 正是更糟的那條路徑。
 *
 * ```tsx
 * const imeProps = useImeComposition<HTMLInputElement>({
 *   onCompose: (raw) => setName(raw),
 *   onCommit: (value) => setName(normalize(value)),
 * });
 * <Input value={name} {...imeProps} />
 * ```
 *
 * `onCommit` 必須是 idempotent 的:Chrome/Android 的 compositionend 早於最後
 * 一次 input 事件、Safari 相反,所以組字結束後 onCommit 可能被連呼兩次。
 * 這裡刻意不靠事件順序假設去去重——順序假設會在下一個瀏覽器版本失效。
 *
 * 不需要改寫值的欄位(onChange 只是 `setState(e.target.value)`)**不必用**
 * 這支 hook:值沒被改寫,React 就不會寫回 DOM,組字本來就是安全的。
 */
export function useImeComposition<E extends HTMLInputElement | HTMLTextAreaElement>({
  onCompose,
  onCommit,
}: ImeCompositionOptions) {
  const isComposing = useRef(false);

  return {
    onChange: (e: React.ChangeEvent<E>) => {
      // 兩道判定並存:`isComposing` ref 由 compositionstart/end 維護(jsdom 測
      // 得到),`nativeEvent.isComposing` 是瀏覽器的權威旗標(部分 Android IME
      // 會在沒發過 compositionstart 的情況下送出組字中的 input 事件)。
      const composing =
        isComposing.current || (e.nativeEvent as Partial<InputEvent>).isComposing === true;
      if (composing) {
        onCompose(e.target.value);
      } else {
        onCommit(e.target.value);
      }
    },
    onCompositionStart: () => {
      isComposing.current = true;
    },
    onCompositionEnd: (e: React.CompositionEvent<E>) => {
      isComposing.current = false;
      onCommit(e.currentTarget.value);
    },
  };
}
