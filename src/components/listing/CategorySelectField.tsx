import { useEffect, useRef, useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useImeComposition } from '../../hooks/useImeComposition';
import { SERVICE_CATEGORIES } from '../../utils/constants';
import { FieldError, getInputAriaProps, getInputErrorClass } from '../../utils/formHelpers';
import {
  CUSTOM_CATEGORY_MAX_LENGTH,
  CUSTOM_CATEGORY_SENTINEL,
  allKnownCategories,
  validateCustomCategory,
} from '../../utils/serviceCategories';

const ERROR_ID = 'listing-category-error';

export interface CategorySelectFieldProps {
  /** 目前的類別值(可能是內建、也可能是自訂)。 */
  value: string;
  /** 回拋**已正規化、可直接送出**的類別值;無效輸入時回拋空字串。 */
  onChange: (category: string) => void;
  /** 目前有人在用的自訂類別(內建 30 類已扣除)。 */
  customCategories: readonly string[];
  error?: string;
  /** 測試接縫:直接以自訂模式開場,免去驅動 Radix 下拉的 portal 互動。 */
  startInCustomMode?: boolean;
}

/**
 * 刊登表單的服務類別欄位——`CreateServiceProvider` 與 `EditServiceProvider` 共用。
 *
 * 為什麼抽成共用元件而不是兩邊各寫一份:兩張表單現況是逐欄位複製的兩份,
 * 在兩處各疊同一組新邏輯等於再複製一層,而**只有 Edit 會遇到的那個失效模式**
 * (下面的 A9)就會只有一邊修好。抽出來之後,不變式只需維護一份,一個測試落點
 * 同時覆蓋兩張表單。
 *
 * **A9 不變式:`value` 一定配得到一個 `SelectItem`。**
 * 編輯一筆自訂類別的刊登時,`value` 來自 `listings`,選項卻來自另一條非同步的
 * `useCustomCategories`。若選項集合只有內建 30 項,Radix 會把 `<Select value="寵物美容">`
 * 顯示成未選擇的 placeholder——使用者以為類別被清空而手動重選,**原本的自訂類別
 * 就被覆蓋掉了**。`allKnownCategories(custom, value)` 把當前值併進選項集合,
 * 讓正確性不依賴載入時序(高延遲環境下「還沒載完」是常態,不是邊界)。
 */
