import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { LegalMarkdown } from './LegalMarkdown';
import { resolveDocBackTarget } from '../utils/backNavigation';

interface MarkdownContentProps {
  content: string;
  title: string;
}

export function MarkdownContent({ content, title }: MarkdownContentProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // 返回鈕不再寫死 navigate(-1)：若這頁是分頁歷史的第一筆（新分頁 / 直接開網址 /
  // 重整），pop 無處可回會變死鈕。改由 resolveDocBackTarget 依 location.key 判斷，
  // 沒有可回歷史時安全退回首頁。（見 utils/backNavigation.ts）
  const handleBack = () => {
    const target = resolveDocBackTarget(location.key);
    // navigate() 對 number（相對 pop）與 string（路徑）是不同多載，分開呼叫。
    if (typeof target === 'number') navigate(target);
    else navigate(target);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 標題列 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleBack} data-testid="doc-back-button" aria-label="返回上一頁">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
      </div>

      {/* 內容卡片 */}
      <Card>
        <CardContent className="pt-6">
          <LegalMarkdown content={content} />
        </CardContent>
      </Card>
    </div>
  );
}
