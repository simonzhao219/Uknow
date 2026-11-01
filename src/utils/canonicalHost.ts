// Cloudflare Pages 專案根網址（uknow.pages.dev）＝ main 的建置，連正式站 Supabase，
// 但正式站 Edge Function 的 CORS 只放行 FRONTEND_URL（https://uknow.com.tw），
// 所以在這個網址登入會因 Failed to fetch 失敗。一進站就導向正式網域。
//
// 只比對「精確等於」：develop.uknow.pages.dev 與各預覽別名（*.uknow.pages.dev）
// 有自己的後端，不能動。不用 _redirects／404.html／Pages Functions——
// 見 public/_redirects 檔頭 2026-08-07 事故。
const PAGES_ROOT_HOST = 'uknow.pages.dev';
const CANONICAL_ORIGIN = 'https://uknow.com.tw';

interface LocationParts {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

/** 該導向時回傳完整目標 URL（保留 path＋query＋hash），否則 null。 */
export function canonicalRedirectUrl(loc: LocationParts): string | null {
  // 結尾點是合法的絕對 FQDN 寫法（uknow.pages.dev.），視為同一主機
  const host = loc.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== PAGES_ROOT_HOST) return null;
  return `${CANONICAL_ORIGIN}${loc.pathname}${loc.search}${loc.hash}`;
}
