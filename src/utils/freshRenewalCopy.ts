// 紅燈 stub（S6 階段 6）：新約確認框與新推薦碼欄的文案單一來源，綠燈階段補實作。
import type { RenewalInfo } from '@contract';

export type NewCodeStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'unavailable';

export interface FreshReferrerInput {
  code: string;
  codeStatus: NewCodeStatus;
  referrerName: string | null;
  currentCode: string | null;
  isAutoReferral: boolean;
  defaultAvailable: boolean | undefined;
}

export function freshReferrerSentence(_input: FreshReferrerInput): string | null {
  return null;
}

export function freshCodeHint(_defaultAvailable: boolean | undefined): string {
  return '';
}

export function freshCodePlaceholder(
  _currentCode: string | null,
  _isAutoReferral: boolean,
  _defaultAvailable: boolean | undefined,
): string {
  return '';
}

export function hasFreshAssets(_renewal: RenewalInfo): boolean {
  return false;
}
