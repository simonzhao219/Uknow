import { cn } from '../ui/utils';

/**
 * 給使用者確認的 Email：不截斷、只換行（業主裁決，ui-ux-guidelines §10）。
 *
 * @ 後放 <wbr>，長 Email 優先在網域前斷開；網域本身也比一行長時，
 * `wrap-anywhere` 保底在任意字元斷。`wrap-anywhere` 同時把最小寬度降到一個字，
 * 放在 flex 子項裡也不會撐破容器（`break-word` 做不到這點）。
 */
export function BreakableEmail({
  email,
  className,
}: {
  email?: string | null;
  className?: string;
}) {
  if (!email) return null;
  const at = email.indexOf('@');
  return (
    <span className={cn('wrap-anywhere', className)}>
      {at === -1 ? (
        email
      ) : (
        <>
          {email.slice(0, at + 1)}
          <wbr />
          {email.slice(at + 1)}
        </>
      )}
    </span>
  );
}
