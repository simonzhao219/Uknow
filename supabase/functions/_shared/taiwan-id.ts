// ============================================================
// 台灣身分證字號檢查碼驗證（伺服器端唯一實作）
// ============================================================
// 格式：1 個英文字母 + 性別碼(1/2) + 8 碼數字，共 10 碼。
// 檢查碼：字母轉兩位數 n1n2，依權重 [1,9,8,7,6,5,4,3,2,1,1] 加權求和
// （n1、n2、d1..d9），總和 mod 10 == 0 才合法。
// ============================================================

const LETTER_MAP: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18,
  K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27,
  U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

const WEIGHTS = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];

/** 檢查一組字串是否為合法的台灣身分證字號（含檢查碼）。 */
export function isValidTaiwanId(input: string): boolean {
  const id = (input ?? '').trim().toUpperCase();
  if (!/^[A-Z][12]\d{8}$/.test(id)) return false;

  const letterValue = LETTER_MAP[id[0]];
  if (letterValue === undefined) return false;

  const digits = [
    Math.floor(letterValue / 10),
    letterValue % 10,
    ...id.slice(1).split('').map(Number),
  ];
  const sum = digits.reduce((acc, d, i) => acc + d * WEIGHTS[i], 0);
  return sum % 10 === 0;
}
