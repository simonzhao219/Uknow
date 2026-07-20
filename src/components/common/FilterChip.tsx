import { cn } from "../ui/utils";

// 篩選用的切換式 chip（膠囊按鈕），手機底部篩選面板與桌面篩選區共用，
// 讓兩個平台的「選取」視覺語言一致：實心 = 已選、外框 = 未選。
//
// 為什麼用 chip 而不是 radio / checkbox 直列：
//   - 選項本身就是完整的點擊目標（整顆 chip 可點），不必精準點中小圓圈；
//   - flex-wrap 讓選項依內容寬度自動排滿整行，30 個類別在手機上約 10 列內
//     即可看完，取代原本一欄一項、右側大片留白、要滑很久的直列。
// 觸控目標高度由 py-2（約 40px）保證，符合行動裝置最小可點面積。

interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  className?: string;
}

export function FilterChip({
  label,
  selected,
  onToggle,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-full border px-3.5 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : // 未選用 border-border 而非 border-input：本專案亮色主題的
            // --input 是 transparent，會讓未選 chip 看起來像純文字、失去可點的暗示。
            "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      {label}
    </button>
  );
}
