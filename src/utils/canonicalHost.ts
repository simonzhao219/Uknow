// 紅燈期 stub：實作見下一個 commit。
interface LocationParts {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

export function canonicalRedirectUrl(_loc: LocationParts): string | null {
  return null;
}
