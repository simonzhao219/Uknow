import React from 'react';
import ReactMarkdown from 'react-markdown';

interface LegalMarkdownProps {
  content: string;
}

/**
 * 純呈現用的法遵文件 Markdown 渲染器。
 *
 * 抽出來的原因：服務條款等法遵內容有兩個入口 —— 獨立頁面（MarkdownContent
 * 路由）與註冊表單裡的「就地彈窗」。兩者必須長得一模一樣，樣式若各寫一份遲早
 * 漂移。這支只負責「把 markdown 渲染成排版好的內文」，不含頁面外框 / 返回鈕，
 * 讓頁面與彈窗都能共用同一份排版。
 */
export function LegalMarkdown({ content }: LegalMarkdownProps) {
  return (
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
          // react-markdown v10 自帶的 React 型別與專案的 @types/react 19
          // 對不上（ref 型別衝突）——執行期無礙，僅型別層 cast。
        } as any}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
