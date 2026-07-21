Feature: 刊登 — 建立、公開可見、一帳號一刊登、下架
  A0（訂閱中）建立刊登後，訪客在公開首頁搜得到；一個付款帳號僅能有
  一筆刊登；下架後首頁即時消失。編輯流程屬後續里程碑。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成

  @journey @listing
  Scenario: A0 透過 GUI 建立刊登
    When "A0" 登入並建立自己的刊登
    Then 刊登管理頁顯示該刊登

  @journey @listing
  Scenario: 訪客可在公開首頁搜尋到 A0 的刊登並開啟詳情
    When 訪客在首頁搜尋 "A0" 的刊登名稱
    Then 搜尋結果出現該刊登卡片
    And 點開後詳情頁顯示刊登名稱

  @journey @listing @negative
  Scenario: 一個帳號僅能有一筆刊登
    When "A0" 登入並開啟刊登管理頁
    Then 刊登管理頁沒有「刊登新服務」入口

  @journey @listing
  Scenario: 下架後訪客在首頁找不到刊登
    When "A0" 登入並刪除自己的刊登
    And 訪客在首頁搜尋 "A0" 的刊登名稱
    Then 首頁顯示查無結果
