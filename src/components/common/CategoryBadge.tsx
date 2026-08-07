/** 階段 5 stub——只求型別過,行為留空(TDD 紅燈期)。 */
import { Badge } from '../ui/badge';

export interface CategoryBadgeProps {
  category: string;
  className?: string;
  variant?: 'default' | 'secondary';
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return <Badge>{category}</Badge>;
}
