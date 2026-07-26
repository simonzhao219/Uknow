// 完善資料（CompleteProfile）表單的驗證邏輯 —— 抽成純函式的「單一決策來源」。
//
// 為什麼獨立成一支：原本驗證寫在 component 裡，既不能單獨測試，也讓「按鈕該不該
// 反灰」和「錯誤訊息長怎樣」兩件事糊在一起。抽成純函式後：
//   1. 可用 vitest 直接釘死每條規則（本專案測試環境為 node、純函式取向）。
//   2. UI 只負責「呈現」錯誤，不再自己算規則，避免兩處邏輯漂移。
//
// 每條錯誤訊息都盡量「說出為什麼」，讓使用者不會對著看似填好的欄位卻卡住。

// 姓名有兩種模式,由表單切換鈕控制,預設中文(見 plan §2.1)。
// 前端依模式「嚴格」把關、後端採「聯集」——刻意的不對稱:後端只收到姓名
// 字串,就算加模式參數,攻擊者也只要宣稱自己是外文模式即可繞過,旗標沒有
// 安全價值。所以後端是安全邊界(擋任何模式都不合法的垃圾),前端是 UX
// 引導(讓「預設你該填中文」有強制力,且錯誤訊息永遠對得上當下模式)。
export type NameMode = 'zh' | 'foreign';

export interface ProfileFormValues {
  name: string;
  nameMode: NameMode;
  nationalId: string;
  phone: string;
  birthDate: string; // 'YYYY-MM-DD'
  agreedToTerms: boolean;
}

export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;

export const MIN_AGE = 18;

export const NAME_MAX_LENGTH: Record<NameMode, number> = {
  zh: 10,
  foreign: 50,
};

// 中文字元範圍 —— **逐字複製自 `supabase/functions/api/index.ts` 的 HAN_RANGE**
// (該處緊鄰 maskNameByGen)。兩個 runtime 隔離、無法共用常數,所以這裡靠
// 「逐字複製 + 註明出處」維持一致。
//
// 不得改用更常見但範圍較窄的 一-龥:那會對 CJK 擴充 A 區
// (㐀-䶿)與相容表意文字(豈-﫿)前端拒絕、後端放行。
// nameValidationCases.ts 有這兩個 range 的下界字元當機械探針。
//
// 已知涵蓋落差(規劃書 §2.3 殘留風險):不含擴充 B 區以上(surrogate pair)
// 與造字區,對應戶政「缺字」問題。這個正則原本只決定遮罩樣式,現在被當成
// 註冊關卡,同一落差的後果從「樣式不精準」變成「完全無法註冊」。
const HAN_RANGE = '\\u3400-\\u9FFF\\uF900-\\uFAFF';

// 中文模式:字元全為中文,且「恰好 0 或 1 個半形空格;有空格時兩邊各至少 2 字」。
// 空格文法必須明確界定——只寫 `[HAN]+( [HAN]+)*` 會放行「王 小 明」與「谷 辣」,
// 與動機案例「谷辣斯 尤達卡」的形狀不符,而前後端可能各自實作出不同結果卻仍全綠。
const ZH_NAME = new RegExp(`^(?:[${HAN_RANGE}]+|[${HAN_RANGE}]{2,} [${HAN_RANGE}]{2,})$`);

