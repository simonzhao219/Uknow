# iOS 注音組字中被受控 input 改寫值，注音符號累積殘留 修復紀錄

分支:`claude/iphone-zhuyin-input-bug-fst7ju`|重現測試(紅燈 commit):見 §5

## 1. 症狀與重現

使用者以 iPhone Safari + 內建注音輸入法，在「完善資料」表單的**姓名**欄位打
「陳子安」（影片證據，12 秒）:

| 時間點 | 欄位內容 | 計數器 |
|---|---|---|
| 開始 | 空 | 0/10 |
| 打完第一輪注音 | `ㄔㄣˊㄗ ㄔㄣˊㄗ` | 8/10 |
| 繼續打 | `ㄔㄣˊㄗ ㄔㄣˊㄗ ㄔㄣˊㄗ ㄔㄣˊㄗ ㄔㄣˊㄗ` | **32/10** |
| 從候選字選「陳子安」 | `ㄔㄣˊㄗ …（同上一串）… 陳子安` | **35/10** |

三個可獨立觀察的異常:

1. **注音符號沒被吃掉**——組字用的注音應該在選字時被候選漢字**取代**，實際
   是整串留在值裡，且每按一次鍵就把整個組字緩衝再插一次(8 → 32)。
2. **選出來的漢字被接在垃圾後面**，不是取代垃圾。
3. 全程 `已將分隔符號轉換為半形空格` 這句提示掛在畫面上——系統對著一串
   **還沒組完字的暫時性文字**宣稱它動了使用者的姓名，而 aria-live 會把這句
   唸出來。

影響面:中文姓名欄位是註冊必經欄位，iOS + 注音是台灣最主流的中文輸入組合。
使用者只能靠退格清乾淨、換輸入法或放棄註冊。

## 2. 根因

`src/components/CompleteProfile.tsx` 的 `handleNameChange` 在**每一次** input
事件都改寫受控值:

```ts
const converted = raw.replace(SEPARATOR_LIKE_GLOBAL, ' ');
setFormData({ ...formData, name: converted });   // ← 寫回受控值
```

機制層:

1. IME 組字期間，瀏覽器會把「正在組的字」(composing / marked text)當成
   input 的值持續丟出 `input` 事件。React 受控元件會在 re-render 時比對
   `props.value` 與 DOM 的 `node.value`，**不一致就把 DOM 的值蓋掉**。
2. 只要 `converted !== raw`，這次 setState 就會讓 React 在組字進行中對
   `input.value` 寫回一個和瀏覽器持有的組字文字不同的字串。
3. WebKit(iOS Safari)在組字中被外部改寫 `value` 時，會**丟掉 composition
   range 但保留已插入的文字**——IME 自己的緩衝卻沒被清掉。於是下一次按鍵
   時，IME 把整個緩衝當成新文字**再插一次**，形成 8 → 32 的累積；等到選字，
   候選漢字也只能**接在**殘留文字後面(35)。

為什麼當時沒被發現:

- `SEPARATOR_LIKE_GLOBAL` 的規則是 `\p{P}`(標點)與 `\p{Z}`(分隔符)，
  **注音符號本身不在裡面**——`ㄅ`–`ㄦ`(U+3105–U+312F)是 `Lo`，聲調
  `ˊ ˇ ˋ` 是 `Lm`。所以「拿注音字元去試 regex」這種驗證會全綠，看不出問題。
  出事的不是 regex 匹配到了什麼，而是**在組字期間寫回受控值這個動作本身**。
- 既有測試(`CompleteProfile.test.tsx`)全部用 `fireEvent.change` 一次丟進
  完整字串。那模擬的是「已經組完字/貼上」的路徑，**組字生命週期
  (compositionstart → 多次 input → compositionend)從來沒有被測過**。
- Desktop Chrome 與 Android 重現不出來:它們對「組字中被改寫 value」的
  復原行為比 WebKit 寬容。本專案沒有 iOS 真機 e2e。

