/**
 * 刊登（listings）的 row 型別——權威來源是 migration，不是這個檔案。
 *
 * 欄位對應 `supabase/migrations/20260620000001_initial_schema.sql` 的
 * `create table public.listings`，該表自建立後從未被 ALTER。改 schema 時
 * 要回來同步這裡。
 *
 * ⚠️ `listings` 刻意不存 `is_active` / `active_until`——刊登本身沒有狀態或
 * 效期。是否對外顯示完全由帳號訂閱決定，且在資料層一處守門：
 * `public_listings` view 以 `has_active_subscription(user_id)` 過濾，會員
 * 過期／停權的刊登會自動從首頁消失。
 *
 * 這個型別**刻意不放 index signature**（`[key: string]: any`）——那會讓任何
 * 欄位名都合法，正是「UI 讀 listing.activeUntil 恆得 undefined、每筆刊登都
 * 顯示已過期」那個 bug 能靜默通過編譯的原因。讀到 tsc 說某欄位不存在時，
 * 先去 migration 對照：是真欄位就補進來，不是就是該刪的幽靈欄位。
 */

/** `contacts` jsonb。三個管道都是選填，但送出時至少要有一個（見 CreateServiceProvider）。 */
export interface ListingContacts {
  line?: string;
  instagram?: string;
  facebook?: string;
}

export interface ListingRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  city: string;
  /** text[] not null default '{}'——可能是空陣列，但不會是 null。 */
  districts: string[];
  /** 唯一可為 null 的欄位。 */
  gender: string | null;
  /** text[] not null default '{}'——可能是空陣列，但不會是 null。 */
  photos: string[];
  contacts: ListingContacts;
  description: string;
  created_at: string;
  updated_at: string;
}

/**
 * `public_listings` view（`20260620000004_security_hardening.sql`）。
 *
 * 今日 select 的欄位集與 `listings` 完全相同，故直接指向 ListingRow；分成兩個
 * 名字是因為語意不同——view 是「訪客看得到的刊登」，日後可能收窄欄位，屆時
 * 這裡就會分家。
 */
export type PublicListingRow = ListingRow;
