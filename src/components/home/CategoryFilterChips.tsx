import { FilterChip } from '../common/FilterChip';
import { allKnownCategories } from '../../utils/serviceCategories';

export interface CategoryFilterChipsProps {
  selectedCategory: string;
  /** 目前有可見刊登在用的自訂類別(內建 30 類已扣除)。 */
  customCategories: readonly string[];
  onSelect: (category: string) => void;
}

/**
 * 服務類別篩選(單選)。chip 以內容寬度自動換行排滿整行,取代一欄一項的直列。
 * 再點一次已選類別可取消(回到全部)。
 *
 * 自訂類別排在內建之後、視覺上不分群——對搜尋方而言「這個類別是誰定義的」
 * 不是有用的資訊。
 *
 * 抽出成獨立檔案(而非留在 `HomePage.tsx` 當 module-level function)是為了
 * 有測試落點:留在首頁裡的話,要驗「自訂類別篩得到」就得把整個首頁的
 * supabase 查詢、geolocation、router 一起拉起來。
 */
export function CategoryFilterChips({
  selectedCategory,
  customCategories,
  onSelect,
}: CategoryFilterChipsProps) {
  // allKnownCategories 順便去重:view 回傳的內建類別已由 deriveCustomCategories
  // 扣除,這裡再去一次是防呆——重複的 chip 會讓兩顆看起來一樣的按鈕篩到同一批
  // 刊登,使用者會以為篩選壞了。
  const categories = allKnownCategories(customCategories);

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip
        label="全部類別"
        selected={selectedCategory === ''}
        onToggle={() => onSelect('')}
      />
      {categories.map((category) => (
        <FilterChip
          key={category}
          label={category}
          selected={selectedCategory === category}
          onToggle={() => onSelect(selectedCategory === category ? '' : category)}
        />
      ))}
    </div>
  );
}
