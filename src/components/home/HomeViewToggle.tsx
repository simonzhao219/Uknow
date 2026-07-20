import { Grid3x3, LayoutGrid } from "lucide-react";
import { cn } from "../ui/utils";
import type { HomeViewMode } from "../../utils/homeViewMode";

// 手機首頁「檢視方式」分段控制（segmented control）。
//
// 為什麼是分段控制而非單顆循環鈕：兩個選項同時露出、當前態一眼可辨、一次點到
// 目標模式，不必猜「點下去會變成哪個」。以「欄數」當圖示隱喻最直覺——
//   - 照片牆（3 欄密集）→ Grid3x3（9 小格）
//   - 詳細（2 欄卡片）  → LayoutGrid（2 大格）
//
// 純呈現元件：狀態由父層（HomePage）持有並負責持久化，這裡只回報點擊。
// icon-only 省手機空間，但每顆都補 aria-label + aria-pressed，螢幕報讀器
// 才不會只念到一顆空按鈕。

interface HomeViewToggleProps {
  value: HomeViewMode;
  onChange: (mode: HomeViewMode) => void;
  className?: string;
}

const OPTIONS: { mode: HomeViewMode; label: string; Icon: typeof Grid3x3 }[] = [
  { mode: "photo", label: "照片檢視", Icon: Grid3x3 },
  { mode: "detailed", label: "詳細檢視", Icon: LayoutGrid },
];

export function HomeViewToggle({ value, onChange, className }: HomeViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="檢視方式"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ mode, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={cn(
              // 44px 拇指熱區；未選態透明、選中態實心浮起（iOS 分段控制的視覺語言）
              "flex h-9 w-11 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
