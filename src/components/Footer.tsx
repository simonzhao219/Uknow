import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from './ui/card';
import { Phone, Mail, MessageCircle, FileText, Package } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 公司資訊 */}
          {/*<div className="space-y-3">
            <h3 className="font-semibold text-lg">關於我們</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">仕捷股份有限公司</p>
              <p>統編：90546663</p>
            </div>
          </div> */}

          {/* 聯絡方式 */}
          {/*<div className="space-y-3">
            <h3 className="font-semibold text-lg">聯絡我們</h3>
            <div className="space-y-2 text-sm">
              <a 
                href="https://line.me/R/ti/p/@uknow" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>官方客服：@uknow</span>
              </a>
              <a 
                href="tel:02-66041231"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Phone className="h-4 w-4" />
                <span>電話：02-66041231</span>
              </a>
              <a 
                href="mailto:apparatus30@gmail.com"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span>apparatus30@gmail.com</span>
              </a>
            </div>
          </div> */}

          {/* 快速連結 */}
          {/* <div className="space-y-3">
            <h3 className="font-semibold text-lg">快速連結</h3>
            <div className="space-y-2 text-sm">
              <Link 
                to="/terms-of-service"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span>服務條款</span>
              </Link>
              <Link 
                to="/listing-plans"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Package className="h-4 w-4" />
                <span>刊登方案</span>
              </Link>
            </div>
          </div> */}
        </div>

        {/* 版權聲明 */}
        <div className="pt-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} 仕捷股份有限公司 Uknow. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}