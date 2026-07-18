# Uknow 黑箱測試計畫

> **依據**：`01-spec.md` v2（黑箱規格書）
> **版本**：v2（已整合三份黑箱同儕審查：功能完整性 / 負向邊界 / 非功能）
> **測項格式**：Gherkin（Feature / Scenario / Given-When-Then）
> **標註**：**[假設]** = 基於黑箱推定、待 Phase 3 對照確認；**[待定 Dx]** = 對應 spec §8 待定產品決策，斷言以參數化預期值先建骨架。

---

## 1. 測試策略

### 1.1 測試範圍
| 面向 | 說明 |
|---|---|
| 功能 (Functional) | 房間管理、遊戲流程、出牌規則、功能牌、勝負/計分 |
| 正向 (Positive) | 合法操作應成功 |
| 負向 (Negative) | 非法/越權/竄改/重複/邊界操作應被正確拒絕 |
| 邊界 (Boundary) | 人數上下限、手牌 0/1 張、牌堆耗盡、暱稱/房號格式 |
| 例外/復原 (Exception) | 查無/已滿/已開局、斷線重連、逾時、5xx、房間解散 |
| 併發 (Concurrency) | 即時同步、亂序/冪等、競態仲裁、重連一致性 |
| 安全/公平 (Security) | 手牌傳輸機密性、假冒 playerId、竄改、洗牌隨機性、房號強度、注入 |
| 非功能 (Non-functional) | 效能/負載、相容/響應式、無障礙、i18n、可用性 |
| 可測試性 (Observability) | test id、種子測試模式、狀態端點、日誌 |

### 1.2 測試層級
- **L1 UI/E2E**：瀏覽器自動化模擬真實使用者（Phase 3 自動化主力）。
- **L2 API/協定**：**[假設]** 若有後端，直接打 WebSocket/HTTP 驗證伺服器權威裁決與越權防護（安全/併發測項首選層級，較 UI 穩定）。
- **L3 探索性**：人工黑箱補充（無障礙可讀性、錯誤訊息可懂度等）。

### 1.3 優先級
- **P0**：核心不可用即阻斷（進入、開局、出牌、勝負、手牌機密性）。
- **P1**：主要功能與安全（房間管理、功能牌、同步、越權防護）。
- **P2**：輔助/邊界/非功能細節（聊天、無障礙、效能細節、i18n）。

### 1.4 進入 / 退出準則
- **進入**：規格 v2 定稿、Phase 3 已敲定 §8 待定項、測試環境可存取、（理想）可測試性 hooks 就緒。
- **退出**：P0/P1 測項全數執行且通過率達標、無阻斷缺陷未解、非功能量化門檻有 pass/fail 結論。

### 1.5 自動化分層建議（整合非功能審查）
- **適合自動化**：越權/竄改/手牌機密性（L2 協定層）、注入/房號強度/限流（資料驅動）、相容/鍵盤/響應式（Playwright 多瀏覽器＋多尺寸＋test id）、負載基準（協定層虛擬 client）。
- **需謹慎 / 受控時序**：即時同步與競態（多 client 天生 flaky，宜以序號/假時鐘於 L2 注入受控時序，UI 競態少量保留並標記不穩定）。
- **依賴前置條件**：規則正確性測項需種子化測試模式（D15）才可重現；否則以大量隨機對局統計覆蓋，不當阻斷 gate。
- **半自動 + 人工**：色弱/螢幕閱讀器/錯誤訊息可懂度 → 自動驗「屬性存在」（對比度、ARIA），可懂度靠 L3 探索。

---

## 2. Gherkin 測項

### Feature: 進入遊戲與身分設定

