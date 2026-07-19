// 註冊「完善資料」表單的草稿持久化 —— 對應 docs/multi-step-flow-recovery.md
// 契約第 1 條：「狀態要能撐過重整、不能只存在 React state 裡」。
//
// 事故：使用者在完善資料頁填到一半，點「服務條款」連結（或按上一頁、重整、
// 被 session 檢查導頁）→ CompleteProfile 這個 component 被卸載，它的
// useState(formData) 隨之蒸發，回來只剩一張空白表單，得整張重填。
//
// 這支模組把「當下填到一半的內容」持久化成草稿，讓表單在任何原因被卸載後
// 都能原樣接回。設計重點：
//   1. 純函式核心（serialize / parseDraft / sanitizeDraft）不碰任何全域，
//      可在本專案 node 環境的 vitest 下直接單元測試。
//   2. 儲存體以參數注入（StorageLike），預設用 sessionStorage：
//      - 撐得過同分頁導頁與重整（正是本 bug 的情境）。
//      - 分頁關閉即清除 —— 身分證字號等個資不長期落地，符合最小保存原則。
//   3. 讀取一律經過 sanitize：只收白名單欄位、限制長度、型別不符即丟棄，
//      避免被塞髒資料污染表單或撐爆儲存體。

export interface ProfileDraft {
  name: string;
  nationalId: string;
  phone: string;
  birthDate: string;
  referralCode: string;
  agreedToTerms: boolean;
}

// 儲存體只需要這三個方法，注入假物件即可在 node 下測試（不需 jsdom）。
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROFILE_DRAFT_KEY = 'uknow:draft:complete-profile';

// 各欄位的最大長度，和表單 maxLength / 驗證規則一致，避免草稿被塞超長字串。
const MAX_LEN: Record<keyof Omit<ProfileDraft, 'agreedToTerms'>, number> = {
  name: 10,
  nationalId: 10,
  phone: 10,
  birthDate: 10, // 'YYYY-MM-DD'
  referralCode: 32,
};

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // 保留使用者原始輸入，只截掉超長部分；不 trim，避免打字中途的空格被吃掉。
  return value.slice(0, max);
}

// 把任意 parse 出來的物件收斂成「只含已知欄位、型別正確」的部分草稿。
// 回傳 Partial：缺少的欄位交給呼叫端用預設值補齊，未知欄位一律丟棄。
export function sanitizeDraft(input: unknown): Partial<ProfileDraft> {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  const out: Partial<ProfileDraft> = {};

  (Object.keys(MAX_LEN) as Array<keyof typeof MAX_LEN>).forEach((key) => {
    const cleaned = cleanString(source[key], MAX_LEN[key]);
    if (cleaned !== undefined) out[key] = cleaned;
  });

  if (typeof source.agreedToTerms === 'boolean') {
    out.agreedToTerms = source.agreedToTerms;
  }

  return out;
}

// 判斷草稿是否「值得存」：全空的草稿沒有保存價值，回 false 讓呼叫端改成清除，
// 避免每次進頁面都留下一筆空草稿。
export function isDraftMeaningful(draft: Partial<ProfileDraft>): boolean {
  return Boolean(
    draft.name?.trim() ||
      draft.nationalId?.trim() ||
      draft.phone?.trim() ||
      draft.birthDate?.trim() ||
      draft.referralCode?.trim() ||
      draft.agreedToTerms,
  );
}

export function serializeDraft(draft: Partial<ProfileDraft>): string {
  return JSON.stringify(sanitizeDraft(draft));
}

// 反序列化 + 消毒；任何無法解析的輸入（null、壞 JSON、非物件）都安全回傳 {}，
// 絕不因為草稿壞掉就讓頁面炸掉。
export function parseDraft(raw: string | null): Partial<ProfileDraft> {
  if (!raw) return {};
  try {
    return sanitizeDraft(JSON.parse(raw));
  } catch {
    return {};
  }
}

// SSR / 測試 / 隱私瀏覽等情境下 sessionStorage 可能不存在或存取即拋錯，
// 一律以 try/catch 包住並降級成 no-op，storage 問題不該拖垮註冊流程。
function defaultStorage(): StorageLike | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function loadProfileDraft(storage: StorageLike | null = defaultStorage()): Partial<ProfileDraft> {
  if (!storage) return {};
  try {
    return parseDraft(storage.getItem(PROFILE_DRAFT_KEY));
  } catch {
    return {};
  }
}

export function saveProfileDraft(
  draft: Partial<ProfileDraft>,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    const clean = sanitizeDraft(draft);
    // 空草稿沒有保存價值，直接清掉，避免留下無意義的殘留。
    if (!isDraftMeaningful(clean)) {
      storage.removeItem(PROFILE_DRAFT_KEY);
      return;
    }
    storage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(clean));
  } catch {
    // 寫入失敗（如配額用盡）就算了，草稿是加分項，不能因此中斷填表。
  }
}

export function clearProfileDraft(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PROFILE_DRAFT_KEY);
  } catch {
    // 清除失敗無妨，下次載入時 sanitize 仍會擋掉髒資料。
  }
}
