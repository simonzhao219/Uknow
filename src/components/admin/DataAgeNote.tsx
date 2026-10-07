export function formatDataAge(_fetchedAt: number, _now: number): string {
  return '';
}

export interface DataAgeNoteProps {
  fetchedAt: number | null;
  now: number;
  as?: 'p' | 'span';
  className?: string;
}

export function DataAgeNote(_props: DataAgeNoteProps) {
  return null;
}
