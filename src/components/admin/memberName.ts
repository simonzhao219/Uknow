/**
 * 會員的姓名。後端 `profiles.name` 是 `not null default ''`——註冊 Step 2 之前是空字串
 * （20260726000002_name_write_paths.sql），`admin_list_members` 不濾註冊進度——所以
 * 「沒有姓名」有 null 與空白兩種樣子，`name ?? email` 只擋得住前者。
 */
export function memberName(name: string | null): string | null {
  return name?.trim() || null;
}

/** 稱呼一位會員：有姓名用姓名，沒有就用 Email（按鈕名稱、確認框、錯誤訊息共用）。 */
export function memberLabel(member: { name: string | null; email: string }): string {
  return memberName(member.name) ?? member.email;
}
