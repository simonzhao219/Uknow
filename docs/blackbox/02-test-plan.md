# Uknow 黑箱測試計畫

> **依據**：`01-spec.md`（黑箱規格書 v1）
> **版本**：v1（Phase 1 初稿，尚未經 review agent 整合）
> **測項格式**：Gherkin（Feature / Scenario / Given-When-Then）
> **標註**：**[假設]** 表示基於黑箱推定、待 Phase 3 對照真實系統確認的測項。

---

## 1. 測試策略

### 1.1 測試範圍
| 面向 | 說明 |
|---|---|
| 功能測試 (Functional) | 房間管理、遊戲流程、出牌規則、勝負判定 |
| 正向測試 (Positive) | 合法操作應成功 |
| 負向測試 (Negative) | 非法/越權/邊界操作應被正確拒絕 |
| 邊界值測試 (Boundary) | 人數上下限、手牌 1 張、牌堆抽盡 |
| 例外/錯誤處理 (Exception) | 查無房間、房間已滿、斷線 |
| 併發/多人 (Concurrency) | 即時同步、競態、回合仲裁 |
| 非功能 (Non-functional) | 效能、相容性、安全性、無障礙、可用性 |
| UI/UX | 狀態指示、可視回饋、錯誤訊息 |

### 1.2 測試層級
- **L1 UI/E2E**：以瀏覽器自動化模擬真實使用者操作（Phase 3 自動化主力）。
- **L2 API/協定**：**[假設]** 若有後端，驗證伺服器端規則與越權防護。
- **L3 探索性測試**：人工黑箱探索，補充自動化未覆蓋處。

### 1.3 優先級定義
- **P0**：核心不可用即阻斷（開局、出牌、勝負）。
- **P1**：主要功能（房間管理、功能牌、同步）。
- **P2**：輔助/邊界/非功能（聊天、無障礙、效能細節）。

### 1.4 進入 / 退出準則
- **進入**：規格書定稿、測試環境可存取、測試資料就緒。
- **退出**：P0/P1 測項全數執行且通過率達標、無阻斷缺陷未解。

---

## 2. Gherkin 測項

### Feature: 進入遊戲與暱稱設定

```gherkin
Feature: 進入遊戲與身分設定
  作為一位玩家
  我想要設定暱稱進入遊戲
  以便在對局中被其他玩家識別

  @P0 @functional @positive
  Scenario: 以合法暱稱進入遊戲
    Given 我開啟 Uknow 首頁
    When 我輸入暱稱 "Alice"
    And 我確認進入
    Then 我應該進入大廳或房間建立畫面
    And 我的暱稱應顯示為 "Alice"

  @P1 @negative
  Scenario: 空白暱稱不可進入
    Given 我開啟 Uknow 首頁
    When 我未輸入暱稱就確認進入
    Then 系統應阻止進入
    And 顯示暱稱必填的提示

  @P2 @boundary @negative
  Scenario Outline: 暱稱長度與字元邊界
    Given 我開啟 Uknow 首頁
    When 我輸入暱稱 "<nickname>"
    And 我確認進入
    Then 系統回應應為 "<result>"

    Examples:
      | nickname                        | result |
      | A                               | 允許或依規則拒絕 |
      | 這是一個超過長度上限的很長很長暱稱XXXX | 拒絕並提示過長 |
      | <script>alert(1)</script>        | 應被安全處理不執行腳本 |
```

### Feature: 建立與加入房間

