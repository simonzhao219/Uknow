import { cn } from '../ui/utils';
import { STALE_HINT_MINUTES } from './useAdminList';

const MINUTE = 60_000;

const minutesSince = (fetchedAt: number, now: number) =>
  Math.floor(Math.max(0, now - fetchedAt) / MINUTE);

/** 「剛剛」或「N 分鐘前」。時鐘倒退（裝置校時）時當成剛剛，不寫負數。 */
export function formatDataAge(fetchedAt: number, now: number): string {
  const minutes = minutesSince(fetchedAt, now);
  return minutes < 1 ? '剛剛' : `${minutes} 分鐘前`;
}

/**
 * 資料時間：「資料更新於 N 分鐘前」（不到 1 分鐘「剛剛更新」）。快取讓畫面可能是上次看到
 * 的樣子，照著它去網銀匯款前 admin 要看得到它有多舊；到 `STALE_HINT_MINUTES` 改成提示先
 * 重新整理。`now` 由 useAdminList 提供（頁面可見時每分鐘重算），這裡只做 render 時的計算。
 * 對話框的說明段落裡用 `as="span"`——段落裡不能再放段落。
 */
export interface DataAgeNoteProps {
  fetchedAt: number | null;
  now: number;
  as?: 'p' | 'span';
  className?: string;
}

export function DataAgeNote({ fetchedAt, now, as: Tag = 'p', className }: DataAgeNoteProps) {
  if (fetchedAt === null) return null;
  const stale = minutesSince(fetchedAt, now) >= STALE_HINT_MINUTES;
  const age = formatDataAge(fetchedAt, now);
  const text = age === '剛剛' ? '剛剛更新' : `資料更新於 ${age}${stale ? '，建議先重新整理' : ''}`;
  return (
    <Tag
      className={cn(
        'text-xs',
        stale ? 'text-warning-subtle-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {text}
    </Tag>
  );
}
