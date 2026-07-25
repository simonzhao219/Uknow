import { cn } from '../ui/utils';

// 單選分段控制項（segmented control）：選項少（2–4 個）、互斥、且必選其一時用它，
// 取代「一排會換行的 chip」。
//
// 與 FilterChip 的分工：
//   - FilterChip：選項多、可複選、數量不定（服務類別、地區）→ 允許 flex-wrap 換行。
//   - SegmentedFilter：選項少且互斥（來源群組）→ 等寬瓜分整行寬度、**永不換行**，
//     版面高度固定為一列，窄欄位（桌面半欄卡片、手機）都是同一個形狀。
//
// 等寬用 flex-1 而非 grid-cols-N：N 是執行期資料長度，Tailwind JIT 無法產生動態
// class（grid-cols-${n} 會靜默失效——見 UI/UX 報告「無 Tailwind 建置」那條的同類坑）。
// 觸控目標由 min-h-10 + 外框 p-1 保證（≈48px），符合行動裝置最小可點面積。
// 選取視覺沿用全站語言：實心 primary = 已選、透明 = 未選。

export interface SegmentedFilterOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedFilterProps<T extends string> {
  options: readonly SegmentedFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 給螢幕閱讀器的群組名稱（例：來源分類） */
  ariaLabel: string;
  className?: string;
}

export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedFilterProps<T>) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        // min-w-0：fieldset 的預設 min-width 是 min-content，不歸零的話
        // 窄容器裡會被子項撐開、溢出卡片邊界。
        'flex w-full min-w-0 items-center gap-1 rounded-full bg-muted p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-10 min-w-0 flex-1 truncate rounded-full px-3 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              // 選中態「浮起」而非塗滿 primary：沿用站內既有分段控制的視覺語言
              // （見 home/HomeViewToggle），也讓第二層的 FilterChip（實心 primary）
              // 在同一張卡裡明顯是次級選擇，兩層不會看起來同權。
              selected
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