```gherkin
Feature: 房間管理
  作為房主或玩家
  我想要建立或加入房間
  以便與其他玩家一起遊戲

  @P0 @functional @positive
  Scenario: 成功建立房間
    Given 我已進入遊戲並設定暱稱
    When 我點選「建立房間」
    Then 應建立一個新房間
    And 我成為房主
    And 我能取得可分享的房號或邀請連結

  @P0 @functional @positive
  Scenario: 以房號加入既有房間
    Given 存在一個未滿且未開始的房間，房號為 "R123"
    And 我已進入遊戲並設定暱稱
    When 我輸入房號 "R123" 並加入
    Then 我應成功進入該房間的等待區
    And 房內其他玩家能看到我加入

  @P1 @negative @exception
  Scenario: 加入不存在的房號
    Given 我已進入遊戲
    When 我輸入一個不存在的房號 "ZZZZ" 並加入
    Then 系統應提示查無此房間
    And 我停留在原畫面

  @P1 @negative @boundary
  Scenario: 加入已滿的房間
    Given 存在一個已達人數上限的房間 "FULL1"
    When 我嘗試加入房間 "FULL1"
    Then 系統應拒絕加入
    And 提示房間已滿

  @P1 @functional
  Scenario: 玩家離開房間
    Given 我在一個等待中的房間內
    When 我點選「離開房間」
    Then 我應返回大廳或首頁
    And 房內其他玩家看到我已離開

  @P2 @functional @assumption
  Scenario: 房主離開房間的處理 [假設]
    Given 我是房間房主，房內尚有其他玩家
    When 我離開房間
    Then 房主權限應轉移給其他玩家或房間關閉
    And 其他玩家收到對應通知
```

### Feature: 開始遊戲與發牌

```gherkin
Feature: 開始遊戲
  作為房主
  我想要在人數足夠時開始遊戲
  以便進入對局

  @P0 @functional @positive
  Scenario: 人數足夠時開始遊戲
    Given 我是房主，房內有足夠開局的玩家人數
    When 我點選「開始遊戲」
    Then 遊戲應開始
    And 每位玩家獲得初始手牌
    And 棄牌堆翻開一張起始牌
    And 顯示輪到哪位玩家

  @P1 @negative @boundary
  Scenario: 人數不足無法開始
    Given 我是房主，房內人數少於最低開局人數
    When 我嘗試點選「開始遊戲」
    Then 系統應阻止開始
    And 提示人數不足

  @P1 @negative @security
  Scenario: 非房主不能開始遊戲
    Given 我是房內的非房主玩家
    Then 我不應看到可用的「開始遊戲」按鈕
    Or 若嘗試觸發開始，伺服器應拒絕
```

### Feature: 出牌與規則驗證

```gherkin
Feature: 出牌合法性
  作為輪到出牌的玩家
  我只能打出符合規則的牌
  以維持遊戲規則正確

  @P0 @functional @positive
  Scenario: 打出同花色的牌
    Given 棄牌堆頂牌是「紅色 5」
    And 輪到我出牌
    And 我手中有「紅色 8」
    When 我打出「紅色 8」
    Then 出牌成功
    And 棄牌堆頂牌變為「紅色 8」
    And 換到下一位玩家

  @P0 @functional @positive
  Scenario: 打出同數字的牌
    Given 棄牌堆頂牌是「紅色 5」
    And 輪到我出牌
    And 我手中有「藍色 5」
    When 我打出「藍色 5」
    Then 出牌成功
    And 當前花色變為藍色

  @P0 @negative
  Scenario: 打出不合法的牌
    Given 棄牌堆頂牌是「紅色 5」
    And 輪到我出牌
    And 我手中有「藍色 8」且無其他線索使其合法
    When 我嘗試打出「藍色 8」
    Then 出牌應被拒絕
    And 顯示此牌不可出的提示
    And 仍輪到我出牌

  @P1 @negative @security
  Scenario: 非自己回合不能出牌
    Given 現在不是我的回合
    When 我嘗試打出手中任一張牌
    Then 出牌應被拒絕
    And 遊戲狀態不變

  @P1 @functional @positive
  Scenario: 無牌可出時抽牌
    Given 輪到我出牌
    And 我手中沒有任何合法的牌
    When 我點選「抽牌」
    Then 我的手牌增加一張
    And 依規則換手或允許我續出抽到的牌
```

