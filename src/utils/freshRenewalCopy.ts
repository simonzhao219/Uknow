// 新約（fresh）的使用者文案單一來源：結帳頁新推薦碼欄的常駐說明與 placeholder、
// 新約確認框的推薦人句。三處必須說同一件事（第 5 波 S6；W5-7、W5-51、W5-55）。
//
// 推薦人句依「建單時會套用的來源」分句（後端 /payuni/prepare 與付款當下的 0d 換線）：
//   填碼且驗證通過 → 碼＝現任推薦人的碼：「維持」；其他碼：「將改為 {姓名}」
//   留空 → 預設推薦人可用（default）：「將改變」——不揭露預設推薦人（規格書 §7.4）
//        → 不可用或未知（keep，付款時維持原推薦人）：不寫推薦人句
// 使用者看得到的字一律不用「上線／下線」（W5-53）。
import type { RenewalInfo } from '@contract';

export type NewCodeStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'unavailable';

export interface FreshReferrerInput {
  code: string;
  codeStatus: NewCodeStatus;
  referrerName: string | null;
  /** 現任推薦人的碼（pendingUser.referredByCode）。 */
  currentCode: string | null;
  /** 現任推薦人是預設推薦人自動綁定的：不比對、不揭露。 */
  isAutoReferral: boolean;
  /** /subscriptions/status 的 renewal.freshDefaultReferrerAvailable；缺值（空窗）視為不可用。 */
  defaultAvailable: boolean | undefined;
  /** renewal.freshDefaultReferrerIsCurrent：預設推薦人就是現任推薦人（W5-63）；缺值走既有文案。 */
  defaultIsCurrent?: boolean;
}

/** 新約留空時推薦人會怎樣：換到預設推薦人／預設即現任而不變／預設不可用而維持原推薦人。 */
export type BlankFreshOutcome = 'changes' | 'keeps_same' | 'keeps';

export function blankFreshOutcome(
  _available: boolean | undefined,
  _isCurrent: boolean | undefined,
): BlankFreshOutcome {
  return 'keeps';
}

const sameCode = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function freshReferrerSentence(input: FreshReferrerInput): string | null {
  const code = input.code.trim();
  if (code) {
    if (input.codeStatus !== 'valid') return null;
    if (!input.isAutoReferral && input.currentCode && sameCode(code, input.currentCode)) {
      return `您的推薦人維持 ${input.referrerName ?? '原推薦人'}。`;
    }
    return input.referrerName
      ? `您的推薦人將改為 ${input.referrerName}。`
      : '您的推薦人將改為此推薦碼的會員。';
  }
  return input.defaultAvailable === true ? '您的推薦人將改變。' : null;
}

export function freshCodeHint(
  defaultAvailable: boolean | undefined,
  _defaultIsCurrent?: boolean,
): string {
  return defaultAvailable === true
    ? '選擇新約會重新建立推薦關係。若要留在原本的推薦人底下，請填入他的推薦碼；不填則推薦人將改變。'
    : '選擇新約會重新建立推薦關係。不填推薦碼則維持原本的推薦人。';
}

/** 只有「留空＝維持原推薦人」時才提示目前的碼；自動綁定的預設碼一律不外洩（決定 4）。 */
export function freshCodePlaceholder(
  currentCode: string | null,
  isAutoReferral: boolean,
  defaultAvailable: boolean | undefined,
  _defaultIsCurrent?: boolean,
): string {
  return currentCode && !isAutoReferral && defaultAvailable !== true
    ? `目前：${currentCode}`
    : '輸入推薦碼';
}

/** 新約會讓使用者失去東西嗎：點數、累積推薦、本輪已付補繳任一有值（確認鈕紅實心的判準，§12.11）。 */
export function hasFreshAssets(
  renewal: Pick<RenewalInfo, 'freshForfeitPoints' | 'freshForfeitReferrals' | 'hasPaidAnyBackfill'>,
): boolean {
  return (
    renewal.freshForfeitPoints > 0 ||
    renewal.freshForfeitReferrals > 0 ||
    renewal.hasPaidAnyBackfill
  );
}