```gherkin
Feature: 進入遊戲與身分設定
  作為一位玩家，我想要設定暱稱進入遊戲，以便在對局中被識別

  @P0 @functional @positive
  Scenario: 以合法暱稱進入遊戲
    Given 我開啟 Uknow 首頁
    When 我輸入暱稱 "Alice" 並確認進入
    Then 我應該進入大廳或房間建立畫面
    And 我的暱稱應顯示為 "Alice"

  @P1 @negative
  Scenario: 空白暱稱不可進入
    Given 我開啟 Uknow 首頁
    When 我未輸入暱稱就確認進入
    Then 系統應阻止進入
    And 顯示暱稱必填的具體提示

  @P2 @boundary @negative
  Scenario Outline: 暱稱邊界與安全
    Given 我開啟 Uknow 首頁
    When 我輸入暱稱 "<nickname>" 並確認進入
    Then 系統回應應為 "<result>"

    Examples:
      | nickname                       | result |
      | A                              | 依長度下限允許或拒絕 |
      | (單一半形空白)                   | 視為空白而拒絕 |
      | (全形空白/Tab)                   | 視為空白而拒絕 |
      | (恰好長度上限)                   | 允許 |
      | (長度上限+1)                     | 拒絕並提示過長 |
      | 前後有空白的名字                 | trim 後接受或依規則處理 |
      | 😀🎴 emoji 名                    | 依位元組/字元計算正確處理 |
      | <script>alert(1)</script>       | 安全跳脫顯示，不執行腳本 |

  @P2 @boundary @assumption
  Scenario: 同房內重複暱稱處理 [待定]
    Given 房內已有玩家暱稱 "Alice"
    When 另一玩家以暱稱 "Alice" 加入
    Then 系統應依規則允許（加註識別）或拒絕重名
```

### Feature: 房間管理

```gherkin
Feature: 房間管理
  作為房主或玩家，我想要建立或加入房間，以便一起遊戲

  @P0 @functional @positive
  Scenario: 成功建立房間
    Given 我已進入遊戲並設定暱稱
    When 我點選「建立房間」
    Then 應建立一個新房間，我成為房主
    And 我能取得可分享的房號或邀請連結

  @P0 @functional @positive
  Scenario: 以房號加入既有房間
    Given 存在一個未滿且未開始的房間，房號為 "R123"
    And 我已進入遊戲並設定暱稱
    When 我輸入房號 "R123" 並加入
    Then 我應成功進入該房間的等待區
    And 房內其他玩家能看到我加入，且玩家列表與房主標記正確

  @P1 @negative @exception
  Scenario: 加入不存在的房號
    When 我輸入一個不存在的房號 "ZZZZ" 並加入
    Then 系統應提示查無此房間，我停留在原畫面

  @P1 @negative @boundary
  Scenario Outline: 房號格式邊界與安全
    When 我以房號 "<code>" 嘗試加入
    Then 系統回應應為 "<result>"

    Examples:
      | code                    | result |
      | (空字串)                 | 拒絕並提示需輸入房號 |
      | (含前後空白)             | trim 後處理或拒絕 |
      | r123（大小寫不同）        | 依大小寫敏感規則正確處理 |
      | '; DROP TABLE--          | 安全處理不造成注入 |
      | <img onerror=1>          | 安全處理不執行 |
      | (超長字串)               | 拒絕並提示 |

  @P1 @negative @boundary
  Scenario: 加入已滿的房間
    Given 存在一個已達人數上限的房間 "FULL1"
    When 我嘗試加入房間 "FULL1"
    Then 系統應拒絕加入並提示已滿
    And 房內實際人數不變、既有玩家不受影響、我未進入等待區

  @P1 @negative @exception
  Scenario: 加入已開局的房間
    Given 房間 "PLAY1" 的對局已經開始
    When 我嘗試以房號加入 "PLAY1"
    Then 系統應拒絕加入為對局者，或依規則以觀戰身分進入 [待定 D10]

  @P1 @negative @concurrency
  Scenario: 同一身分重複加入同房
    Given 我已在房間 "R123" 內
    When 我以另一分頁用同房號再次加入 "R123"
    Then 系統不應產生兩個佔位，應被拒或回到既有位置

  @P1 @security @negative
  Scenario Outline: 私人房 / 密碼房越權
    Given 存在需密碼的私人房 "SECRET"
    When 我以密碼情況 "<pwd>" 嘗試加入
    Then 結果應為 "<result>"

    Examples:
      | pwd        | result |
      | (正確密碼) | 允許進入 |
      | (錯誤密碼) | 拒絕，且不洩漏房內資訊 |
      | (未輸入)   | 拒絕並要求密碼 |
      | (連續多次錯誤) | 應限流阻擋暴力嘗試 |

  @P2 @security
  Scenario: 私人房不出現在公開清單且房號不可列舉
    Given 存在一個私人房
    Then 公開房間清單不應顯示該私人房
    And 房號應具足夠亂數強度，無法由既有房號推測列舉

  @P1 @functional
  Scenario: 玩家離開房間
    Given 我在一個等待中的房間內
    When 我點選「離開房間」
    Then 我應返回大廳或首頁，房內其他玩家看到我已離開

  @P2 @functional @assumption
  Scenario: 房主離開房間的處理 [假設]
    Given 我是房主，房內尚有其他玩家
    When 我離開房間
    Then 房主權限應轉移給其他玩家或房間關閉，其他玩家收到通知

  @P1 @security @negative
  Scenario Outline: 非房主越權操作
    Given 我是房內的非房主玩家
    When 我嘗試直接觸發 "<action>"（含繞過 UI 打 API）
    Then 伺服器應拒絕，房間狀態不變

    Examples:
      | action     |
      | 開始遊戲   |
      | 踢除玩家   |
      | 修改房間設定 |
      | 解散房間   |
      | 加入 AI 玩家 |

  @P2 @functional @assumption
  Scenario: 房主踢人與玩家 ready [假設]
    Given 我是房主，等待區內有玩家 B
    When 我踢除玩家 B
    Then 玩家 B 被移出房間並收到通知
    And 玩家切換 ready 後房主才能開始（若採 ready 機制）
```