### Feature: 萬用牌與選色

```gherkin
Feature: 萬用牌
  作為玩家
  我打出萬用牌後可以指定花色
  以控制接下來的出牌條件

  @P0 @functional @positive
  Scenario: 打出變色牌並選色
    Given 輪到我出牌
    And 我手中有「變色牌 (Wild)」
    When 我打出「變色牌」
    Then 應跳出選色介面
    When 我選擇「綠色」
    Then 當前花色變為綠色
    And 換到下一位玩家

  @P1 @negative
  Scenario: 打出變色牌但未選色
    Given 我打出「變色牌」且選色介面出現
    When 我未選色就嘗試繼續
    Then 系統應要求我必須先選色
    And 在選色前不換手

  @P2 @functional @assumption
  Scenario: 變色抽四的出牌限制 [假設]
    Given 遊戲規則要求手中無同色牌才能出「變色抽四 (+4)」
    And 我手中仍有與頂牌同色的牌
    When 我嘗試打出「變色抽四」
    Then 系統應拒絕或依實際規則處理
```

### Feature: 功能牌效果

```gherkin
Feature: 功能牌效果
  作為玩家
  功能牌應正確改變遊戲流程
  以符合 UNO 規則

  @P1 @functional @positive
  Scenario: 跳過牌 (Skip)
    Given 輪到我出牌，下一位是玩家 B
    When 我打出與頂牌相符的「跳過牌」
    Then 玩家 B 應被跳過
    And 換到玩家 B 的下一位

  @P1 @functional @positive
  Scenario: 反轉牌 (Reverse)
    Given 目前出牌方向為順時針
    When 我打出合法的「反轉牌」
    Then 出牌方向應變為逆時針

  @P1 @functional @positive
  Scenario: 抽二牌 (Draw Two)
    Given 輪到我出牌，下一位是玩家 B
    When 我打出合法的「抽二牌」
    Then 玩家 B 應抽 2 張牌
    And 玩家 B 被跳過

  @P1 @functional @positive
  Scenario: 變色抽四 (Wild Draw Four)
    Given 輪到我出牌，下一位是玩家 B
    When 我打出「變色抽四」並選定花色
    Then 玩家 B 應抽 4 張牌
    And 玩家 B 被跳過
    And 當前花色為我所選
```

### Feature: UNO 宣告

```gherkin
Feature: UNO 宣告與罰則
  作為手牌剩一張的玩家
  我需要宣告 UNO
  否則可能受罰

  @P1 @functional @positive
  Scenario: 手牌剩一張時宣告 UNO
    Given 我打出後手牌剩下 1 張
    When 我宣告「UNO」
    Then 系統標記我已宣告 UNO
    And 我不會因此受罰

  @P2 @negative @assumption
  Scenario: 未宣告 UNO 被抓到受罰 [假設]
    Given 我手牌剩 1 張但未宣告 UNO
    When 其他玩家在我下次出牌前指出我未宣告
    Then 我應被罰抽牌（依實際規則張數）
```

### Feature: 勝負判定與結算

```gherkin
Feature: 勝負判定
  作為玩家
  出完手牌者應獲勝並結算
  讓對局有明確結束

  @P0 @functional @positive
  Scenario: 出完最後一張牌獲勝
    Given 我手牌剩最後 1 張且合法
    When 我打出最後一張牌
    Then 我的手牌歸零
    And 系統宣告我獲勝
    And 顯示結算畫面

  @P1 @functional
  Scenario: 局後可再來一局或返回大廳
    Given 一局已結束並顯示結算
    When 我選擇「再來一局」
    Then 應重置牌局並重新發牌
    When 我選擇「返回大廳」
    Then 我應回到大廳或房間清單
```

### Feature: 即時同步與斷線重連

