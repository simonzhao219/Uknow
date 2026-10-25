// 鍵盤焦點環的共用字串（ui-ux-guidelines §12.12）：3px、全不透明（`--ring` 指向
// `--sel`，過 WCAG 1.4.11 的 3:1），瀏覽器只在鍵盤操作時顯示。
//
// 兩種字串，不可合併——e2e（test_public_touch_targets.py）分別釘 box-shadow：
//   FOCUS_RING      環直接貼著元件（HomePage 浮動工具列的圖示鈕）。
//   FOCUS_RING_GAP  環外留 1px 間隙（間隙色＝版面底）。選中態是 --sel 實心的元件
//                   （chip、分段切換、縮圖）必須用這個，否則環與選中底色同色、融成一塊。
//
// 環色必須全不透明（連註解都不寫帶透明度的範例）：src/utils/repoHygiene.test.ts 掃描把關。
export const FOCUS_RING =
  'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring';

export const FOCUS_RING_GAP = `${FOCUS_RING} focus-visible:ring-offset-1 focus-visible:ring-offset-background`;