### Feature: 開始遊戲與發牌

```gherkin
Feature: 開始遊戲
  作為房主，我想要在人數足夠時開始遊戲

  @P0 @functional @positive
  Scenario: 人數足夠時開始遊戲
    Given 我是房主，房內人數達最低開局人數
    When 我點選「開始遊戲」
    Then 遊戲應開始，每位玩家獲得初始手牌（張數等於規格值 [待定 D9]）
    And 棄牌堆翻開一張起始牌，並顯示輪到哪位玩家

  @P1 @boundary @positive
  Scenario Outline: 開局人數成對邊界
    Given 房內人數為 <count>
    When 房主嘗試開始遊戲
    Then 結果應為 "<result>"

    Examples:
      | count        | result |
      | 最低-1       | 阻止並提示人數不足 |
      | 恰好最低     | 允許開始 |
      | 恰好上限     | 允許開始 |

  @P2 @functional @assumption
  Scenario Outline: 起始翻牌為功能牌的開局處理 [待定 D4]
    Given 開局翻開的頂牌為 "<card>"
    Then 首位玩家行為與（Wild 時）選色歸屬應符合規則定義

    Examples:
      | card    |
      | Skip    |
      | Reverse |
      | Draw Two |
      | Wild    |
```

### Feature: 出牌合法性

```gherkin
Feature: 出牌合法性
  作為輪到出牌的玩家，我只能打出符合規則的牌

  @P0 @functional @positive
  Scenario: 打出同花色的牌
    Given 當前有效花色為紅色，頂牌是「紅色 5」，輪到我
    And 我手中有「紅色 8」
    When 我打出「紅色 8」
    Then 出牌成功，頂牌變為「紅色 8」，換到下一位玩家

  @P0 @functional @positive
  Scenario: 打出同數字的牌
    Given 頂牌是「紅色 5」，輪到我
    And 我手中有「藍色 5」
    When 我打出「藍色 5」
    Then 出牌成功，當前有效花色變為藍色

  @P0 @negative
  Scenario: 打出不合法的牌
    Given 當前有效花色為紅色，頂牌是「紅色 5」，輪到我
    And 我手中有「藍色 8」
    When 我嘗試打出「藍色 8」
    Then 出牌被拒並顯示具體原因（需與紅色或 5 相符）
    And 我的手牌張數不變、頂牌不變、仍輪到我、其他玩家畫面無變化

  @P1 @security @negative
  Scenario: 非自己回合不能出牌
    Given 現在不是我的回合
    When 我嘗試打出手中任一張牌
    Then 出牌被拒
    And 我的手牌數、棄牌堆頂牌、當前回合指標皆不變，對手未收到任何更新

  @P0 @security @negative
  Scenario: 出一張手中沒有的牌（竄改）
    Given 存在後端權威驗證 [待定 D13]
    When 前端被竄改，送出一張我手中不存在的牌 ID
    Then 伺服器明確拒絕（非靜默丟棄），全局狀態逐項不變

  @P1 @security @negative
  Scenario: 重複打出同一張已離手的牌（冪等/竄改）
    When 我對同一張已打出的牌重送出牌請求
    Then 伺服器拒絕重複，手牌與棄牌堆不受影響

  @P1 @negative @usability
  Scenario: 連點出牌只生效一次
    Given 輪到我，手中有合法牌
    When 我對該牌快速連點兩次
    Then 只出一張，棄牌堆不重複疊、手牌只減一
```

