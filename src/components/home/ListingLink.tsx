import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// 首頁卡片連到刊登詳情的連結。點擊當下（不是渲染當下）才凍結畫面順序，並把版本放進
// history.state——所以不能用 <Link state>（state 在渲染時就定了）。
//
// 開新分頁（Ctrl／Cmd／Shift／Alt 或非左鍵）不攔截、不凍結：新分頁沒有模組脈絡，詳情頁會
// 落在「無脈絡」，這是正確的退化。
export const OpenListingContext = createContext<((id: string) => string) | null>(null);

export function ListingLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const freeze = useContext(OpenListingContext);
  const navigate = useNavigate();
  const to = `/service-providers/${id}`;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!freeze || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to, { state: { browseFrom: 'home', ctx: freeze(id) } });
  };

  return (
    <Link to={to} className={className} data-listing-id={id} onClick={handleClick}>
      {children}
    </Link>
  );
}
