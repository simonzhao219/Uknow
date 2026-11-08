// 敏感欄位清單（W4-37：身分證、手機、生日、銀行欄位整塊 block）。
// 這是**退化防線，不是保證**：主規則是「新欄位設對 autocomplete／type，或把
// privateClass() 併進欄位群組根容器」；清單測試掃原始碼，抓「有人新增或改掉卻漏了 block」。
// /admin 整段不錄（recordingAllowed）且路由層有 PrivateRegion，故 components/admin 不在此列。

export interface SensitiveField {
  /** 相對 src/ 的檔案 */
  file: string;
  /** 群組根容器的錨點：該行之前最近的 <div 必須帶 block class */
  anchor: string;
  /** 該欄位 <Input> 的 id（若有），用來檢查必要的輸入屬性 */
  inputId?: string;
  /** <Input> 元素內必須出現的屬性字串（行動版鍵盤與自動填入） */
  attrs?: string[];
}

export const SENSITIVE_FIELDS: SensitiveField[] = [
  { file: 'components/CompleteProfile.tsx', anchor: 'htmlFor="nationalId"', inputId: 'nationalId' },
  {
    file: 'components/CompleteProfile.tsx',
    anchor: 'htmlFor="birthDate"',
    inputId: 'birthDate',
    attrs: ['autoComplete="bday"'],
  },
  {
    file: 'components/CompleteProfile.tsx',
    anchor: 'htmlFor="phone"',
    inputId: 'phone',
    attrs: ['autoComplete="tel-national"', 'inputMode="tel"'],
  },
  {
    file: 'components/reward/IdNumberInput.tsx',
    anchor: 'htmlFor="idNumber"',
    inputId: 'idNumber',
  },
  {
    file: 'components/reward/WithdrawalProcess.tsx',
    anchor: 'htmlFor="idNumber"',
    inputId: 'idNumber',
  },
  { file: 'components/reward/WithdrawalProcess.tsx', anchor: 'htmlFor="bankCode"' },
  {
    file: 'components/reward/WithdrawalProcess.tsx',
    anchor: 'htmlFor="bankAccount"',
    inputId: 'bankAccount',
    attrs: ['inputMode="numeric"'],
  },
  { file: 'components/reward/WithdrawalProcess.tsx', anchor: '<Label>上傳身分證正面照' },
  { file: 'components/reward/WithdrawalProcess.tsx', anchor: '<Label>上傳身分證背面照' },
  { file: 'components/reward/IdVerificationSection.tsx', anchor: 'htmlFor="id-front"' },
  { file: 'components/reward/IdVerificationSection.tsx', anchor: 'htmlFor="id-back"' },
  // 會員中心「個人資料」卡：唯讀文字，只有文字遮罩會露出長度，所以整塊 block。
  { file: 'components/MemberDashboard.tsx', anchor: '>真實姓名</p>' },
  { file: 'components/MemberDashboard.tsx', anchor: '>聯絡電話</p>' },
  { file: 'components/MemberDashboard.tsx', anchor: '>Email</p>' },
];

/** 路由層必須包 PrivateRegion 的路徑（付款頁、後台）。 */
export const PRIVATE_ROUTES = ['/payment/checkout', '/payment/result', '/admin'];

/**
 * 渲染在 portal 的敏感內容：外層欄位群組的 block class 涵蓋不到，要在 portal 內容自己帶。
 * 銀行代號下拉：Radix 只在已選項底下渲染勾選圖示、點擊互動又會記下節點，選項順序固定，
 * 從結構與點擊就推得出選了哪家銀行。anchor 那一行本身必須含 block class。
 */
export const SENSITIVE_PORTALS = [
  { file: 'components/reward/WithdrawalProcess.tsx', anchor: '<SelectContent' },
  {
    file: 'components/PaymentCheckout.tsx',
    anchor: '<AlertDialogContent data-testid="fresh-confirm-dialog"',
  },
];