### Feature: 抽牌與回合結束

```gherkin
Feature: 抽牌
  作為玩家，無牌可出時可抽牌，抽後依規則處理

  @P1 @functional @positive
  Scenario: 無牌可出時抽牌並立即打出剛抽到的牌 [待定 D2]
    Given 輪到我且手中沒有合法牌
    When 我點選「抽牌」抽到一張合法牌
    And 我選擇立即打出
    Then 出牌成功並換手

  @P1 @functional @positive
  Scenario: 抽牌後選擇 Pass 結束回合 [待定 D2]
    Given 輪到我，我抽了一張後不打出
    When 我選擇「Pass / 結束回合」
    Then 回合換到下一位玩家

  @P1 @negative @security
  Scenario: 一回合內越權多次抽牌
    Given 我已於本回合抽過牌
    When 我未換手就再次嘗試抽牌
    Then 伺服器應拒絕（依規則單回合抽牌次數上限）

  @P1 @negative @usability
  Scenario: 連點抽牌只抽一張
    Given 輪到我且無合法牌
    When 我快速連點「抽牌」兩次
    Then 只抽一張，回合狀態一致
```

### Feature: 萬用牌與選色

```gherkin
Feature: 萬用牌
  作為玩家，打出萬用牌後可指定花色

  @P0 @functional @positive
  Scenario: 打出變色牌並選色
    Given 輪到我，手中有「變色牌 (Wild)」
    When 我打出「變色牌」
    Then 應跳出選色介面
    When 我選擇「綠色」
    Then 當前有效花色變為綠色，換到下一位玩家
    And 下一位玩家看到的「當前有效花色」為綠色

  @P1 @negative
  Scenario: 打出變色牌但未選色不換手
    Given 我打出「變色牌」且選色介面出現
    When 我未選色就嘗試繼續
    Then 系統要求必須先選色，選色前不換手

  @P1 @security @negative
  Scenario Outline: 選色介面注入非法值
    Given 我打出萬用牌，選色請求可被竄改
    When 送出的花色值為 "<value>"
    Then 伺服器應拒絕，不換手

    Examples:
      | value        |
      | (空值)       |
      | 紫色（非四花色） |
      | 紅藍同時     |
      | 任意字串     |

  @P2 @functional @assumption
  Scenario: 變色抽四的出牌限制 [待定 D6]
    Given 規則要求手中無同色牌才能出「+4」，而我仍有同色牌
    When 我嘗試打出「+4」
    Then 系統應依實際規則拒絕或允許
```

### Feature: 功能牌效果