**根因一句話:受控 input 在 IME 組字期間改寫(或拒收)自己的值，破壞了
瀏覽器的組字狀態。** 分隔符號轉換只是「哪一段程式碼做了這件事」。

## 3. 同類掃描

- **根因抽象成的 pattern**:受控 `<Input>` / `<Textarea>` 的 `onChange`
  沒有原樣接受 `e.target.value`——不論是**改寫**(`.replace` / `.toUpperCase`)
  還是**拒收**(`if (value.length <= N) setState(...)`，不滿足就整個丟掉)，
  結果都是 React 把一個與瀏覽器組字狀態不同的值寫回 DOM。**拒收比改寫更糟**
  ——它寫回的是上一個值，等於在組字中途把欄位整個倒帶。
- **掃描方式**:
  - `rg 'e\.target\.value\.(replace|toUpperCase|toLowerCase|trim|slice|substring|normalize)' src/`
  - `rg 'e\.target\.value\.length <= \d+' src/`
  - 逐一檢視 `src/components/**/*.tsx` 的全部 53 處 `onChange`
- **結果**:☒ 找到——一併修

| 位置 | 改寫方式 | 會不會打中文 | 判定 |
|---|---|---|---|
| `CompleteProfile.tsx:216` 姓名 | 分隔符號 → 半形空格 | **會**(這就是回報的 bug) | 一併修 |
| `CreateServiceProvider.tsx:297` 服務者名稱 | 拒收 >10 | **會** | 一併修 |
| `CreateServiceProvider.tsx:460` 服務介紹 | 拒收 >200 | **會** | 一併修 |
| `EditServiceProvider.tsx:322` 服務者名稱 | 拒收 > `NAME_MAX_LENGTH` | **會** | 一併修 |
| `EditServiceProvider.tsx:481` 服務介紹 | 拒收 > `DESCRIPTION_MAX_LENGTH` | **會** | 一併修 |
| `CompleteProfile.tsx:739` 推薦碼 | `.toLowerCase()` | 否(ASCII 推薦碼) | 不修，見下 |
| `WithdrawalProcess.tsx:611` 身分證字號 | `.toUpperCase()` | 否 | 不修，見下 |
| `IdNumberInput.tsx:121` 身分證字號 | `.toUpperCase()` | 否 | 不修，見下 |

後三者形狀相同但**打不中**:`toLowerCase()` / `toUpperCase()` 對注音符號與
漢字都是 identity，`converted === raw`，React 不會寫回 DOM，組字不受影響。
列出來是為了說明「同樣的形狀為什麼這裡沒事」，不是漏修。

四個服務者欄位是**真的壞的**——組字中的注音緩衝很容易就超過 10 字上限
(例:「專業美髮師」= `ㄓㄨㄢ ㄧㄝˋ ㄇㄟˇ ㄈㄚˇ ㄕ` 已 13 字)，一超過就整個
被拒收、值倒帶，症狀與姓名欄位同源。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 修法只改「**何時**」套用轉換(組字結束後)，不改「轉換成什麼」。`validateName` 與後端 `name-validation` 的規則一個字都沒動，前後端契約不變。送出的值仍必然是轉換過的:`compositionend` 一定早於 blur/submit。 |
| 架構 | 是**點狀 bug 的一個類**，不是地基問題——五個受影響點共用同一個缺失的原語(IME 組字守衛)，而不是共用一個錯誤的抽象。處置是把這個原語抽成 `useImeComposition` 並在唯一需要「改寫」的點使用；四個「拒收」點根本不需要 JS 守衛(見 §5)。不升級 `/plan-feature`。 |
| UIUX | 這個 bug**本身**就是 UX 反模式的後果:「在使用者還沒打完時就動他的字」。修完後轉換提示只會在組字完成後出現，aria-live 不再對著暫時性文字播報。計數器在組字期間會短暫顯示注音字數——這是瀏覽器的真實值，欄位裡看得到，不是謊報。 |
| 需求 | 規格書 §2.1 定義了姓名的**合法形狀**，沒有定義「輸入過程中的中間狀態」該怎麼處理——這正是缺口所在。本次把「組字期間不動使用者的字」釘進測試當作行為契約；規格書無須改動(它描述的是最終值，而最終值的規則沒變)。無開放問題。 |