```gherkin
Feature: 即時同步
  作為多人對局中的玩家
  所有人看到的狀態應即時一致
  以確保公平與流暢

  @P1 @concurrency @functional
  Scenario: 出牌即時同步給所有玩家
    Given 房內有玩家 A、B、C 正在對局
    When 玩家 A 打出一張牌
    Then 玩家 B 與 C 應即時看到棄牌堆更新
    And 看到玩家 A 手牌數減少
    And 看到回合換到下一位

  @P1 @exception @concurrency @assumption
  Scenario: 斷線後重連回到對局 [假設]
    Given 我正在一場對局中
    When 我重新整理頁面或短暫斷線後重連
    Then 我應回到同一場對局
    And 我的手牌與遊戲狀態應正確還原

  @P2 @exception @assumption
  Scenario: 玩家超時處理 [假設]
    Given 輪到某玩家但長時間未操作
    When 超過允許的思考時間
    Then 系統應自動為其抽牌換手或依規則處理
```

### Feature: 邊界與牌堆耗盡

```gherkin
Feature: 邊界情境
  作為測試者
  我要驗證極端情況下系統仍正確

  @P2 @boundary @assumption
  Scenario: 牌堆抽盡時重洗棄牌堆 [假設]
    Given 抽牌堆已無牌可抽
    And 棄牌堆有多張牌
    When 有玩家需要抽牌
    Then 系統應將棄牌堆（保留頂牌）洗回抽牌堆
    And 抽牌得以繼續

  @P1 @boundary @concurrency
  Scenario: 兩名玩家幾乎同時完成最後操作的仲裁
    Given 遊戲進行中出現接近同時的操作
    When 伺服器收到競態請求
    Then 應以一致的順序仲裁
    And 最終狀態對所有玩家一致且合法
```

### Feature: 安全性與越權防護

```gherkin
Feature: 安全性
  作為系統
  我必須防止玩家越權或作弊
  以維持遊戲公平

  @P0 @security @negative
  Scenario: 玩家看不到他人手牌
    Given 我在一場對局中
    Then 我只能看到自己的手牌內容
    And 對手手牌僅顯示張數，不顯示牌面

  @P1 @security @negative
  Scenario: 竄改請求出非法牌應被伺服器拒絕 [假設]
    Given 存在後端伺服器驗證
    When 前端被竄改而送出一個非法或非本回合的出牌請求
    Then 伺服器應拒絕該請求
    And 遊戲狀態不受影響
```

### Feature: 非功能 — 相容性、可用性、無障礙

```gherkin
Feature: 非功能需求
  作為不同裝置與能力的使用者
  我都應能正常遊玩

  @P2 @compatibility
  Scenario Outline: 主流瀏覽器相容
    Given 我使用瀏覽器 "<browser>"
    When 我進行建立房間到開始遊戲的主流程
    Then 流程應可正常完成

    Examples:
      | browser |
      | Chrome  |
      | Firefox |
      | Safari  |
      | Edge    |

  @P2 @usability
  Scenario: 清楚指示輪到誰與可出的牌
    Given 我在對局中
    When 輪到我出牌
    Then 介面應明確標示「輪到你」
    And 可出的牌應有可視提示（如高亮）

  @P2 @accessibility @assumption
  Scenario: 色弱友善 [假設]
    Given 我是色弱使用者
    Then 卡牌花色應不僅以顏色區分（有符號或文字輔助）
```

---

## 3. 測試資料需求
- 多個測試帳號/暱稱。
- 可控的牌局狀態（**[假設]** 若無法控制發牌，需以多次隨機對局或後門測試模式覆蓋規則）。
- 多瀏覽器 / 多分頁以模擬多人。

## 4. 風險與待確認事項
- 黑箱推定與真實規則落差（Phase 3 對照修正）。
- 無法直接操控隨機發牌，將影響規則類測項的可自動化性 → 需探討是否有測試模式或以多分頁多人 E2E 覆蓋。
- 即時同步/併發測項的自動化穩定度（flaky risk）。