```gherkin
Feature: 功能牌效果
  作為玩家，功能牌應正確改變遊戲流程

  @P1 @functional @positive
  Scenario: 跳過牌 (Skip)（3+ 人局）
    Given 輪到我，下一位是玩家 B（3 人以上）
    When 我打出合法「跳過牌」
    Then 玩家 B 被跳過，換到 B 的下一位

  @P1 @functional @positive
  Scenario: 反轉牌 (Reverse)（3+ 人局）
    Given 目前方向為順時針（3 人以上）
    When 我打出合法「反轉牌」
    Then 方向變為逆時針

  @P1 @functional @positive
  Scenario: 抽二牌 (Draw Two)
    Given 輪到我，下一位是玩家 B
    When 我打出合法「抽二牌」
    Then 玩家 B 抽 2 張並被跳過（除非疊牌規則 D5 允許反制）

  @P1 @functional @positive
  Scenario: 變色抽四 (Wild Draw Four)
    Given 輪到我，下一位是玩家 B
    When 我打出「+4」並選定花色
    Then 玩家 B 抽 4 張並被跳過，當前有效花色為我所選

  @P1 @functional @assumption
  Scenario: 2 人局 Reverse 等同 Skip [待定 D3]
    Given 2 人對局，輪到我
    When 我打出「反轉牌」
    Then 回合應回到我本人（等同跳過對手）或依實際規則

  @P1 @functional @assumption
  Scenario: 2 人局 Skip / +2 後回合回到出牌者 [待定 D3]
    Given 2 人對局，輪到我
    When 我打出「跳過牌」或「抽二牌」
    Then 對手被跳過，回合回到我本人

  @P2 @functional @assumption
  Scenario: +2 / +4 疊牌反制 [待定 D5]
    Given 上家對我出「+2」，疊牌規則允許反制
    When 我打出另一張「+2」
    Then 抽牌責任累加並轉嫁給下一位（依實際規則）
```

### Feature: UNO 宣告

```gherkin
Feature: UNO 宣告與罰則
  作為手牌剩一張的玩家，我需在合法時窗宣告 UNO

  @P1 @functional @positive
  Scenario: 手牌剩一張時於合法時窗宣告 UNO [待定 D7]
    Given 我打出後手牌剩 1 張
    When 我在合法時窗宣告「UNO」
    Then 系統標記我已宣告，我不會受罰

  @P2 @negative @assumption
  Scenario: 未宣告 UNO 被抓到受罰 [待定 D7]
    Given 我手牌剩 1 張但未宣告 UNO
    When 其他玩家在我下次出牌前正確指出
    Then 我應被罰抽牌（依規則張數）

  @P2 @negative @assumption
  Scenario: 誤宣告 UNO（手牌 >1）[待定 D7]
    Given 我手牌多於 1 張
    When 我宣告「UNO」
    Then 系統應判定無效或依規則受罰

  @P2 @negative @assumption
  Scenario: 誣告抓包無效 [待定 D7]
    Given 玩家 B 已正確宣告 UNO（或 B 手牌非 1 張）
    When 我對 B 抓「未宣告」
    Then 抓包無效，B 不受罰（誣告者可能反受罰，依規則）
```

### Feature: 勝負判定與計分

```gherkin
Feature: 勝負判定與計分
  作為玩家，出完手牌者應獲勝並結算

  @P0 @functional @positive
  Scenario: 出完最後一張牌贏得該局
    Given 我手牌剩最後 1 張且合法
    When 我打出最後一張牌
    Then 我的手牌歸零，系統宣告我贏得該局，顯示結算畫面

  @P1 @boundary @negative
  Scenario: 獲勝後不能再操作
    Given 我已出完手牌（0 張）獲勝
    When 我仍嘗試出牌或抽牌
    Then 操作被拒，狀態不變

  @P1 @functional @assumption
  Scenario: 多局計分與最終勝者 [待定 D1]
    Given 採計分制，目標分數為 N
    When 一局結束，勝者累計他人手牌點數
    And 累計分數達到 N
    Then 系統宣告最終贏家並結束賽局

  @P1 @functional
  Scenario: 局後再來一局或返回大廳
    Given 一局已結束並顯示結算
    When 我選擇「再來一局」
    Then 應重置牌局並重新發牌
    When 我改選「返回大廳」
    Then 我應回到大廳或房間清單

  @P2 @exception @boundary
  Scenario: 再來一局時人數不足 [待定 D9]
    Given 一局結束後有玩家已離開，剩餘人數跌破最低開局人數
    When 有人嘗試「再來一局」
    Then 系統應阻止並提示人數不足
```

