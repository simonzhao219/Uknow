import { Mars, Venus } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../ui/utils";
import { getGenderDisplay, type GenderIconName } from "../../utils/gender";

// 性別 Badge 共用元件（單一事實來源）。
//
// 取代原本散落在 HomePage（手機 / 桌面卡片）與 ServiceProviderDetail 的三份 inline
// 判斷。內容改用 lucide 的 SVG 圖示（Mars / Venus）而非 ♂ / ♀ Unicode 符號——SVG
// 在各平台像素一致，不會像 emoji 符號那樣在 iOS Safari 被放大後於 badge 內被裁切。

const GENDER_ICONS: Record<GenderIconName, typeof Mars> = {
  mars: Mars,
  venus: Venus,
};

interface GenderBadgeProps {
  /** 性別原始值（男 / 女）；無法辨識時不渲染任何東西 */
  gender: unknown;
  /** 是否顯示「男 / 女」文字（精簡的手機卡片只顯示圖示） */
  showLabel?: boolean;
  /** 是否套用藍 / 粉配色（outline 樣式用；secondary 樣式維持中性灰時傳 false） */
  applyColor?: boolean;
  variant?: React.ComponentProps<typeof Badge>["variant"];
  className?: string;
}

export function GenderBadge({
  gender,
  showLabel = true,
  applyColor = true,
  variant = "outline",
  className,
}: GenderBadgeProps) {
  const display = getGenderDisplay(gender);
  if (!display) return null;

  const Icon = GENDER_ICONS[display.iconName];

  return (
    <Badge
      variant={variant}
      className={cn(applyColor && display.colorClass, className)}
      aria-label={display.label}
    >
      <Icon aria-hidden="true" />
      {showLabel && display.label}
    </Badge>
  );
}
