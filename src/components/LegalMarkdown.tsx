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
        components={
          {
            h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />,
            h2: ({ node, ...props }) => (
              <h2 className="text-xl font-semibold mb-3 mt-5" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-lg font-semibold mb-2 mt-4" {...props} />
            ),
            p: ({ node, ...props }) => (
              <p className="mb-4 leading-relaxed text-muted-foreground" {...props} />
            ),
            // list-outside 而非 list-inside：markdown 的清單分「緊湊」與「鬆散」
            // 兩種——項目之間有空行、或項目內含巢狀清單時，react-markdown 會把
            // 每個 <li> 的內容包進 <p>。<p> 是區塊元素，配 list-inside（標記算在
            // 內容流裡）會把「1.」單獨留在一行、內容掉到下一行，同一份文件裡因此
            // 出現兩種列點外觀（推廣獎勵規章第四節就是這樣）。list-outside 把標記
            // 移到縮排溝槽，不論內容是行內還是區塊都對齊第一行，兩種清單長得一樣。
            // 附帶好處：長條文換行後有懸掛縮排，不會回貼左緣與標記混在一起。
            //
            // ps-6 是標記的溝槽寬度（用 padding-inline-start，非 ml-*，才不會讓
            // 標記被裁掉）；[&>li>p]:mb-0 抵銷鬆散清單那層 <p> 的 mb-4，項目間距
            // 一律交給 space-y-1，緊湊與鬆散的行距因此一致。
            ul: ({ node, ...props }) => (
              <ul
                className="list-disc list-outside ps-6 mb-4 space-y-1 text-muted-foreground [&>li>p]:mb-0 [&>li>ul]:mt-1 [&>li>ul]:mb-0 [&>li>ol]:mt-1 [&>li>ol]:mb-0"
                {...props}
              />
            ),
            ol: ({ node, ...props }) => (
              <ol
                className="list-decimal list-outside ps-6 mb-4 space-y-1 text-muted-foreground [&>li>p]:mb-0 [&>li>ul]:mt-1 [&>li>ul]:mb-0 [&>li>ol]:mt-1 [&>li>ol]:mb-0"
                {...props}
              />
            ),
            li: ({ node, ...props }) => <li {...props} />,
            a: ({ node, ...props }) => <a className="text-primary hover:underline" {...props} />,
            blockquote: ({ node, ...props }) => (
              <blockquote
                className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground"
                {...props}
              />
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
          } as any
        }
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
