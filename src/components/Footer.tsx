import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, FileText, Package, Gift } from 'lucide-react';

// 快速連結：讓訪客也能從頁尾探索靜態內容頁（原本整段被註解、導覽有死角）。
const QUICK_LINKS = [
  { to: '/listing-plans', label: '刊登方案', icon: Package },
  { to: '/terms-of-service', label: '服務條款', icon: FileText },
  { to: '/referral-reward-rules', label: '推薦獎勵規則', icon: Gift },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav aria-label="頁尾導覽" className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                  href="https://line.me/R/ti/p/@uknow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>官方客服：@uknow</span>
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