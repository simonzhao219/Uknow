import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
          <div className="prose prose-sm md:prose-base max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mb-3 mt-5" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mb-2 mt-4" {...props} />,
                p: ({ node, ...props }) => <p className="mb-4 leading-relaxed text-muted-foreground" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 space-y-1 text-muted-foreground" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 space-y-1 text-muted-foreground" {...props} />,
                li: ({ node, ...props }) => <li className="ml-4" {...props} />,
                a: ({ node, ...props }) => <a className="text-primary hover:underline" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground" {...props} />
                ),
                code: ({ node, inline, ...props }: any) => 
                  inline ? (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props} />
                  ) : (
                    <code className="block bg-muted p-4 rounded-lg my-4 overflow-x-auto" {...props} />
                  ),
                hr: ({ node, ...props }) => <hr className="my-6 border-t" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
