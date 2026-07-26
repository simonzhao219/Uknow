Feature: develop 環境示範資料
  把 orgchart-develop-seed.yaml 宣告的 45 人樹建進 develop 分支 DB，
  **並且留著**——這不是測試，是給人登入來看的種子資料。

  與 10_org_build 的差別只有樹形與生命週期，走的是同一條 GUI 路徑
  （註冊三步 + sandbox 付款 + 逐代推進）。預設被 pytest.ini 的
  `-m "not seed"` 排除，只有明確 `-m seed` 才會跑。

  @seed
  Scenario: 以示範資料樹建置 develop 環境
    Given journey 測試環境已就緒
    And 已確認這是刻意的種資料執行
    When 依示範資料樹逐代以 GUI 建置組織樹
    Then 示範資料樹的每個節點都擁有 active 推薦碼
    And 示範資料樹的推薦邊都指向宣告的上線