// 外文模式:僅英文字母,單字間單一半形空格,每個單字首字母大寫、其餘大小寫不限
// (人審裁決:`JOHN SMITH` 與 `John Smith` 皆合法)。
const FOREIGN_NAME = /^[A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*$/;

// 分隔符號類標點:任何「非中文、非英文字母、非數字、非半形空格」的字元。
// **刻意不列舉碼點**——只鎖 U+00B7/U+2027/U+30FB 會讓 bullet(•)、半形中點(･)、
// 全形空格等變體退回通用訊息,原地重現「照身分證輸入間隔號卻不知道該怎麼改」
// 的死巷,只是換一個字元觸發(規劃書 §4 的兜底要求)。
const SEPARATOR_LIKE = new RegExp(`[^${HAN_RANGE}A-Za-z0-9 ]`);

// 同一條規則的 global 版,供表單在輸入/貼上當下把分隔符號**主動換成半形空格**
// (見 CompleteProfile 的 handleNameChange)。刻意共用同一個字元集定義,
// 避免「驗證擋得住、轉換漏一個字元」這種兩邊各自為政的漂移。
export const SEPARATOR_LIKE_GLOBAL = new RegExp(`[^${HAN_RANGE}A-Za-z0-9 ]`, 'g');

export function validateName(name: string, mode: NameMode = 'zh'): string | undefined {
  if (!name.trim()) return '請輸入真實姓名';

  // 分隔符號優先判定:這句引導是必要功能而非文案潤飾。原住民漢字音譯姓名與
  // 新住民歸化漢名在身分證上帶間隔號,不放行就得讓他們知道改用半形空格,
  // 否則等於沒放行(規劃書 §7 的最高殘留風險)。
  if (SEPARATOR_LIKE.test(name)) return '請改用半形空格分隔（例：谷辣斯 尤達卡）';

  if (mode === 'zh') {
    if (!ZH_NAME.test(name)) {
      return '姓名須為中文字（例：王小明）。非中文姓名請點上方「外文姓名」';
    }
  } else if (!FOREIGN_NAME.test(name)) {
    return '外文姓名僅限英文字母，每個單字首字母大寫（例：John Smith）';
  }

  // 字元合法之後才談長度 —— 拿「姓名須為中文字」去回應一個全是合法中文字、
  // 只是太長的輸入,講的是錯的事。
  const max = NAME_MAX_LENGTH[mode];
  if ([...name].length > max) return `姓名最多 ${max} 個字元`;

  return undefined;
}

export function validateNationalId(rawId: string): string | undefined {
  const id = rawId.trim().toUpperCase();
  if (!id) return '請輸入身分證字號';
  if (!/^[A-Z]/.test(id)) return '身分證字號需以一個英文字母開頭（例：A123456789）';
  // 明確指出第 2 碼規則 —— 這正是「Q777777777」這類值會靜默卡住的地方。
  if (!/^[A-Z][12]/.test(id)) return '第 2 碼需為 1（男）或 2（女），例：A123456789';
  if (!/^[A-Z][12]\d{8}$/.test(id))
    return '身分證字號需為 1 碼英文字母加 9 碼數字（例：A123456789）';
  return undefined;
}

export function validatePhone(phone: string): string | undefined {
  if (!phone.trim()) return '請輸入手機號碼';
  if (!/^09\d{8}$/.test(phone)) return '手機號碼格式不正確（格式：09XXXXXXXX）';
  return undefined;
}

// now 以參數注入，讓「剛好滿 18 歲」等邊界能被測試釘死，也避免測試依賴系統時鐘。
export function validateBirthDate(birthDate: string, now: Date = new Date()): string | undefined {
  if (!birthDate) return '請選擇出生年月日';
  const parts = birthDate.split('-').map(Number);
  const [by, bm, bd] = parts;
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '請選擇出生年月日';
  }
  // 以本地日期元件比對，避免 new Date('YYYY-MM-DD') 被當成 UTC 午夜、
  // 在負時區出現差一天而誤判年齡。
  let age = now.getFullYear() - by;
  const monthDiff = now.getMonth() + 1 - bm;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bd)) {
    age--;
  }
  if (age < MIN_AGE) return `註冊用戶需年滿 ${MIN_AGE} 歲`;
  return undefined;
}

export function validateAgreedToTerms(agreed: boolean): string | undefined {
  if (!agreed) return '請同意服務條款';
  return undefined;
}

// 回傳所有「有問題」欄位的錯誤 map；空物件代表整張表單合法。
export function validateProfileForm(
  values: ProfileFormValues,
  now: Date = new Date(),
): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = validateName(values.name, values.nameMode);
  if (name) errors.name = name;
  const nationalId = validateNationalId(values.nationalId);
  if (nationalId) errors.nationalId = nationalId;
  const phone = validatePhone(values.phone);
  if (phone) errors.phone = phone;
  const birthDate = validateBirthDate(values.birthDate, now);
  if (birthDate) errors.birthDate = birthDate;
  const agreedToTerms = validateAgreedToTerms(values.agreedToTerms);
  if (agreedToTerms) errors.agreedToTerms = agreedToTerms;
  return errors;
}
