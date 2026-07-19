import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { LegalMarkdown } from './LegalMarkdown';

interface MarkdownContentProps {
  content: string;
  title: string;
}

export function MarkdownContent({ content, title }: MarkdownContentProps) {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 標題列 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
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
