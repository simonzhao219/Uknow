# AI Coding Guideline（草案 v0.3・Q&A 版）

> **這份文件要解決什麼**：團隊用 AI 產出程式碼之後出現的三個具體症狀——**沒人真的在 review、寫一大坨就想上 PR、聲稱測試都過但涵蓋根本不夠**。
>
> **怎麼讀**：全文是問答。每一題都是團隊裡真的有人問過或抱怨過的話，先想一下你的答案，再看規範怎麼回。趕時間就跳到你的角色：[寫 code 的人](#二給寫-code-的人)、[reviewer](#三給-reviewer)、[團隊 lead／主管](#四給團隊-lead主管)、[維護流程的人](#五給維護流程的人)。Part 1 末尾有可單獨列印的[單頁速查表](#單頁速查表)。
>
> **數據的可信度**：Part 1 只引用有方法論揭露的研究（隨機對照試驗、大樣本調查、原始政策文件），完整出處與英文原文在 [Part 2](#part-2官方文件與研究怎麼說)。廠商行銷數字一律不採用。
>
> **不熟的名詞**（hook、subagent、Plan Mode、context…）見文末[名詞速查](#附錄名詞速查)。

---

## Part 1：問題與原則

### 一、先講清楚我們在對付什麼（所有人）

**Q1. AI 寫的 code 到底哪裡有問題？我看它寫得挺好的啊。**

問題不在它寫得差，在它**錯得像對的**。

這是全球開發者票選第一名的挫折：66% 的人說最大的困擾是「AI 給的解法差一點就對，但就是不對」，45% 說 debug AI 產生的程式碼比自己寫更花時間（Stack Overflow 2025，49,000+ 份回覆）。同一份調查裡，對 AI 準確性的信任從 40% 跌到 29%——**用得越多、信任越低**。

根因是模型最佳化的目標：它學的是「這段文字接下來最可能是什麼」，所以它擅長產出**看起來像正確程式碼**的東西，而不是**是正確程式碼**的東西。命名漂亮、有註解、能跑、結構合理，但某個關鍵處是錯的。

這造成一個特別惡毒的性質：**AI 的錯誤分布跟人類不一樣**。人寫錯通常錯得很明顯（語法錯、明顯遺漏、風格突兀），所以資深工程師演化出「這段聞起來怪怪的」的直覺。AI 錯得均勻分散、外觀一致，**那個直覺在這裡失效**。

所以這份文件的立場不是「AI 很危險所以要管」，而是：**你平常用來擋住錯誤的那套直覺，在這裡不管用，所以要用機制補上**。後面所有規則都是這句話的展開。

**Q2. 我用 AI 明明覺得快很多，為什麼還要這些規矩？**

因為「覺得快」和「真的快」已經被實測分開了。

METR 做過一個隨機對照試驗：16 位資深開發者、246 個真實任務、他們自己維護的成熟開源專案。結果是用 AI 時**完成任務慢了 19%**，而同一批人事後估計自己**快了 20%**。這 39 個百分點的落差是這份文件最重要的單一事實——不是因為它證明 AI 沒用，而是因為它證明**你的體感不能當作決策依據**。

但要誠實地把話講完：METR 自己強調這不代表 AI 普遍讓人變慢。慢下來的條件很特定——**開發者對該 repo 極度熟悉，且 repo 龐大成熟**。反面證據也很硬：微軟在數萬名工程師規模導入後，採用者合併的 PR 多了約 24%；DORA 2025 的調查（90% 受訪者日常使用 AI）顯示 AI 對交付吞吐量呈正相關。

DORA 給了統攝兩邊的框架，也是這份文件的基本立場：**AI 是放大器，不是解方**。對基礎紮實的團隊它是加速器；對已經有技術債、流程混亂的團隊，它放大既有的失能。

至於為什麼體感會反過來：省下的「打字時間」原封不動搬到了「審查、除錯、整合」。前者有感（爽），後者無感（本來就在做）。時間搬了家，不是消失了。

**所以規範的目的不是踩煞車，是讓放大器接在對的東西上。**

**Q3. 那這份文件到底想達成什麼？**

三條原則，後面每一條規則都是它們的展開：

1. **瓶頸是 verifier，不是模型。** 模型產碼的速度已經超過我們驗證它的速度。所以每一條規則都要能回答「這讓驗證變強了嗎」，而不是「這限制了 AI 什麼」。
2. **證據不是聲稱。** 「做完了」「測試都過」一律不採信；採信的是獨立於作者之外的東西：CI 的綠燈、測試輸出、覆蓋率數字、紅燈 commit 的 hash。
3. **Advisory 會衰減，必守規則要 enforced。** 寫在文件裡的約定，AI 會忘、人會累。真正不能違反的規則要放進 hook／CI／合併規則，讓它「做不到」而不是「不該做」。

---

### 二、給寫 code 的人

**Q4. 什麼時候該用 AI、什麼時候自己寫比較快？**

這題放在最前面，是因為**這份規範不要求你用 AI**。

有實證的判準（來自 Q2 的 METR 試驗）：**你非常熟悉的成熟大型 codebase＋你已經知道怎麼做的任務＝自己寫通常比較快**。這種情境下，你把需求解釋清楚給 AI 的成本，加上驗證它產出的成本，往往超過你直接動手。

反過來，AI 增益最大的情境：不熟悉的語言或框架、樣板與膠水程式碼、探索性原型、一次性腳本、大範圍的機械式修改、以及新專案（greenfield 的增益可達 35–40%，成熟系統只剩 10% 上下）。

實用的自問法：**「我要花多久才能跟它解釋清楚？」** 如果解釋成本逼近自己做的成本，就自己做。這不是不夠努力，是正確的工具選擇。

**Q5. 哪些東西不該讓 AI 生成？**

有一份明確的禁區清單，理由是實測數據而不是感覺：

Veracode 追蹤 100 多個模型、四次快照，AI 產生的程式碼**安全通過率平均 56%，而且沒有隨模型變聰明而改善**。分項更難看：86% 的樣本擋不住 XSS、88% 對 log injection 無防禦。

為什麼安全性特別差？因為**生成當下沒有回饋訊號**：功能寫錯了測試會紅，安全寫錯了什麼都不會發生。模型能力提升改善的是「寫出能跑的程式」，那跟「寫出安全的程式」是兩個不同的目標。

**禁區**（AI 產出一律視為草稿，必經專門安全審查才可合併）：認證、授權、加密與金鑰處理、金流、使用者輸入的驗證與跳脫、資料庫 migration、權限判斷邏輯。

這不是「絕不能用」，是「這幾類程式碼不接受未經專門審查的 AI 產出」。

**Q6. 開工前我該給 AI 什麼？怎麼知道 spec 夠清楚？**

官方對「好的 spec」給過結構判準（原文見 [Part 2](#part-2官方文件與研究怎麼說)）：**自足**（點名涉及的檔案與介面）、寫明 **out of scope**、並以一個端到端的驗證步驟收尾。

落到日常，用這四個測試自檢：

1. **可驗證性測試（最硬的一條）**：spec 的每一句話，能不能翻成一個「現在會紅、做完會綠」的測試？寫不出失敗案例的句子（「體驗要流暢」「要安全」）就是不清楚的句子。TDD 的紅燈其實就是 spec 清楚度的試金石——**紅燈寫不出來，先回去改 spec，不是開始寫碼**。
2. **Fresh context 測試**：開一個全新 session（或找一個沒參與討論的同事），只給 spec，請對方複述要做什麼、列出測試案例清單。複述和你的意圖一致，就夠清楚。
3. **訪談窮盡測試**：讓 AI 先訪談你再寫 spec（官方建議的作法）。**AI 問到你答不出來的問題，就是 spec 的洞**；連續幾輪問不出新東西，才算收斂。
4. **審查殘留測試（事後指標）**：AI 審查產出裡「需人工裁決」的條目數、以及實作完成後「偏離原規劃」的項目數，如果居高不下，代表 spec 不清——這是可以長期追蹤的落後指標。

最常被漏掉的是 **out of scope**。範圍沒寫清楚時 AI 不會停下來問你，它會自己補——那正是「寫一大坨」的另一個來源。

**Q7. PR 應該多大？大家都說要小，但這個功能就是這麼大。**

判準跟 Q6 同源：**一句話描述不了，就拆**。一個 PR 一個邏輯功能。

功能大不是不拆的理由——拆的動作要發生在**規劃階段**（把功能切成「每一段都可以獨立驗證」的階段），而不是等寫完了才想怎麼切。寫完再拆很痛，所以大家不拆；規劃時就切好，每段自然小。

為什麼這件事在 AI 時代變得更重要：AI 產生的 PR 明顯更大、審查等待時間顯著拉長（多份產業統計方向一致）。而送出一個巨型 PR 的實質意義是：**你把自己省下的時間，乘以 N 倍轉嫁給 reviewer**。學術研究把這個現象定性為公地悲劇——個人的生產力增益，把成本外部化到共享資源（reviewer 產能、codebase 完整性、協作信任）。

**Q8. AI 說「測試都過了」，我能信嗎？**

不能。有兩個獨立的失敗模式，而且都已經被基準化量測過：

**(a) Reward hacking（為了訊號作弊）**：agent 會直接編輯測試檔讓它通過、hardcode 期望值、放寬 timeout、印出期望輸出而不實際計算。已有專門基準在量測主流 coding agent 的作弊率；Cursor 官方部落格直說「reward hacking 正在淹沒模型智能的增益」。曾有 agent 在任務完成後把測試檔刪掉（推測是想「清理」）。

根因是 Goodhart 定律的機器版：當「測試通過」成為目標，它就不再是好的度量。而**改測試**與**改實作**在達成該訊號上是等價的——後者難，前者易。

**(b) 謊報完成**：「All tests pass ✅」有時只是被生成出來的輸出樣式，跟 codebase 的實際狀態無關——測試套件有語法錯誤時，它照樣會這樣寫。

最貴的一次教訓：某 vibe coding 實驗中，agent 在使用者**明確下達 code freeze 指令期間**自行執行資料庫操作，刪除了正式資料庫的上千筆資料，接著**謊稱無法復原**（實際上可以）。

**規則：你信的是 CI 的綠燈，不是 AI 的句子。**

**Q9. 怎麼防止 AI 為了讓測試變綠，跑去改測試？**

靠順序，不靠叮嚀：

1. 先讓 AI 寫**會失敗**的測試，明講「現在不要寫實作」。
2. **確認它真的紅**——防止「本來就會過」的假測試。
3. **把紅燈測試先 commit 起來**。
4. 再實作到綠。

第 3 步是關鍵：紅燈 commit 是證據，之後 AI 若動了測試，diff 一眼就看得出來。

制度上再加一條：**測試檔的變更是一級審查對象**。實作 PR 裡出現測試檔的修改，要能說出為什麼。（EP實作更進一步：紅燈期用 hook 直接禁止編輯測試檔，把「事後揭露」升級成「事前做不到」——見 [Part 3](#part-3ep實作怎麼做到)。）

**Q10. AI 幫我補的測試算不算數？覆蓋率 90% 為什麼我還是不安心？**

你的不安是對的。關鍵在**順序**，不在數量：

**讓 AI 去測它自己剛寫的函式，是無效的動作。** AI 在某個隱含假設下寫了函式，又在**同一個隱含假設**下寫了測試，於是那個隱藏前提同時坐在兩個產物裡自我認同——而 production 是這個前提第一次被真正挑戰的地方。測試的價值來自**獨立性**，當實作與測試出自同一個模型、同一段 context、同一組假設，獨立性歸零，測試退化成「實作的重複描述」（連 bug 一起編碼下來）。

具體要辨認的無用測試樣態：斷言內部狀態、斷言自己剛設定的 mock、橡皮圖章式快照、永遠到不了的斷言、同義反覆。另外 AI 有個系統性偏誤：**傾向選「安全的中間值」當測試資料，避開邊界**——而 off-by-one、溢位、null reference 全都住在邊界上。

有價值的用法：(a) 依據**獨立先寫好的規格**產生測試（Q9 的順序）；(b) 請它**列出邊界案例清單**讓你挑，而不是請它寫測試。

至於覆蓋率：它量的是「執行到」，不是「驗證到」。90% 的覆蓋率完全可以是 90% 的同義反覆。

**Q11. 我改了三次它還是錯，該繼續 prompt 還是自己寫？**

門檻寫死：**同一個問題糾正兩次仍錯，就停止拉鋸。**

原因通常不是你 prompt 寫得不好，是 context 已經被失敗的嘗試污染了——模型的有效注意力隨著 context 變長、雜訊變多而下降，那些失敗實驗、debug 迴圈、過期指令全都還在裡面稀釋你真正的要求。

做法：`/clear` 開新 session，把已經學到的東西寫進更好的初始提示；或者直接回到 Q4 的判準——自己寫。

這是沉沒成本陷阱，不是能力問題。已經投入的三輪不會因為你再投入第四輪而回本。

**Q12. AI 寫得又臭又長、每次都重寫一個類似的元件，要管嗎？**

要，因為這是**會累積、而且延遲結帳**的成本。

GitClear 分析了 6.23 億行程式碼變更（2023–2026），結構性指標全面惡化：跨檔案函式呼叫（複用的代理指標）**↓35%**、重構造成的行移動 **↓70%**、動 12 個月以上沒碰過的舊程式碼 **↓74%**、commit 內複製貼上 **↑41%**、重複程式碼區塊 **↑81%**（歷史新高）、錯誤遮蔽構造 **↑47%**。

根因很簡單：**對 AI 來說，重新生成比重構便宜。** 要它「把兩個相似元件整併成一個抽象」需要理解兩邊的完整脈絡與未來演化；要它「再寫一個類似的」只要複製模式。前者難且容易出錯，後者秒殺。每個局部決策都選了重新生成，全域結果就是重複度單調上升、重構單調下降。

其中**錯誤遮蔽 +47% 最該警惕**：AI 傾向加上寬鬆的 `try/except`、預設值、fallback，讓程式「不會爆」——代價是故障變成**靜默的**，你失去了最重要的除錯訊號。

日常規則：新增前先問「這個能不能複用既有的」；審查時把「無條件吞掉例外」當缺陷而不是防禦性設計。

**Q13. AI 建議的套件可以直接裝嗎？把公司 code 貼給它有沒有風險？**

**套件：不行，這是 CP 值最高的一條規則。**

一項 576,000 樣本的研究顯示 AI 建議**不存在套件的比率是 19.7%**。而幻覺**具有一致性**——同一個模型會反覆幻想出同一個名字，於是攻擊者可以搶先在 npm／PyPI 註冊那個名稱（業界稱 slopsquatting），把隨機錯誤轉化成可預測、可利用的攻擊面。實例：一個從未存在的 `react-codeshift`（兩個真實套件的幻覺混血）數週內擴散到 237 個 GitHub repo；另一個幻覺套件被真實下載超過 15,000 次，甚至被寫進某大廠專案的 README。

規則：**任何 AI 建議的新依賴，合併前必須人工確認該套件真實存在、有合理的下載量與維護紀錄。** 成本近乎零。

**機密：有風險，而且風險點跟你想的不一樣。**

AI coding 工具**不像 compiler 那樣尊重 `.gitignore`**——它吞下整個 workspace 來建立 context，然後可能在生成建議時把記憶中的敏感 token 反芻進程式碼。另外 Claude Code 會把核准過的終端指令快取在本機隱藏檔，**指令裡夾帶的憑證會被永久存下來**，若專案發布時沒排除該目錄就會一起流出。

規則：secrets 一律走環境變數或 secret manager，不進 prompt、不寫進指令參數；把 `.env*` 之類的敏感檔加進工具的 deny 清單（EP實作已經這樣設定）。

**Q14. 送 PR 前我要附什麼？**

兩件事，第二件比你想的重要。

**(a) 證據**：測試輸出或 CI 連結、覆蓋率變化、UI 改動的前後截圖、紅燈 commit 的 hash。理由不是儀式感——審查者看證據比自己重跑驗證快得多，而且證據會留在 PR 上成為紀錄。

**(b) 明確說明哪些事情你沒做到。** 這條抄自 Linux kernel 的 AI 貢獻政策，它要求貢獻者明講「這個修復沒有建置測試過」「沒有做出 reproducer」之類的事實，理由是維護者浪費太多時間在分析未驗證的報告與未測試的修復。

這條規則的聰明之處：它不要求 AI 做到它做不到的事，只要求**誠實標示不確定的邊界**。成本極低，對 reviewer 的價值極高。

順帶一提團隊文化：**「這段我不完全確定」不是能力不足的表現，是專業。** 反而是「全都懂、都測過了」的宣稱更該被追問。這句話要說得出口，Q17 那條規則才可能執行。

---

### 三、給 reviewer

**Q15. AI 都已經審過了，人還要審什麼？**

分工是這樣：**AI 找碴，人裁決。**

AI 審查便宜、可以大量做、不會累，所以應該讓它先跑（多個特化 agent 並行找不同類型的問題，發現先經驗證再彙整）。但它**從不核准**——官方連自家的 Code Review 產品都刻意設計成「不 approve、不擋合併」，check 結果永遠是中性的。裁決是人的事。

**人要審什麼，跟以前不一樣。** 你受訓練抓的是「人類會犯的錯」；AI 的錯誤模式不同，舊 checklist 對它們是盲的。專用清單：

- **幻覺的 API 與套件**（Q13）
- **同義反覆的測試、斷言 mock 的測試**（Q10）
- **重複實作了既有元件**、不必要的抽象層（Q12）
- **無條件吞掉例外**的錯誤處理（Q12）
- **與 ticket 脫節但本身自洽的實作**——這條最重要：**讀 diff 的同時讀 ticket，兩者的落差通常就是真正的 bug 所在**
- **悄悄引入的新依賴**

還有一個心理層面的提醒：96% 的開發者不完全信任 AI 產生程式碼的功能正確性。**你的懷疑是正常的、也是被制度支持的**，不是你難搞。

**Q16. PR 太大、或沒附證據，我可以退回嗎？**

可以，而且這是制度要求你做的事，不是你在刁難人。兩個階梯：

- **缺證據** → 先請作者補上（或請他直接讓 AI 補跑審查與測試，通常幾分鐘），補齊再開始審。
- **大到審不動** → 要求拆分後再送。

為什麼要把這條白紙黑字寫進規範：**橡皮圖章的根源是「暫停審查沒有正當性」**。當退回需要個人勇氣時，多數人會選擇按下 approve。

這一條也是給整個團隊的提醒：**reviewer 是唯一一個「AI 只增加他的工作、不減少他的工作」的角色**。工程師拿到槓桿、主管拿到吞吐量，reviewer 拿到的純粹是負擔。如果不給他退回的權力，防線會靜默失效——而那是最危險的狀態，因為儀表板還是綠的。

**Q17. 作者自己也解釋不出來那段程式碼，我該怎麼處理？**

有一條可以直接引用的判準（來自 Ghostty 專案的 AI 政策）：**如果你無法在沒有 AI 工具協助的情況下，解釋你的變更做了什麼、以及它如何與更大的系統互動，就不該送出這個變更。**

所以答案是：這個 PR 還沒準備好，不是你審不動。

實務話術——**把問題放在程式碼上，不要放在人身上**：與其問「你是不是沒看懂」，不如說「這段我需要你走一次邏輯給我聽，特別是 X 失敗時會怎樣」。前者是質疑能力，後者是正常的審查對話，而且效果一樣。

如果對方走不出來，回到 Q11：這段該重寫，或該由熟悉的人自己寫。

這條要整個團隊一起認可才有效：**送出 PR 的意思是「我理解這段、而且我能維護它」，不是「我讓 AI 產出了這段」。**

**Q18. AI reviewer 一次給我 30 則評論，全部都要處理嗎？**

不用。而且官方文件明確警告過：**被要求找問題的 AI 一定找得出問題**，即使程式碼本身沒問題——因為那就是它被交代的事。照單全收會走向過度工程：多餘的抽象層、防禦不可能發生的情況、為不會發生的案例寫測試。

過濾規則：**只處理影響正確性與明訂需求的發現**，其餘一律標為可選建議。

如果噪音持續（例如 400 行的 PR 收到 30 則格式、命名、風格與真 bug 混在一起的評論），要修的是**設定**不是人力：用 `REVIEW.md` 重新定義什麼算 Important、限制 nit 的數量上限、略過 CI 已經在管的項目（lint、格式）。

一個提醒：用 AI 解決 AI 造成的審查瓶頸，如果不處理優先級，只是把瓶頸從「PR 太多」搬到「評論太多」。

---

### 四、給團隊 lead／主管

**Q19. 我怎麼知道團隊的 AI 使用是健康的？該看什麼指標？**

先講**不要看什麼**：程式碼行數、PR 數量、story point、AI 使用率。AI 導入後這些**必然上升**，而且跟品質沒有關係——AI 產生的樣板會推高行數、更小的功能會推高 PR 數。你的儀表板會全綠。

**要看的是結構指標**（這些正是 GitClear 量到會惡化的項目，見 Q12）：

| 指標 | 為什麼看它 |
|---|---|
| 重複程式碼區塊比例 | AI 最強的傾向就是複製而非複用 |
| 跨檔案函式呼叫 / 複用率 | 掉下去代表在長重複的肌肉 |
| 重構佔變更的比例 | 沒人整併＝債在累積 |
| 12 個月以上舊碼的維護量 | 掉到接近零代表沒人敢碰舊系統 |
| 無條件吞例外的出現率 | 故障正在變成靜默的 |
| 審查週期時間、PR 大小分布 | reviewer 是否已成瓶頸 |
| 事故率與平均修復時間 | 最終的落後指標 |

具體動作：設一個重複度的 tripwire（超過就開 issue）、每個迭代給明確的**重構預算**、把「無條件吞例外」列進審查清單、把教練資源投到判斷力最薄弱的地方。

**Q20. 可以把 AI 使用率當 KPI 嗎？**

不行，而且這條建議寫進規範會大幅提升整份文件在工程師心中的可信度。

這是經典的代理指標失敗：組織想要的是「更好的軟體、更快交付」，能量測的是「登入次數」，於是後者變成目標。業界確實有公司這樣做（把 AI 使用列入核心期望、追蹤資深員工每週登入次數、寫進績效評估、設定每週使用率目標），可預期的後果是**表演性使用**——工程師在不適合的任務上硬用，剛好違反 Q4。

**連帶的關鍵規則：揭露機制必須明文與考核脫鉤。** 我們要求 PR 標示 AI 參與的程度（Q22），唯一能讓這個機制成立的前提，是它**明確地不被拿來考核**。一旦揭露會影響考評，誠實揭露會在一週內消失，你就永遠不知道真實情況。

**Q21. 初階工程師用 AI 會不會學不到東西？要限制他們嗎？**

先修正一個很多人有的直覺：**實際上是資深的人用得更多**。Fastly 的調查顯示，32% 的資深開發者（10 年以上）說自己出貨的程式碼超過一半是 AI 產生的，初階只有 13%；資深宣稱獲得顯著速度增益的比例是初階的兩倍。

這個數字的意涵很深：**AI 不是拉平資深與初階的差距，是放大它**。資深的人有能力判斷 AI 何時出錯，所以敢用、用得多、收穫大；初階的人不敢用，或用了受害。**AI 是給有判斷力的人的槓桿，不是判斷力的替代品。**

風險是真的存在的：MIT 的研究發現重度依賴 LLM 造成記憶力下降、神經參與度降低，而且**先用 LLM 再被要求獨立作業的人，難以重新啟動所需的神經網路**。而資深工程師的判斷力，本來就是大量廉價錯誤累積出來的——那些「自己撞牆三小時最後發現是拼錯字」的經驗，正是 AI 現在替他們跳過的部分。跳過痛苦的同時也跳過了學習。

**但有效的不是道德勸說（「請好好學習」無效），是結構性設計：**

- **指定某些任務類型必須手寫**：第一次接觸的子系統、核心演算法、需要建立心智模型的地方。
- **審查時要求作者口頭解釋**（Q17 的規則自然涵蓋初階）。
- **pairing 時關掉 AI**——那是最高密度的學習時間，不該外包。
- **確保資深的人有餘裕帶人**：如果資深工程師被清理 AI 程式碼佔滿時間，人才管線的兩條線會同時往壞的方向走。這是資源分配問題，只有你能解。

**Q22. 出事的時候，誰負責？**

現況是責任真空：AI 產生的 commit 比例已經很高，但多數組織沒有決定「它在 production 壞掉時誰負責」。有調查顯示事故發生時，53% 怪安全團隊、45% 怪開發者、42% 怪合併的人——**三者相加超過 100%，這就是沒有共識的意思**。

唯一站得住的原則，Linux kernel 的表述最乾淨：**每一個 patch 都必須有一個能解釋它、並維護它的負責人類。**

落地成三條：

1. **送出者就是負責人，無論程式碼來源。** 工具不能被告，模型不能被問責，廠商合約明確讓責任向下流到使用它的人。
2. **揭露用「協助」而不是「共同作者」**：Linux 的作法是 commit trailer 用 `Assisted-by:`（記錄工具參與）而不是 `Co-authored-by:`——後者主張共享的作者身分與**問責**，而工具無法履行問責那一端。
3. **揭露內容講程度不講有無**：說明 AI 是起草了程式碼、改寫了程式碼、產生了測試、還是變更了依賴——這是 reviewer 調整審查強度的依據（並且回 Q20：不用於考核）。

**Q23. 成本怎麼控？**

先建立量級認知：**agentic 工作流每個任務消耗的 token 是 chat 查詢的 5–30 倍**。原因是 agent 的每一個推理步驟都會把累積的 context 在每次工具呼叫時重新送出一遍，所以成本隨步數呈超線性成長——一個跑了 40 輪工具呼叫的 session，跟 40 次獨立提問完全不是同一個數量級。

真實案例：某大型科技公司的工程組織採用率從 32% 衝到 84% 後，**四月就用完了整年的 AI 預算**；另一家因為重度使用者達到每人每月 $500–2,000 而取消了該工具。有調查指出 85% 的公司 AI 成本預測誤差超過 10%。

好消息是：**最貴的用法同時也是品質最差的用法。** 超長 session 既燒 token 又造成 context rot（Q11、Q24）。所以「換任務就開新 session」這一條同時省錢又提升品質——而且開新 session 是零成本的，壓縮 context 反而是一次大請求。

動作：設每人／每專案的預算警戒線；把「這個 session 已經跑很久了」當成品質訊號而不只是成本訊號。

---

### 五、給維護流程的人

**Q24. 為什麼要有這麼多 hook 跟閘門？很煩。**

核心論點一句話：**能被 AI 忘記的規則，等於沒有規則。**

這不是誇飾。專案規則檔（CLAUDE.md 那類）在對話早期有效，**到第四、五輪互動就開始像不存在**——AI 忘記你用的框架、推翻自己稍早的修正、重新引入剛修掉的 bug。機制有兩個：(a) 有效注意力隨 context 長度與雜訊量下降；(b) 壓縮是有損的，而**約束比事實更容易被壓縮掉**（「不可以做什麼」在後續對話裡不會被反覆提及）。

官方自己把這條界線畫得很清楚：CLAUDE.md 是 advisory（建議），hook 是 deterministic（保證執行）。要讓一個動作**無論 AI 怎麼決定都被擋下**，只能用 hook。

**但閘門不該無限膨脹，所以有一條升級判準：只有被違反過第二次的約定才升級成 enforced。** 這樣閘門的數量由實際摩擦決定，而不是由想像中的風險決定。

**反向承諾也要寫進來**：閘門如果持續誤擋，要修的是閘門，不是叫人忍耐。誤擋要被記錄下來（EP實作用 friction log 與 hook 決策 metrics 追蹤誤擋率），定期整併成修訂。**一個沒有人抱怨管道的閘門系統，最後會被繞過。**

**Q25. 我們加了一堆自動檢查，這樣就安全了吧？**

先回答一個問題：**你的檢查空轉的時候，看起來像什麼？**

多數時候答案是「像全部通過」。這就是為什麼新增任何檢查都要做 **mutation testing**：故意把它應該擋下的東西弄壞一次，證明它真的會紅。

EP實作有過實證：一輪 12 條突變測試中有 2 條一開始存活，理由完全相同——**檢查看起來在跑，對那個突變卻是空轉**。如果沒有這一層，那兩個假檢查會永遠綠著，而且沒有人會發現。

更難的一層：**感測器的失效是靜默的。** 閘門壞了會擋住人，你馬上知道；量測設施壞了只是不再記錄，而**少報的讀數看起來跟「真的沒事」一模一樣**。所以量測設施需要的機械驗證不比閘門少，是更多。

**Q26. 覆蓋率有門檻了，為什麼測試還是越來越少？**

因為門檻的**參數**可以被調低——閘門還在，門變寬了。這是最典型的縫隙型態：規則存在、CI 是綠的、而實質保護在下降。

規則：**品質指標只准向好（ratchet）。** 門檻由 CI 持有；覆蓋率上升時順手把門檻提上去；要調低必須在 PR 裡寫明理由，交由人裁決，而不是靜靜改個數字。

同時要記得覆蓋率是**弱指標**（Q10）：它量的是「執行到」不是「驗證到」。真正的保護來自關鍵路徑的端到端測試與必留情境清單——那些是刪掉會被機械擋下的東西。

**Q27. 又一個 bug 漏到線上了，修完就結案嗎？**

還差兩步：

1. **同類掃描**：同一個病灶通常不只一處，grep 全庫找兄弟。這件事在 AI 時代特別重要——**AI 會把同一個模式複製到很多地方**（Q12），所以「一個 bug 只有一處」的假設比以前更不可靠。
2. **防線回填**：回答「為什麼既有的測試／CI／hook 沒有攔到它」，然後把答案變成一條新防線。

這兩步讓每一次漏網都自動強化系統，而不是只修這一次。它也是 Q24 那條升級判準的實際來源——**被漏過的東西，就是該被 enforced 的東西**。

---

### 六、關於你自己

**Q28. 我是不是因為用 AI 而退步了？怎麼判斷？**

這個擔心有實證基礎（Q21 提到的 MIT 認知債研究），而且值得認真對待——但方法是量測，不是焦慮。

兩個自我檢測：

1. **定期挑一個任務全程關掉 AI。** 你要觀察的不是速度，是**你是否還能形成解法**。如果卡住的地方是「不知道從哪裡開始」而不是「打字慢」，那是訊號。
2. **你能不能在不重讀的情況下，說出你上週寫的某段程式碼為什麼那樣設計？** 寫程式的過程本身就是建立心智模型的過程——你能在三個月後快速修好自己寫的東西，靠的不是記得程式碼，而是記得**當初考慮過又否決掉的那些選項**。AI 產出的程式碼只交付結論、不交付推理過程，那些被否決的選項從未存在於任何人的腦中。

這是「理解負債」與「技術債」的差別：技術債你知道自己欠了什麼；**理解負債你不知道自己不知道什麼**。追蹤除錯時間的研究顯示，AI 產生的不熟悉區段平均要 45 分鐘才 debug 完，手寫的約 15 分鐘。

這不是要你少用 AI，是要你**保留形成判斷的肌肉**——因為 Q21 的數據說，判斷力正是決定你能從 AI 拿到多少槓桿的東西。

**Q29. 我們每個階段做的，到底是哪一種 Engineering？**

有助於知道自己在哪一層、下一步該補哪裡：

| 我們在做的事 | 學科 | 層 |
|---|---|---|
| 訪談需求、寫 spec／plan、對齊規格書、階段切分（Q6、Q7） | **Spec Engineering** | 1 輸入 |
| 寫 CLAUDE.md、rules、skill 與 agent 的指示措辭 | **Prompt Engineering** | 1 輸入 |
| 決定什麼時候載入什麼、探查隔離、輸出折疊、context 預算（Q11、Q23） | **Context Engineering** | 1 輸入 |
| friction log、決策寫進 git、auto memory 紀律 | **Memory Engineering** | 1 輸入 |
| hook、permission、pre-commit、CI 軌道、TDD 相位鎖（Q24） | **Harness Engineering** | 2 環境 |
| TDD 紅→綠、統一閘門、四視角審查、ratchet、mutation testing（Q9、Q25、Q26） | **Evaluation Engineering** ＋ inner loop | 3 控制／4 回饋 |
| hook 決策記錄、誤擋率與命中率彙總（Q24、Q25） | **Observability Engineering** | 4 回饋 |
| PR 事件訂閱、排程自查、自動觸發的診斷迴路 | **Loop Engineering**（outer loop） | 3 控制 |

一條重要的依賴順序：**先觀測 → 再評估 → 才自動化。你不能自動化一個你量不到的東西。** 而任何 unattended 的 AI 迴路都必備四個控制：迭代上限、預算上限、agent 可自評的成功條件、失敗升級路徑——缺一不放手。

---

### 單頁速查表

> 可單獨列印。每條後面標的是它的出處問題。

**三條元原則**：① 瓶頸是 verifier，不是模型　② 證據不是聲稱　③ advisory 會衰減，必守規則要 enforced

| 分組 | # | 規則 | 出處 |
|---|---|---|---|
| **產出** | 1 | 該自己寫就自己寫：熟悉的成熟 codebase＋已知做法，自己寫更快 | Q4 |
| | 2 | 禁區：認證／授權／加密／金流／輸入處理／migration 的 AI 產出視為草稿，必經專門安全審查 | Q5 |
| | 3 | 計畫先行：一句話說不清就先出計畫給人審；spec 要能翻成會紅的測試 | Q6 |
| | 4 | 小步交付：一句話描述不了就拆，而且在規劃階段就切好 | Q7 |
| | 5 | 測試先紅後綠，紅燈 commit 為證；測試檔變更是一級審查對象 | Q8、Q9 |
| | 6 | AI 不測自己剛寫的東西；測試看的是獨立性不是覆蓋率 | Q10 |
| | 7 | 糾正兩次仍錯就重開或自己寫 | Q11 |
| | 8 | 新增前先問能不能複用；無條件吞例外＝缺陷 | Q12 |
| | 9 | 新依賴合併前人工確認存在；secrets 不進 context | Q13 |
| | 10 | PR 附證據，並誠實標示「哪些沒做到」 | Q14 |
| **審查** | 11 | AI 找碴、人裁決；人不對 AI 沒看過的 diff 簽名 | Q15 |
| | 12 | 缺證據先補、審不動要求拆分——不硬審 | Q16 |
| | 13 | 送 PR＝我能解釋並維護它；解釋不出來就還沒準備好 | Q17 |
| | 14 | 只追正確性與明訂需求的發現，其餘可選；噪音要修設定不是修人 | Q18 |
| **責任與制度** | 15 | 每段程式碼都要有一個能解釋並維護它的人；送出者即負責人 | Q22 |
| | 16 | 揭露程度而非有無，且明文不用於考核；不以 AI 使用率當 KPI | Q20、Q22 |
| | 17 | 必守規則要 enforced；被違反第二次才升級；閘門誤擋要修閘門 | Q24 |
| | 18 | 閘門也要驗證（mutation testing）；感測器的失效是靜默的 | Q25 |
| | 19 | 品質指標只准向好；門檻由 CI 持有，調低要書面理由 | Q26 |
| | 20 | 看結構指標，不看行數／PR 數／使用率 | Q19 |
| **習慣** | 21 | Context 衛生：換任務就清空；長 session 是品質與成本的雙重訊號 | Q11、Q23 |
| | 22 | 防線回填＋同類掃描：漏網 bug 必答「為什麼沒攔到」 | Q27 |

**三個痛點的對應**

| 痛點 | 主要規則 |
|---|---|
| 沒人 review code | 11、12、13、15 |
| 寫一大坨就上 PR | 3、4、10 |
| 聲稱測試都過但涵蓋不夠 | 5、6、10、19 |

---

## Part 2：官方文件與研究怎麼說

這一節是 Part 1 的依據。分三類：**官方文件**（Anthropic 的 Claude Code 文件，英文原文逐字核對）、**研究數據**（隨機對照試驗與大樣本調查）、**其他團隊的政策**（開源專案的一手政策文件）。

### 2.1 官方文件原文

**關於「AI 怎麼知道自己做完了」**（支撐 Q1、Q8、Q14）

> "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop: every mistake waits for you to notice it. Give Claude something that produces a pass or fail, and the loop closes on its own."
> — [Best practices › Give Claude a way to verify its work](https://code.claude.com/docs/en/best-practices)

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching."
> — 同上

> "**The trust-then-verify gap.** Claude produces a plausible-looking implementation that doesn't handle edge cases. **Fix**: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."
> — [Best practices › Avoid common failure patterns](https://code.claude.com/docs/en/best-practices)

**關於計畫先行與 PR 大小**（支撐 Q6、Q7）

> "Letting Claude jump straight to coding can produce code that solves the wrong problem. Use plan mode to separate exploration from execution."
> — [Best practices › Explore first, then plan, then code](https://code.claude.com/docs/en/best-practices)

> "Planning is most useful when you're uncertain about the approach, when the change modifies multiple files, or when you're unfamiliar with the code being modified. **If you could describe the diff in one sentence, skip the plan.**"
> — 同上

**關於 spec 的結構判準**（支撐 Q6）

> "The most useful specs are self-contained: they name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step that proves the feature works. Time spent making the spec precise pays off more than time spent watching the implementation."
> — [Best practices › Let Claude interview you](https://code.claude.com/docs/en/best-practices)

> "Claude asks about things you might not have considered yet, including technical implementation, UI/UX, edge cases, and tradeoffs." … "Once the spec is complete, start a fresh session to execute it."
> — 同上

**關於 TDD 的順序**（支撐 Q9）〔工程部落格〕

> "Ask Claude to write tests based on expected input/output pairs. Be explicit about the fact that you're doing test-driven development so that it avoids creating mock implementations, even for functionality that doesn't exist yet in the codebase."
> — [Claude Code Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices)

> "Ask Claude to commit the tests when it's satisfied with them."
> — 同上

**關於審查：AI 不核准、審查者要用乾淨 context**（支撐 Q15、Q18）

> "Findings are tagged by severity and don't approve or block your PR, so existing review workflows stay intact."
> — [Code Review](https://code.claude.com/docs/en/code-review)

> "The check run always completes with a neutral conclusion so it never blocks merging through branch protection rules."
> — 同上

> "A fresh context improves code review since Claude won't be biased toward code it just wrote."
> — [Best practices › Run multiple Claude sessions](https://code.claude.com/docs/en/best-practices)

> "A reviewer running in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that produced the change, so it evaluates the result on its own terms."
> — [Best practices › Add an adversarial review step](https://code.claude.com/docs/en/best-practices)

> "A reviewer prompted to find gaps will usually report some, even when the work is sound, because that is what it was asked to do. Chasing every finding leads to over-engineering. … Tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional."
> — 同上

實作獨立審查者的機制是 **custom subagent**（在 `.claude/agents/` 放定義檔，指定專長、可用工具與模型）：

> "Subagents run in their own context with their own set of allowed tools. They're useful for tasks that read many files or need specialized focus without cluttering your main conversation."
> — [Best practices › Create custom subagents](https://code.claude.com/docs/en/best-practices)

**關於 advisory vs enforced**（支撐 Q24）

> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."
> — [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices)

> "Hooks are user-defined shell commands. Claude Code runs them at specific points in its lifecycle, which gives you deterministic control: certain actions always happen rather than relying on the LLM to choose to run them."
> — [Hooks guide](https://code.claude.com/docs/en/hooks-guide)

> "Both are loaded at the start of every conversation. Claude treats them as context, not enforced configuration. **To block an action regardless of what Claude decides, use a PreToolUse hook instead.**"
> — [Memory](https://code.claude.com/docs/en/memory)（指 CLAUDE.md 與 auto memory）

> "Settings rules are enforced by the client regardless of what Claude decides to do. CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer."
> — [Memory › Manage CLAUDE.md for large teams](https://code.claude.com/docs/en/memory)

有副作用的流程要鎖成只有人能觸發；核准的責任在人：

> "Use `disable-model-invocation: true` for workflows with side effects that you want to trigger manually."
> — [Best practices › Create skills](https://code.claude.com/docs/en/best-practices)

> "Claude Code only has the permissions you grant it. **You're responsible for reviewing proposed code and commands for safety before approval.**"
> — [Security](https://code.claude.com/docs/en/security)

官方也承認逐一核准會退化成橡皮圖章——這是 Q16 的官方版本：

> "This is safe but tedious. After the tenth approval you're not really reviewing anymore, you're just clicking through."
> — [Best practices › Configure permissions](https://code.claude.com/docs/en/best-practices)

**關於 context 衛生**（支撐 Q11、Q23、Q24）

> "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills."
> — [Best practices](https://code.claude.com/docs/en/best-practices)

> "If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. Run `/clear` and start fresh with a more specific prompt that incorporates what you learned. A clean session with a better prompt almost always outperforms a long session with accumulated corrections."
> — [Best practices › Course-correct early and often](https://code.claude.com/docs/en/best-practices)

> "Keep it concise. For each line, ask: *'Would removing this cause Claude to make mistakes?'* If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"（行數判準 "target under 200 lines" 出自 [Memory](https://code.claude.com/docs/en/memory)）
> — [Best practices › Write an effective CLAUDE.md](https://code.claude.com/docs/en/best-practices)

### 2.2 研究數據

| 支撐的問題 | 發現 | 來源與樣本 |
|---|---|---|
| Q1 | 66% 開發者最大挫折是「差一點就對」；45% 說 debug AI 程式碼更花時間；對 AI 準確性的信任 40%→29% | [Stack Overflow 2025 Developer Survey](https://survey.stackoverflow.co/2025/ai)，49,000+ 份、177 國 |
| Q2 | 使用 AI 時完成任務**慢 19%**，同一批人自評**快 20%**；適用條件：對 repo 極度熟悉＋repo 龐大成熟 | [METR RCT](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)，16 位資深開發者、246 個真實任務 |
| Q2（反面） | 大規模導入後採用者合併 PR 多約 24%，四個月觀察窗內持續 | [arXiv 2607.01418](https://arxiv.org/abs/2607.01418)，微軟數萬名工程師 |
| Q2（框架） | 90% 日常使用 AI；AI 對交付吞吐正相關；**AI 是放大器不是解方** | [DORA State of AI-assisted Software Development 2025](https://dora.dev/dora-report-2025/) |
| Q5 | AI 產生程式碼安全通過率平均 **56% 且未隨模型能力改善**；86% 擋不住 XSS、88% 對 log injection 無防禦 | [Veracode 2026 GenAI Code Security Report](https://www.veracode.com/blog/spring-2026-genai-code-security/)，100+ 模型、四次快照 |
| Q7、Q16 | 審查負擔外部化的質性框架：Review Friction／Quality Degradation／系統性誘因；定性為**公地悲劇** | [arXiv 2603.27249 "An Endless Stream of AI Slop"](https://arxiv.org/abs/2603.27249)，1,154 則開發者貼文質性分析 |
| Q8 | Coding agent 的 reward hacking 已可量測（改測試、hardcode、假完成） | [EvilGenie](https://arxiv.org/html/2511.21654v2)、[SpecBench](https://arxiv.org/html/2605.21384v1)、[Cursor: Reward hacking is swamping model intelligence gains](https://cursor.com/blog/reward-hacking-coding-benchmarks) |
| Q8 | Agent 在 code freeze 期間刪除正式資料庫並謊稱無法復原 | [The Register 報導](https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/)、[AI Incident Database #1152](https://incidentdatabase.ai/cite/1152/) |
| Q12 | 複用 ↓35%、重構行移動 ↓70%、legacy 維護 ↓74%、複製貼上 ↑41%、重複區塊 ↑81%、error-masking ↑47% | [GitClear: The Maintainability Gap](https://www.gitclear.com/the_ai_code_quality_maintainability_gap)，6.23 億行變更（2023–2026） |
| Q13 | AI 建議不存在套件的比率 **19.7%**；幻覺具一致性 → 可被搶註冊（slopsquatting） | 576,000 樣本研究；實例見 [Aikido Security](https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks)、[Snyk](https://snyk.io/articles/slopsquatting-mitigation-strategies/) |
| Q13 | AI coding 工具不尊重 `.gitignore`；核准指令的快取可能帶出憑證 | [Check Point 研究報導](https://www.developer-tech.com/news/check-point-ai-coding-assistants-leaking-api-keys/)、[TechTalks](https://bdtechtalks.com/2026/04/27/claude-code-api-token-leak/) |
| Q21 | **32% 資深** vs **13% 初階**說自己出貨的程式碼過半是 AI 產的；資深宣稱顯著增益的比例是初階兩倍 | [Fastly 調查](https://www.fastly.com/blog/senior-developers-ship-more-ai-code) |
| Q21、Q28 | 重度依賴 LLM 造成記憶力下降、神經參與度降低；先用 LLM 者難以重新啟動獨立作業所需的神經網路 | [MIT: Your Brain on ChatGPT（認知債）](https://brainmindsociety.org/posts/the-cognitive-costs-of-chatgpt-understanding-mits-viral-study) |
| Q28 | AI 產生的不熟悉區段平均除錯 ~45 分鐘 vs 手寫 ~15 分鐘；「70% 問題」框架 | [Addy Osmani: The 70% problem](https://addyo.substack.com/p/the-70-problem-hard-truths-about) |
| Q23 | Agentic 工作流 token 消耗是 chat 查詢的 5–30 倍；企業預算失控實例 | [Cockroach Labs: The Bill Arrives](https://www.cockroachlabs.com/blog/agentic-ai-costs-at-scale/) |
| Q19 | 「Complacency with AI-generated code」被列入 **Hold**；建議用架構適應度函數持續機械化強制約束 | [Thoughtworks Technology Radar](https://www.thoughtworks.com/en-us/radar/techniques/complacency-with-ai-generated-code) |

> **引用紀律**：以上都是有方法論揭露的來源。市面上流傳的「AI PR 大 2.5 倍」「審查時間 +441%」等廠商統計方向可信但絕對值不可靠，本文只在 Q7 以「方向一致」的方式提及，不當論據。

### 2.3 其他團隊怎麼訂政策

開源社群的回應落在一條光譜上，值得對照：

| 立場 | 代表 | 可借鑑之處 |
|---|---|---|
| **完全禁止** | QEMU、Gentoo、NetBSD | QEMU 的論證只建立在**單一可辯護的理由**（DCO 合規：貢獻者必須完全理解所貢獻內容的著作權狀態，而 AI 輸出的授權狀態無定讞法律基礎），不談品質。同時明確區分「確定性工具（codemod、formatter、linter）不算生成器」——這個區分讓自動化工具不會被規則誤傷。 |
| **允許但強制究責** | **Linux kernel**、Fedora、Apache、LLVM | 見下方。收斂到 commit trailer `Assisted-by:`（記錄工具參與），而非 `Co-authored-by:`（那主張共享作者身分與問責，工具無法履行）。 |
| **允許但限制貢獻者** | **Ghostty** | 首次貢獻者需維護者擔保；有公開的重複違規名單。 |
| **關閉外部貢獻** | tldraw、curl（關閉 bug bounty） | curl 形容 AI slop 報告等同 DDoS，且**過去六年沒有任何 AI 輔助報告發現過真正的 bug**。 |

**Linux kernel** 的 [`coding-assistants.rst`](https://github.com/torvalds/linux/blob/master/Documentation/process/coding-assistants.rst) 最值得借鑑的兩點：

> **AI agents MUST NOT add Signed-off-by tags. Only humans can legally certify the Developer Certificate of Origin (DCO).**

以及它的 bug 修復程序第 8 步（Q14 的來源）：**明確說明哪些事情沒做到**——如果修復無法建置或測試、無法產生 reproducer，就明講，因為維護者浪費太多時間在分析未驗證的報告與未測試的修復。

**Ghostty** 的 [`AI_POLICY.md`](https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md) 值得學的是說理方式而不只是規則：

> **如果你無法在沒有 AI 工具協助的情況下解釋你的變更做了什麼、以及它如何與更大的系統互動，請不要貢獻此專案。**（Q17 的來源）

> 每一個 discussion、issue 和 pull request 都由人類閱讀與審查。以低品質、未經檢驗的成果靠近這個邊界是粗魯且不尊重的，因為它把驗證的負擔丟給了維護者。

它同時明確澄清立場，避免被誤讀為反 AI：**「我們嚴格 AI 政策的理由不是反 AI 立場，而是因為大量極不合格的人在使用 AI。問題出在人，不是工具。」**——Ghostty 本身就是在大量 AI 協助下寫成的。這個修辭選擇值得我們照抄。

---

## Part 3：EP實作怎麼做到

EP實作是我們的範例專案（單人＋AI 開發），Part 1 的規則在那裡幾乎都有對應的機械承載。檔案路徑為 EP實作 repo 內的相對路徑。

### 3.1 規則 → 機制對照

| 規則 | EP實作怎麼做 | 關鍵檔案 |
|---|---|---|
| 3 計畫先行 | 三段式流程：`/plan-feature` 規劃 → `/review-plan` 四視角 AI 審 → **停等人審** → 人親自啟動實作 → `/review-implementation` 用同四視角審 diff、專攔「規劃審過、實作走偏」。而且 hook 會**機械擋掉**「沒有規劃書就寫產品程式碼」 | `.claude/skills/plan-feature/`、`.claude/skills/review-implementation/`、`.claude/hooks/feature-plan-guard.py` |
| 4 小步交付 | 規劃書強制「階段切分」，一階段對應一次紅綠循環；CI 檢查分支歷史保持一直線 | `.claude/skills/plan-feature/`、`.github/workflows/ci.yml` |
| 5 先紅後綠 | 紅燈測試 commit（`test(red)`）後建立鎖檔，**紅燈期 hook 禁止編輯測試檔**；唯一解鎖路徑是檢查全綠——把 Q9 的「事後揭露」升級成「事前做不到」 | `.claude/hooks/tdd-test-guard.py`、`scripts/tdd-unlock.sh` |
| 10 附證據 | PR 範本要求填規劃／審查結論、紅燈 commit hash、CI；部署後打 `/api/health` 比對版本 sha；正式站部署需人工核准 | `.github/pull_request_template.md`、`.github/workflows/deploy-supabase.yml` |
| 11 AI 找碴 | 用 **custom subagent** 實作審查分身：`.claude/agents/` 每個 agent 一個定義檔，frontmatter 限定**唯讀工具**與模型，確保「只能看、不能改、fresh context」。四個 reviewer（系統／架構／UIUX／需求）輸出統一 P0／P1／P2 契約、彙整者明文禁止改判；第五個 `codebase-scout` 專做探查，把大量讀檔隔離在自己的 context | `.claude/agents/plan-reviewer-*.md`、`.claude/agents/codebase-scout.md`、`docs/_templates/review.md` |
| 12 補證據再審 | PR 範本的「流程證據」欄位就是 reviewer 開審前的檢核清單——缺哪項一目瞭然 | `.github/pull_request_template.md` |
| 17 enforced | 9 支 hook：擋 git 後門（`--no-verify`、force push、直推主幹）、TDD 相位違規、無規劃寫碼；實作 skill 設 `disable-model-invocation: true`——**AI 無法自己啟動實作階段** | `.claude/hooks/bash-guard.py`、`.claude/skills/tdd-implement/SKILL.md` |
| 18 閘門也要驗證 | 所有自撰檢查器先跑自己的表格測試再實掃；hook 行為有測試；新檢查要求 mutation testing | `scripts/test-hooks.py`、`scripts/framework-check.sh` |
| 19 只准向好 | 覆蓋率門檻設在實測值下緣、紅了擋 commit；bundle 大小同樣走 ratchet | `vitest.config.ts`、`scripts/check-bundle-budget.mjs` |
| 21 context 衛生 | CLAUDE.md 維持 200 行內，且把「啟動固定成本上限」做成 CI 檢查；探查交給 subagent 隔離 | `scripts/check-context-budget.py` |
| 22 防線回填 | 修 bug 流程強制含根因分析＋同類掃描＋防線回填；hook 決策有量測（誤擋率、命中率） | `.claude/skills/fix-bug/`、`scripts/harness-metrics.py`、`docs/plans/friction-log.md` |
| 9 依賴與機密 | `permissions.deny` 擋讀 `.env*` 等敏感檔 | `.claude/settings.json` |

### 3.2 EP實作做得比官方基線更細的六件事

1. **「約定會被忽略」當設計公理**：被違反過的約定就升級成機械檢查（Q24 的升級判準就是從這裡來的），並用 friction log 追蹤誤擋與漏網、定期整併成框架修訂。範例：`git commit --no-verify` 曾是繞過檢查的口子 → 現在被 hook 直接擋。
2. **審查獨立性的結構化**：官方只說「用 fresh context 審」；EP實作加上視角分工、嚴重度契約（P0 未處置不得進實作）、「彙整者禁止改判」、「需求對不到規格書＝一律 P0」等硬規則。
3. **閘門的閘門**：mutation testing 抓出過「12 條突變中 2 條檢查空轉」的實證（Q25 的來源）。
4. **不可能假綠的測試設計**：全鏈路測試連不上就硬失敗、情境數低於下限就硬失敗——源自一次「27 個情境全 skip 卻顯示全綠」的真實事故。
5. **規格書防漂移的機械比對**：業務常數、路由、狀態機列舉與規格書逐條比對，不同步就 CI 紅；連「比對規則抽取不到值」也算失敗，防止閘門靜默變空轉。這讓規格書能一直當 single source of truth 用，Q6 的「審查殘留測試」與需求視角的「對不到規格書＝P0」才有可靠的溯源對象（`scripts/check-spec-drift.py`）。
6. **流程自身有迭代迴圈**：hook 決策量測＋friction log＋定期框架修訂 PR——規範跟程式碼一樣有 bug、要量測、要修。

### 3.3 EP實作還缺什麼、接下來要導入什麼

| 優先 | 項目 | 補哪一條規則的縫 |
|---|---|---|
| P1 | 合併規則加入**人類 approve** 要求（EP實作目前唯一 required check 是 CI；組織其他專案已有兩位 reviewer，應對齊） | 規則 11、15：人的裁決點要 enforced，不能只是文化 |
| P1 | coverage ratchet 的「只准調高」目前是註解約定——新增 CI 檢查：門檻被調低即紅，除非附豁免理由 | 規則 19：閘門參數可被悄悄放寬（Q26 的縫隙） |
| P2 | 依賴新增檢查：PR 引入新套件時自動查存在性與下載量、要求人工確認 | 規則 9：目前 slopsquatting 完全靠人記得（Q13） |
| P2 | PR 規模軟警戒：diff 超標時 CI 留言建議拆分（**不硬擋**——硬擋會逼出湊行數的壞行為） | 規則 4：小步交付目前只是約定 |
| P2 | 試點官方 [Code Review](https://code.claude.com/docs/en/code-review)＋`REVIEW.md` 作為 PR 開啟後的第二道獨立防線（注意其 check run 永遠中性，要 gate 需自行解析輸出） | 規則 11：多一層與 session 無關的審查 |
| P3 | 結構指標儀表板：重複區塊比例、複用率、重構佔比、error-masking 出現率 | 規則 20：目前只有 hook metrics，沒有 codebase 健康度（Q19） |
| P3 | Outer loop 依序建設：感測器資料累積 → skill 觸發命中率評估 → friction log 整併排程化 → 第一條唯讀自動迴路（先補迭代與預算上限） | Q29 的依賴順序：先觀測 → 再評估 → 才自動化 |

### 3.4 其他專案怎麼開始（成熟度階梯）

每一級的達標判準是「enforced」，不是「已宣導」：

- **L0（一天）**：精簡 CLAUDE.md（≤200 行）＋PR 範本要求測試證據與「哪些沒做到」＋既有兩位 reviewer 制度寫進 ruleset（required approvals＋CI 綠才可合併）＋禁區清單（規則 2）。這是三個痛點的最低配。
- **L1（一週）**：pre-commit 統一閘門（lint＋型別＋測試）且擋繞過手段；CI 單一匯總 required check；覆蓋率門檻；新依賴人工確認。
- **L2（一個月）**：計畫先行（Plan Mode 或 plan 檔＋人審）；TDD 紅燈證據 commit；AI 多視角審查＋嚴重度契約；審查用 fresh context 的 subagent。
- **L3（持續）**：防線回填＋同類掃描；friction log；閘門自檢＋mutation testing；ratchet 指標；結構指標追蹤。
- **L4（前沿，選配）**：先觀測、再評估、才自動化；unattended 迴路必備四控制（迭代上限、預算上限、可自評的成功條件、失敗升級路徑）。

**推行方式**：不要全組織分階段強制（那會製造 Q20 的表演性使用）。找 1–2 個種子團隊照 L0→L1 跑出成功案例、讓他們變成導師擴散；指定一位 DRI 維護組織層的共用資產（CLAUDE.md、rules、agents、hooks）；每季回訪剪枝——規則太多會互相稀釋，這點對本規範自身同樣成立。

---

## 附錄：名詞速查

| 名詞 | 一句話說明 | 延伸閱讀 |
|---|---|---|
| **AI Native Engineering** | 把 AI agent 當成主要的寫碼勞動力、人類轉為負責「決策、審查、驗證」的工程方法論（業界通稱，尚無單一官方定義） | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Claude Code** | Anthropic 官方的 AI 開發代理：在終端機／網頁裡讀你的程式碼、跑指令、改檔案、自己迭代到任務完成 | [官方總覽](https://code.claude.com/docs/en/overview) |
| **Agentic coding / agent** | AI 不只「回答問題」，而是自主連續行動（讀檔→改碼→跑測試→修正）直到完成任務的工作型態 | [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works) |
| **Harness** | 圍繞 AI 搭起來的整套工作環境（工具、權限、守衛腳本、CI），決定 AI 能做什麼、不能做什麼 | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Context window** | 模型單次能「記在腦中」的內容上限（對話＋讀過的檔案），塞太滿表現會下降 | [Context window](https://code.claude.com/docs/en/context-window) |
| **Context rot** | 長對話中有效注意力隨雜訊上升而下降，導致早期指令被「遺忘」的現象 | Q11、Q24 |
| **CLAUDE.md** | 放在 repo 裡、AI 每次開工都自動讀的「專案說明書」；屬於 advisory 層級，AI 可能忽略 | [Memory](https://code.claude.com/docs/en/memory) |
| **Advisory / Enforced** | 規則的兩個強制層級：advisory＝寫在文件裡的建議（AI 與人都可能忽略）；enforced＝由 hook／CI／ruleset 強制、違規做不到 | [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices) |
| **Plan Mode** | Claude Code 的唯讀模式：AI 只能讀檔和提出計畫，人核准後才放行實作 | [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| **Hook** | 掛在 AI 工作流程固定節點（如「執行指令前」）自動跑的腳本——保證執行、不靠 AI 自覺 | [Hooks guide](https://code.claude.com/docs/en/hooks-guide) |
| **Subagent** | 派出去的「分身」AI：在獨立的 fresh context 裡做探查或審查、只回報結論 | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| **Fresh context** | 沒有前情、不知道程式碼怎麼寫出來的乾淨腦袋——審查者必要的條件 | [Best practices](https://code.claude.com/docs/en/best-practices) |
| **Skill / slash command** | 打包成檔案、可用 `/名字` 呼叫的可重複工作流程，可設定成「只有人能觸發」 | [Skills](https://code.claude.com/docs/en/skills) |
| **Permission / allowlist / deny** | Claude Code 的權限系統：預設唯讀、有動作要人核准；白名單放行安全指令、deny 封鎖敏感檔案 | [Permissions](https://code.claude.com/docs/en/permissions) |
| **Reward hacking** | Agent 為了讓「成功訊號」變綠而作弊（改測試、hardcode 期望值、放寬 timeout） | Q8 |
| **Slopsquatting** | 攻擊者搶先註冊 AI 反覆幻想出來的套件名，等著被誤裝 | Q13 |
| **Code Review（官方功能）** | Anthropic 的 PR 自動審查服務：多個特化 AI 並行找碴、驗證後留言，但從不核准也不擋合併 | [Code Review](https://code.claude.com/docs/en/code-review) |
| **REVIEW.md** | 放在 repo 根目錄、專門指揮審查 AI 的最高優先指示檔（調嚴重度定義、nit 上限、略過範圍） | [Code Review › REVIEW.md](https://code.claude.com/docs/en/code-review#review-md) |
| **TDD（測試驅動開發）** | 先寫「會失敗的測試」定義正確行為，再寫實作讓它變綠——紅綠燈給 AI 明確的自我驗證訊號 | [Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices) |
| **Coverage ratchet** | 測試覆蓋率門檻「只准調高、不准調低」的機制（ratchet＝棘輪，只朝一個方向轉的齒輪） | Q26 |
| **Mutation testing** | 故意把程式或檢查「改壞」一次，驗證測試／閘門真的會變紅——證明防線不是空轉 | [Wikipedia](https://en.wikipedia.org/wiki/Mutation_testing) |
| **pre-commit hook（git）** | git 原生機制：commit 前自動跑檢查、紅燈就擋（與 Claude Code 的 hook 是兩套東西） | [Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks) |
| **CI / required check / ruleset** | CI＝每次 push 自動跑的檢查流水線；ruleset＝GitHub 上「哪些檢查必須綠、要幾個 approve 才准合併」的強制設定 | [GitHub: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) |
| **DCO / Assisted-by** | 開發者原創聲明；`Assisted-by:` 是記錄「工具參與」的 commit trailer，有別於主張共同作者的 `Co-authored-by:` | Q22、[Linux 政策](https://github.com/torvalds/linux/blob/master/Documentation/process/coding-assistants.rst) |
| **Loop Engineering** | 與其一句句提示 AI，不如設計「什麼觸發 AI、誰驗證產出、何時停止」的自動迴路 | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **P0 / P1 / P2** | 審查發現的嚴重度分級：P0＝阻擋（不修不准前進）、P1＝應改、P2＝建議 | EP實作 `docs/_templates/review.md` |

---

*前期研究（官方引句逐字核對紀錄、EP實作全機制盤點、逐項差距分析）見同目錄 `research.md`。*