## 5. 修法與驗證

**新增 `src/hooks/useImeComposition.ts`**:一個把「組字期間別碰值」這件事
講明白的小原語。回傳可展開到 `<Input>` 的 props，語意是:

- 組字期間:`setState(raw)` 原樣收下，**不轉換、不提示**。原樣收下是必要的
  ——不 setState 的話 React 會拿舊值寫回 DOM，那就是「拒收」那條更糟的路徑。
- `compositionend`:對最終值跑一次轉換。
- 非組字期間(一般打字、貼上、Android 直接輸入):行為與修復前完全相同。

轉換是 idempotent 的(`SEPARATOR_LIKE_GLOBAL` 用 `[^ ]` 排除半形空格本身)，
所以 Chrome/Android 的 `compositionend` 早於最後一次 `input` 事件、導致轉換
跑兩次，也不會有副作用——這個順序差異刻意不靠事件順序假設來處理。

**四個服務者欄位:直接刪掉 JS 拒收守衛**，不套 hook。

- 兩個「服務者名稱」已同時掛了 `maxLength={10}` / `maxLength={NAME_MAX_LENGTH}`，
  DOM 層本來就不會產生超長的值，JS 守衛從來沒有生效過——刪掉是行為上的
  no-op，只是拿掉了破壞組字的那條路徑。
- 兩個「服務介紹」原本**沒有** `maxLength` 屬性，JS 守衛是唯一的上限，所以
  補上 `maxLength`。差別只在貼上超長文字時:原本是整段貼上被拒(欄位毫無
  反應)，現在是截斷到上限——與兩個名稱欄位既有的行為一致，也比「按了沒反應」
  好。`maxLength` 是 IME 安全的:瀏覽器不對組字中的文字套用長度限制，只在
  組字提交時截斷，全程不需要 React 寫回 DOM。

**為什麼這樣修是對的(對照根因)**:根因是「組字期間寫回受控值」，修法直接
消除這個動作——需要轉換的那一個點延後到組字結束，不需要 JS 介入的四個點
把介入整個拿掉。沒有任何一處是靠「偵測注音字元並放行」來繞開症狀:那種修
法會在下一個輸入法(倉頡、拼音、日文假名、韓文)原地重現。

## 6. 防線回填

**為什麼既有閘門沒攔到**:三層都攔不到，而且是同一個原因——

1. `CompleteProfile.test.tsx` 用 `fireEvent.change` 一次丟完整字串，模擬的是
   「已組完字」的終點狀態。**組字生命週期沒有任何一個測試覆蓋**。
2. `e2e/`(mocked Playwright)用 `fill()`，同樣直接設定終值，不觸發 composition。
3. biome / typecheck / knip 看不出「這個 setState 發生在組字期間」——這是
   執行期的瀏覽器狀態，不是靜態性質。

**處置**:☒ 已補閘門

- `src/hooks/useImeComposition.test.tsx` 直接驅動
  `compositionstart → change → change → compositionend`，把「組字期間不轉換、
  結束後轉換一次」釘成契約。
- `src/components/CompleteProfile.test.tsx` 加一條用注音序列走完整組字流程的
  整合測試——未來若有人把 hook 拆掉改回直接轉換，這條會紅。
- ☒ 另記 friction-log:jsdom 測得出組字*事件序列*，但測不出 WebKit「組字中被
  改寫 value 就丟失 composition range」這個**瀏覽器行為**本身。真正等價的
  防線是 iOS Safari 真機 e2e，本專案沒有。這條屬於已知覆蓋落差，記在
  friction-log 而不是假裝補上了。