export function CategorySelectField({
  value,
  onChange,
  customCategories,
  error,
  startInCustomMode = false,
}: CategorySelectFieldProps) {
  const knownCategories = allKnownCategories(customCategories, value);
  const [isCustomMode, setIsCustomMode] = useState(startInCustomMode);
  // 輸入框的值是**使用者原始輸入**,不是正規化後的結果——受控 input 的值一旦
  // 在 IME 組字期間被改寫,WebKit 會丟掉 composition range 卻不清 IME 緩衝,
  // 注音符號整串累積殘留(PR #212)。正規化的結果只往父層送,不回寫這裡。
  const [customText, setCustomText] = useState('');
  const [matchedExisting, setMatchedExisting] = useState<string | null>(null);
  // `validateCustomCategory` 的具體訊息(留白/超長/冒用保留字)。原本這些字串
  // 算出來就被丟掉,從未到達任何畫面——只有父層那句通用的「請選擇或輸入服務
  // 類別」會顯示,而它連被觸發的機會都沒有(見 touched 的說明)。
  const [customError, setCustomError] = useState<string | null>(null);
  // 使用者是否已經動過自訂輸入框。剛切到自訂模式就喊「請輸入自訂類別」是
  // 在罵還沒犯錯的人;但**動過之後又清空**就得說話——送出鈕在
  // `!formData.category` 時是 disabled 的,不講的話使用者只看到一顆按不下去
  // 的鈕,沒有任何線索。
  const [touched, setTouched] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  // 揭露後把焦點送進輸入框。⚠️ 這**不保證** iOS 會彈出軟鍵盤:Radix 關閉
  // 下拉時會把焦點送回 trigger,且 iOS 限制手勢呼叫堆疊之外的程式化 focus。
  // 版面上的緩解才是主要手段——輸入框緊接在 trigger 正下方,使用者的下一次
  // 點擊就在原地。
  useEffect(() => {
    if (isCustomMode) customInputRef.current?.focus();
  }, [isCustomMode]);

  const handleSelect = (selected: string) => {
    const choosingCustom = selected === CUSTOM_CATEGORY_SENTINEL;
    setIsCustomMode(choosingCustom);
    setCustomText('');
    setMatchedExisting(null);
    setTouched(false);
    // 切到自訂模式時先清空類別值:此時使用者還沒輸入任何東西,
    // 讓送出前的驗證擋得住(留著上一個選擇會讓空白的自訂輸入悄悄通過)。
    onChange(choosingCustom ? '' : selected);
  };

  // 組字期間**只**更新輸入框自己的值——把還沒組完的注音拿去驗證,會對著一串
  // 半成品宣稱「將歸入既有類別」。
  //
  // 為什麼用 useImeComposition 而不是單純的 onChange:這個受控值沒有被改寫
  // (正規化的結果只往父層送),IME 安全本來就成立;需要這支 hook 的理由是
  // **compositionend 不保證伴隨一次 input 事件**——少了 onCommit,父層就永遠
  // 停在最後一次組字中的注音。Chrome/Android 的 compositionend 早於最後一次
  // input、Safari 相反,所以不能靠事件順序假設補;onCommit 是 idempotent 的
  // (純粹從 raw 推導),被連呼兩次也無妨。
  const commitCustomInput = (raw: string) => {
    setCustomText(raw);
    setTouched(true);
    const result = validateCustomCategory(raw, knownCategories);
    setMatchedExisting(result.matchedExisting);
    setCustomError(result.error);
    onChange(result.value);
  };

  const customImeProps = useImeComposition<HTMLInputElement>({
    onCompose: setCustomText,
    onCommit: commitCustomInput,
  });

  const builtInSet = new Set<string>(SERVICE_CATEGORIES);
  const existingCustom = knownCategories.filter((category) => !builtInSet.has(category));
  const selectValue = isCustomMode ? CUSTOM_CATEGORY_SENTINEL : value;
  // 自訂模式下,元件自己算出的具體理由優先於父層的通用訊息。
  const displayError = (isCustomMode && touched ? customError : null) ?? error ?? undefined;

  return (
    <div className="space-y-2">
      <Label id="listing-category-label">服務類別 *</Label>
      <Select value={selectValue} onValueChange={handleSelect}>
        <SelectTrigger
          aria-labelledby="listing-category-label"
          className={getInputErrorClass(!!displayError)}
          // 內建模式也會有錯誤(整個沒選),但錯誤只靠 FieldError 的
          // role="alert" 宣讀一次;使用者事後 focus 回這顆 trigger 時,
          // 沒有這兩個屬性就再也聽不到錯誤關聯。
          aria-invalid={displayError ? true : undefined}
          aria-describedby={displayError ? ERROR_ID : undefined}
        >
          <SelectValue placeholder="選擇服務類別" />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          {SERVICE_CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
          {existingCustom.length > 0 && (
            <SelectGroup>
              <SelectSeparator />
              <SelectLabel>自訂類別</SelectLabel>
              {existingCustom.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectItem value={CUSTOM_CATEGORY_SENTINEL}>自訂類別…</SelectItem>
        </SelectContent>
      </Select>

      {isCustomMode && (
        <div className="space-y-1">
          <Label htmlFor="listing-custom-category">
            自訂類別名稱 * (最多{CUSTOM_CATEGORY_MAX_LENGTH}字)
          </Label>
          <Input
            id="listing-custom-category"
            ref={customInputRef}
            value={customText}
            // 上限交給 maxLength 屬性,不做 JS 拒收——條件性拒收會在 IME
            // 組字期間把值倒帶回上一次,比改寫更糟(見 PR #212 與
            // scripts/check-ime-safe-inputs.py 的 I1/I2)。maxLength 屬性
            // 本身是 IME 安全的:瀏覽器不對組字中的文字套用長度限制。
            {...customImeProps}
            placeholder="例：寵物美容"
            maxLength={CUSTOM_CATEGORY_MAX_LENGTH}
            className={getInputErrorClass(!!displayError)}
            {...getInputAriaProps('listing-category', displayError ?? undefined)}
          />
          <div className="text-right text-sm text-muted-foreground">
            {customText.length}/{CUSTOM_CATEGORY_MAX_LENGTH}
          </div>
          {matchedExisting && (
            // 不講的話,使用者不會知道自己打的字被換成別的了。
            <p className="text-sm text-muted-foreground">將歸入既有類別「{matchedExisting}」</p>
          )}
        </div>
      )}

      <FieldError id={ERROR_ID} error={displayError} />
    </div>
  );
}