### Feature: 即時同步、亂序與冪等

```gherkin
Feature: 即時同步
  作為多人對局中的玩家，所有人看到的狀態應即時一致

  @P1 @concurrency @functional
  Scenario: 出牌即時同步給所有玩家
    Given 房內玩家 A、B、C 正在對局
    When 玩家 A 打出一張牌
    Then B 與 C 即時看到棄牌堆更新、A 手牌數減少、回合換到下一位

  @P1 @concurrency @assumption
  Scenario: 亂序狀態更新以序號收斂 [待定 D13]
    Given client 收到亂序的狀態更新訊息
    When 訊息帶有版本號或序號
    Then client 應以序號收斂到正確且與伺服器一致的狀態

  @P1 @concurrency @security @assumption
  Scenario: 重送出牌請求具冪等性 [待定 D13]
    Given 我送出一次出牌後網路重送同一請求
    Then 該牌只被打出一次，手牌只減一

  @P2 @concurrency @assumption
  Scenario: 封包遺失後狀態自我修復 [待定 D13]
    Given 一則狀態更新封包遺失
    Then client 應能透過後續同步或重新拉取修復到一致狀態
```

### Feature: 競態仲裁

```gherkin
Feature: 競態仲裁
  作為系統，近同時的操作須被一致仲裁

  @P1 @concurrency @boundary
  Scenario Outline: 近同時操作的仲裁
    Given 對局中出現接近同時的操作 "<race>"
    When 伺服器收到競態請求
    Then 僅一名玩家的操作生效，另一方收到明確失敗/重試
    And 最終狀態對所有玩家一致且合法，手牌總數與棄牌堆守恆

    Examples:
      | race |
      | 兩玩家同時出最後一張牌爭勝 |
      | 方向反轉瞬間雙方同時出牌   |
      | 兩玩家同時抽最後一張牌     |
```

### Feature: 斷線、重連與復原

```gherkin
Feature: 斷線與復原
  作為玩家，斷線後應能一致地重連

  @P1 @exception @concurrency @assumption
  Scenario: 斷線重連後狀態一致還原 [假設]
    Given 我正在一場對局中
    When 我重新整理頁面或短暫斷線後重連
    Then 我回到同一場對局
    And 我的手牌、頂牌、當前有效花色、方向、各家張數、當前回合與其他玩家逐欄位一致
    And 重連期間我的手牌未外洩

  @P2 @exception @assumption
  Scenario: 輪到我時斷線的處理 [假設]
    Given 輪到我出牌時我斷線
    When 我在計時內重連
    Then 仍是我的回合且計時延續（依規則）

  @P2 @exception @assumption
  Scenario: 連續逾時升級處理 [假設]
    Given 某玩家連續多回合逾時未操作
    Then 系統應自動抽牌換手，並在達門檻後轉 AI 或踢出（依規則）

  @P1 @exception @assumption
  Scenario: 對局中房主斷線
    Given 對局進行中房主斷線
    Then 房主轉移 / AI 接管 / 房間關閉之一發生，其他玩家收到通知，回合不錯亂

  @P2 @exception @assumption
  Scenario: 房間中途被解散
    Given 對局中房間被伺服器關閉
    Then 所有玩家被導回大廳並看到原因提示；解散後殘留連結再次進入應失敗

  @P2 @exception @assumption
  Scenario Outline: 網路錯誤下的操作安全
    Given 我送出關鍵操作 "<op>"
    When 遇到 "<fault>"
    Then 前端不重複扣牌，顯示可理解訊息並可安全重試

    Examples:
      | op   | fault |
      | 出牌 | 請求逾時未回應 |
      | 出牌 | 伺服器 5xx 錯誤 |
      | 抽牌 | WebSocket 中斷 |
```

### Feature: 牌堆與邊界

