import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FilterChip } from '../common/FilterChip';
import { Button } from '../ui/button';
import { SERVICE_CATEGORIES } from '../../utils/constants';
import { allKnownCategories } from '../../utils/serviceCategories';

/**
 * 自訂類別預設露出幾個;超過才收合。
 *
 * 判準是 375px 的手機篩選面板:3～4 字的 chip 一列約放 3 顆,8 顆約 3 列
 * (連同小標不到 100px),不會把面板裡的「服務地區」區塊推出視野。門檻以下
 * 完全不觸發收合——今天自訂類別還少,這個機制在多數情境是 no-op,它存在的
 * 理由是**這是全站唯一沒有上限的清單**(內建 30 類是常數,自訂是 `count(*)`)。
 *
 * 界限有兩層,這是**上面那層**:收合讓「預設看到的面板」高度有上界。它管不到
 * 展開態——展開時 `visibleCustom = custom`,所有自訂 chip 都渲染在同一個
 * 面板裡。下面那層在 `ui/popover.tsx`:`PopoverContent` 帶
 * `max-h-(--radix-popover-content-available-height) + overflow-y-auto`,
 * 保證面板無論多長都不會超出視窗、底部 chip 永遠點得到。缺了那層,展開
 * 就是把收合擋下的問題原樣放回來(portal + fixed 沒有捲軸)。
 */
export const CUSTOM_CATEGORY_VISIBLE_LIMIT = 8;

/** 自訂類別區的小標。對外用語刻意維持「類別」,不引入第二個名詞——見檔頭。 */
const CUSTOM_GROUP_LABEL = '自訂創意類別';

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
 * **內建與自訂分成兩區**:內建 30 類在上、一條分隔線與小標之後才是自訂類別。
 * 這推翻了本檔原本「視覺上不分群」的決定,理由要講清楚,因為**原本那條理由
 * 至今仍然成立**——對搜尋方而言「這個類別是誰定義的」確實不是有用的資訊,
 * 所以分區的目的不是標示出身,而是這三件事:
 *
 *   1. **這是全站唯一沒有上限的清單。** 內建是常數,自訂是 `group by` 的
 *      `count(*)`,今天 3 個、明年可能 50 個,原本的設計對此沒有任何答案。
 *   2. **自訂區的順序會自己浮動。** 排序是使用數 desc(deriveCustomCategories),
 *      同一顆 chip 的位置在兩次造訪之間會變。內建 30 類順序固定、可以形成
 *      位置記憶;混在一起等於宣告整條清單都不可信。
 *   3. **品質不齊。** 自訂類別是使用者打的字,會有近似詞與 listing_count = 1
 *      的自嗨類別。平鋪在官方 30 類裡,是拿官方類別的可信度替它們背書。
 *
 * 順序維持「自訂在後」不可反轉:自訂放前面的話,每冒出一個新自訂類別,
 * 30 顆內建 chip 就整體位移一次,位置記憶(理由 2)直接報廢。
 *
 * 分區只用分隔線＋小標,**不動 chip 本身的視覺**:`FilterChip` 的樣式語言
 * 已經被「實心=已選、外框=未選」佔滿,再加虛線或換色會被讀成第三種選取狀態,
 * 乘上深色模式就是四種組合要驗,收益卻只有一個沒人需要的出身標示。
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
  const [expanded, setExpanded] = useState(false);
  // 這個元件在 HomePage 會有兩個實例(桌面 popover 與手機面板),寫死的 id
  // 會讓兩邊的 aria-labelledby 指向同一個節點。
  const labelId = useId();

  // allKnownCategories 順便去重:view 回傳的內建類別已由 deriveCustomCategories
  // 扣除,這裡再去一次是防呆——重複的 chip 會讓兩顆看起來一樣的按鈕篩到同一批
  // 刊登,使用者會以為篩選壞了。扣掉內建之後剩下的就是自訂區的內容,與
  // `CategorySelectField` 算 existingCustom 的方式相同。
  const builtInSet = new Set<string>(SERVICE_CATEGORIES);
  const custom = allKnownCategories(customCategories).filter(
    (category) => !builtInSet.has(category),
  );

  const collapsible = custom.length > CUSTOM_CATEGORY_VISIBLE_LIMIT;
  const collapsed = collapsible && !expanded;
  // 收合時仍然要看得到「目前套用中的那一個」。打開篩選面板卻找不到自己選的
  // 條件,是準則裡「看得到、動不了的殭屍狀態」的近親——使用者會以為條件掉了。
  //
  // 把它接在露出的那批後面,而不是強制整區展開:展開會讓收合鈕看起來按不動
  // (state 明明變了,畫面卻沒變),而且沒有必要——使用者要的是看到自己的條件,
  // 不是看到另外 40 個。
  //
  // 這裡刻意在 render 期推導、不用 useEffect 或 useState 初值:customCategories
  // 是非同步載入的(useCustomCategories),初次 render 時是空陣列,算在初值裡
  // 會永遠停在「不需要處理」。
  const hiddenCustom = collapsed ? custom.slice(CUSTOM_CATEGORY_VISIBLE_LIMIT) : [];
  const visibleCustom = collapsed
    ? [
        ...custom.slice(0, CUSTOM_CATEGORY_VISIBLE_LIMIT),
        ...(hiddenCustom.includes(selectedCategory) ? [selectedCategory] : []),
      ]
    : custom;

  const renderChip = (category: string) => (
    <FilterChip
      key={category}
      label={category}
      selected={selectedCategory === category}
      onToggle={() => onSelect(selectedCategory === category ? '' : category)}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="全部類別"
          selected={selectedCategory === ''}
          onToggle={() => onSelect('')}
        />
        {SERVICE_CATEGORIES.map(renderChip)}
      </div>

      {/* 一個空的小標等於宣告「這裡本來有東西」,所以整區(含分隔線)一起不渲染。 */}
      {custom.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p id={labelId} className="text-xs font-medium text-muted-foreground">
            {CUSTOM_GROUP_LABEL}
          </p>
          {/* role=group + aria-labelledby:視覺上的分隔線對輔助技術不存在,
              沒有這一層,螢幕閱讀器使用者拿到的仍是一整串沒有邊界的按鈕。
              內建那區不另外包 group——與 `CategorySelectField` 的 SelectGroup
              只包自訂項一致,而且手機面板外層已經有 h3「服務類別」,再包一層
              同義的 group 只是多唸一次。 */}
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
            {visibleCustom.map(renderChip)}
            {collapsible && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={!collapsed}
                onClick={() => setExpanded((previous) => !previous)}
                // 這顆鈕**必須有邊框**,不能用 ghost:本專案亮色主題下沒有邊框
                // 的控制項看起來就是一段純灰字,失去可點的暗示——`FilterChip`
                // 檔頭記過同一個失效模式(--input 是 transparent),這裡是同一課。
                // 邊框讓它與相鄰 chip 的視覺節奏一致,chevron 與 muted 文字色
                // 則說明它不是一個可篩選的類別值。min-h-10 對齊 chip 高度,
                // 少了它這顆鈕在同一列裡會矮一截,像掉出清單之外的東西。
                className="min-h-10 gap-1 rounded-full px-3.5 text-muted-foreground"
              >
                {collapsed ? `顯示全部 (${custom.length})` : '收合'}
                {collapsed ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
