Feature: 六代 30 人組織樹建置
  M2 的主體：root（骨架已建）之下六代共 30 人，全數透過 Web GUI 完成
  註冊三步與 sandbox 付款，逐代推進（上線先訂閱、推薦碼才有效）。
  更多註冊負向邊界（未滿 18、重複身分證、失效推薦碼）屬 M3。

  @journey @orgbuild
  Scenario: 全數 30 人走 GUI 完成註冊與付款
    Given journey 測試環境已就緒
    And 管理員帳號已完成 bootstrap
    When 依 orgchart 逐代以 GUI 建置組織樹
    Then 30 個節點全數擁有 active 推薦碼
    And 每個節點的推薦邊都指向 orgchart 宣告的上線

  @journey @orgbuild @negative
  Scenario: 已註冊的 email 走註冊入口會切換為登入表單
    Given journey 測試環境已就緒
    And 節點 "A0" 已完成建置
    When 訪客在註冊入口輸入 "A0" 的 email
    Then 畫面切換為登入表單