```gherkin
Feature: 邊界情境
  作為測試者，我要驗證極端情況下系統仍正確

  @P2 @boundary @assumption
  Scenario: 牌堆抽盡時重洗棄牌堆
    Given 抽牌堆已無牌，棄牌堆有多張
    When 有玩家需要抽牌
    Then 系統將棄牌堆（保留頂牌）洗回抽牌堆，抽牌得以繼續
    And 重洗後總牌數守恆、頂牌未被洗入、洗牌具隨機性

  @P2 @boundary @assumption
  Scenario: 可洗回牌不足需抽張數 [待定 D8]
    Given 玩家需抽 4 張，但抽牌堆＋可洗回牌僅剩 2 張
    When 執行抽牌
    Then 系統依實際規則處理，牌數守恆不出現負值或憑空生牌
```

### Feature: 安全性與公平性

```gherkin
Feature: 安全與公平
  作為系統，我必須防止玩家作弊或越權

  @P0 @security @negative
  Scenario: 手牌傳輸層機密性（防看牌外掛）
    Given 我在一場對局中，攔截我的 client 收到的所有訊息（WebSocket/HTTP payload 與 DOM）
    Then 這些資料不應包含任何其他玩家的手牌牌面
    And 對手手牌僅以張數呈現

  @P1 @security @negative @assumption
  Scenario: 假冒他人 playerId 操作
    Given 存在後端權威驗證 [待定 D13]
    When 我竄改請求以他人 playerId 出牌或抽牌
    Then 伺服器拒絕，全局狀態不變

  @P1 @security @assumption
  Scenario: 洗牌隨機性不可預測
    Given 我可觀察多局的起始牌與可見牌序
    Then 牌序不應呈可預測規律，且不可由已知棄牌/重洗推導後續順序

  @P2 @security @negative
  Scenario Outline: 多輸入點 XSS/注入
    Given 輸入點 "<input>"
    When 我送入 payload "<payload>"
    Then 輸出應安全跳脫，不執行腳本、不破壞頁面

    Examples:
      | input   | payload |
      | 暱稱    | <script>alert(1)</script> |
      | 聊天訊息 | <img src=x onerror=alert(1)> |
      | 房間名稱 | "><svg onload=alert(1)> |

  @P2 @security @assumption
  Scenario: 高頻操作限流 [假設]
    Given 我以單一 client 高頻送出出牌/抽牌/建房請求
    Then 系統應限流阻擋，不致資源耗盡
```

### Feature: 非功能 — 效能與負載

```gherkin
Feature: 效能與負載
  作為使用者，系統在正常與高負載下都應可用

  @P2 @performance @assumption
  Scenario: 出牌同步延遲門檻 [待定 D14]
    Given 正常網路條件、一個滿員房間
    When 玩家出牌
    Then 其他玩家看到更新的 P95 延遲應低於門檻（如 1s）

  @P2 @performance @assumption
  Scenario: 多房間並發負載 [待定 D14]
    Given 同時有 N 個房間進行對局
    Then 同步延遲與錯誤率應維持在門檻內

  @P2 @performance @assumption
  Scenario: 長對局資源不洩漏 [假設]
    Given 連續進行數十局且長時間掛機
    Then 記憶體、連線與出牌歷史不應無限增長
```

### Feature: 非功能 — 相容性、響應式、無障礙、i18n

```gherkin
Feature: 相容性與無障礙
  作為不同裝置與能力的使用者，我都應能正常遊玩

  @P2 @compatibility
  Scenario Outline: 主流桌面瀏覽器相容
    Given 我使用瀏覽器 "<browser>"
    When 我進行建立房間到開始遊戲的主流程
    Then 流程應可正常完成

    Examples:
      | browser |
      | Chrome  |
      | Firefox |
      | Safari  |
      | Edge    |

  @P2 @compatibility @assumption
  Scenario Outline: 行動裝置響應式
    Given 我使用螢幕尺寸 "<size>"
    Then 手牌不溢出、可觸控出牌、直橫向切換皆可用

    Examples:
      | size |
      | 手機直向 |
      | 手機橫向 |
      | 平板   |

  @P2 @accessibility @assumption
  Scenario: 純鍵盤完成主流程
    Given 我只用鍵盤操作
    When 我完成建房到出牌流程
    Then Tab 焦點順序合理、Enter 可出牌、Esc 可關選色

  @P2 @accessibility @assumption
  Scenario: 色弱友善
    Given 我是色弱使用者
    Then 卡牌花色以符號/文字輔助、當前有效花色與可出牌高亮不僅靠顏色
    And 文字對比度達 WCAG AA

  @P2 @accessibility @assumption
  Scenario: 螢幕閱讀器可用
    Given 我使用螢幕閱讀器
    Then 關鍵狀態變化（輪到你、對手出了什麼牌）以 ARIA live region 播報，控制項有 ARIA 標註

  @P2 @i18n @assumption
  Scenario: 多語系與長字串 [假設]
    Given 介面切換不同語言
    Then 文字正確在地化且長字串不破版
```

