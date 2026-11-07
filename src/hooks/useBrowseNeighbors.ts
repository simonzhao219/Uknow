import { useLocation, useParams } from 'react-router-dom';
import { type BrowseNeighbors, resolveBrowseContext } from '../utils/browseContext';
import { getBrowseContext } from '../utils/homeListingsCache';

/** 詳情頁目前這一篇在首頁凍結清單裡的位置；沒有首頁脈絡時回 null（＝不顯示任何換篇 UI）。 */
export function useBrowseNeighbors(): BrowseNeighbors | null {
  const { id } = useParams();
  const { state } = useLocation();
  return resolveBrowseContext(state, id, getBrowseContext());
}
