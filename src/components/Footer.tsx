import { Link } from 'react-router-dom';
import { MessageCircle, FileText, Package, Gift, Mail } from 'lucide-react';
import {
  LINE_OFFICIAL_ACCOUNT_HANDLE,
  LINE_OFFICIAL_ACCOUNT_URL,
  OFFICIAL_EMAIL,
  OFFICIAL_EMAIL_URL,
} from '../utils/constants';

// 信箱在窄螢幕要換行（見下方 li 的註解），而換行點要固定落在 "@" 之後——
// 瀏覽器自己挑的斷點會落在填滿該行的最後一個字元（實測斷在 "admin@u"），
// 把網域切成兩半、讀起來像兩個不同的位址。拆成 local/domain 兩段、中間插
// <wbr> 就是在告訴排版引擎「這裡才是可以斷的地方」。
const [OFFICIAL_EMAIL_LOCAL, OFFICIAL_EMAIL_DOMAIN] = OFFICIAL_EMAIL.split('@');

// 快速連結：讓訪客也能從頁尾探索靜態內容頁（原本整段被註解、導覽有死角）。
const QUICK_LINKS = [
  { to: '/listing-plans', label: '刊登方案', icon: Package },
  { to: '/terms-of-service', label: '服務條款', icon: FileText },
  { to: '/business-manual', label: '事業手冊', icon: Gift },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav aria-label="頁尾導覽" className="grid grid-cols-2 gap-x-4 gap-y-6 mb-6">
          {/* 快速連結 */}
          <div className="space-y-3">
            <h2 className="font-semibold text-lg">快速連結</h2>
            <ul className="space-y-1 text-sm">
              {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="inline-flex items-center gap-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 聯絡我們 */}
          <div className="space-y-3">
            <h2 className="font-semibold text-lg">聯絡我們</h2>
            <ul className="space-y-1 text-sm">
              <li>
                <a
                  href={LINE_OFFICIAL_ACCOUNT_URL}
                  className="inline-flex items-center gap-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>官方客服：{LINE_OFFICIAL_ACCOUNT_HANDLE}</span>
                </a>
              </li>
              <li>
                {/* 375px 下這一欄只有約 163px（頁尾 nav 是 grid-cols-2），而 Email
                    是不可斷的長 token——瀏覽器預設不在 "@" 與 "." 斷字，整串會畫到
                    框外（375px 巡檢實測溢出 19px）。所以位址要能換行，且斷點固定在
                    <wbr> 標出的 "@" 之後；wrap-anywhere 是保險——真的連網域自己都
                    塞不下時仍會硬斷，不會退回溢出。圖示改 shrink-0 + 對齊首行，
                    換成兩行時不會被擠扁或飄到中間。 */}
                <a
                  href={OFFICIAL_EMAIL_URL}
                  className="inline-flex items-start gap-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="wrap-anywhere">
                    官方信箱：{OFFICIAL_EMAIL_LOCAL}@<wbr />
                    {OFFICIAL_EMAIL_DOMAIN}
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* 版權聲明 */}
        <div className="pt-6 border-t text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} 優識生活有限公司 Uknow. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