### Feature: 可用性與可觀測性

```gherkin
Feature: 可用性與可測試性
  作為使用者與測試者，介面應清楚且可觀測

  @P2 @usability
  Scenario: 清楚指示輪到誰與可出的牌
    Given 我在對局中
    When 輪到我出牌
    Then 介面明確標示「輪到你」，可出的牌有可視提示

  @P2 @usability
  Scenario: 錯誤訊息具體且可讀
    Given 我做了一個非法操作
    Then 錯誤訊息應具體指出原因（而非僅「不可出」）且可在地化

  @P2 @usability
  Scenario: 載入狀態與防重複提交
    Given 我觸發加入房間/開始/出牌等請求
    When 請求進行中
    Then 應顯示載入指示並禁用按鈕避免重複提交

  @P2 @observability @assumption
  Scenario: 可測試性 hooks [待定 D15]
    Given 測試需要穩定選取與可重現牌局
    Then 產品宜提供 test id、種子化測試模式（固定牌堆）、狀態查詢端點與關鍵事件日誌
```

### Feature: 聊天與出牌歷史（若支援）

```gherkin
Feature: 聊天與歷史
  作為玩家，我可使用房內聊天並查看出牌歷史 [假設 D12]

  @P2 @functional @assumption
  Scenario: 房內聊天發送與同步
    Given 我在房間內
    When 我發送一則聊天訊息
    Then 房內其他玩家即時收到該訊息，內容經安全跳脫

  @P2 @functional @assumption
  Scenario: 出牌歷史顯示
    Given 對局進行中
    Then 我可查看依序記錄的出牌歷史
```

---

## 3. 測試資料需求
- 多個測試暱稱/身分（多分頁模擬多人）。
- **[待定 D15]** 種子化測試模式或狀態端點，以重現特定牌局（規則類測項可重複、可自動化的關鍵前置）。
- 多瀏覽器、多視窗尺寸。
- **[假設]** L2 協定層測試 client（直接打 WebSocket/HTTP）以驗安全/併發。

## 4. 需求—測項追溯（重點）
| 需求 | 對應 Feature/Scenario |
|---|---|
| FR-2.4 密碼房 | 私人房/密碼房越權、房號強度 |
| FR-3.5 抽牌後 | 抽牌與回合結束 |
| FR-4.1 亂序/冪等 | 即時同步、亂序、冪等 |
| FR-4.2 重連 | 斷線重連一致還原 |
| FR-6 觀戰 | （待 D10 定案後補觀戰安全測項） |
| NFR-6 安全 | 手牌傳輸機密性、假冒 playerId、竄改 |
| NFR-7 公平 | 洗牌隨機性 |
| NFR-9 無障礙 | 鍵盤、色弱、螢幕閱讀器 |
| NFR-11 可測試性 | 可測試性 hooks |

## 5. 風險與待確認
- §8 待定產品決策（D1–D15）未定案前，相關斷言以參數化預期值建骨架，Phase 3 對照後寫死。
- 無種子化測試模式將使規則類測項不可重現 → 優先向產品爭取 D15。
- 即時同步/競態測項天生 flaky → 優先於 L2 以受控時序驗證，UI 競態少量保留並標記。
- 非功能量化門檻（D14）未定 → 非功能測項暫無客觀 pass/fail，先建可執行骨架。
