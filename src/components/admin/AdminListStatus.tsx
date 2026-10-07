/**
 * 列表的狀態行：「已顯示 X / Y 筆」——不得靜默截斷（ui-ux §5），只寫「共 N 筆」會讓人
 * 以為 N 就是全部。後面以「・」接停用的原因；被閘的入口以 aria-describedby 指向這一行。
 *
 * - `loading`：沒有資料、還在讀——保留這一行的高度，不寫數字（不先閃 0 / 0）；
 * - `hidden`：沒有資料的讀取錯誤——錯誤區自己會說，這行不出現。
 */
export interface AdminListStatusProps {
  id?: string;
  shown: number;
  total: number;
  state: 'loading' | 'ready' | 'hidden';
  suffix?: string;
}

export function AdminListStatus({ id, shown, total, state, suffix }: AdminListStatusProps) {
  if (state === 'hidden') return null;
  if (state === 'loading') return <p aria-hidden="true" className="mt-2 h-5" />;
  return (
    <p id={id} className="mt-2 text-sm text-muted-foreground">
      已顯示 {shown} / {total} 筆{suffix && <span>・{suffix}</span>}
    </p>
  );
}
