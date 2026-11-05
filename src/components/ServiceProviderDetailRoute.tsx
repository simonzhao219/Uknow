import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBrowseNeighbors } from '../hooks/useBrowseNeighbors';
import { ServiceProviderDetail } from './ServiceProviderDetail';

/**
 * /service-providers/:id 的路由元素。
 *
 * 1. `key={id}`：換篇是同一條路由換 :id，沒有 key 的話同一個詳情元件實例會活下來，而它的
 *    資料與狀態只在掛載時用 `getCachedListing(id)` 初始化——換篇後會一直顯示上一篇，直到
 *    背景重驗回來（失敗則永遠停在舊內容）。以 id 當 key 重掛，快取初始化、骨架、焦點邏輯
 *    全部沿用，輪播的張數與捲動位置也一併歸零。
 * 2. 換篇的 live 區放在 key 之外：放在被重掛的實例裡，每次換篇都是「新插入、帶著文字」的
 *    live 區，多數報讀器不會播；放這裡它是同一個 DOM 節點，只換文字才會播。
 */
export function ServiceProviderDetailRoute() {
  const { id } = useParams();
  const neighbors = useBrowseNeighbors();
  const [notice, setNotice] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換篇（id 變）就清掉上一則「已是最後一篇」
  useEffect(() => setNotice(''), [id]);

  // 連續兩次同一句，加一個零寬空白讓 live 區認得是新內容。
  const announce = (message: string) =>
    setNotice((prev) => (prev === message ? `${message}​` : message));

  const position = neighbors ? `第 ${neighbors.index + 1} 篇，共 ${neighbors.total} 篇` : '';
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {notice || position}
      </div>
      <ServiceProviderDetail key={id} onBrowseNotice={announce} />
    </>
  );
}
