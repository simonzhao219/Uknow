// 紅燈期佔位：分類與連續失敗判定尚未實作。
export type PayUniRejectionKind = 'merchant' | 'user';

export function classifyPayUniRejection(_data: Record<string, string>): PayUniRejectionKind {
  return 'user';
}

export function isFailureBurst(_userIds: string[]): boolean {
  return false;
}
