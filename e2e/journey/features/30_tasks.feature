Feature: 任務系統 — 推薦王
  A0 在同一月份直推 8 人（B1–B8），第 8 人付款當下達標，產生一筆
  「免費續約 1 年」的待領取獎勵；claim 後訂閱到期日延長約一年。
  當月排行榜與連續推薦達人（跨時間）屬 M4。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成

  @journey @tasks
  Scenario: 直推滿 8 人後產生待領取的推薦王獎勵
    Then 資料庫中 "A0" 有一筆未領取的推薦王獎勵

  @journey @tasks
  Scenario: 領取推薦王獎勵後訂閱到期日延長約一年
    Given 記下 "A0" 目前的最晚訂閱到期日
    When "A0" 登入並於任務中心領取免費續約獎勵
    Then "A0" 的最晚訂閱到期日比領取前延長約一年
    And 資料庫中該筆推薦王獎勵狀態為已領取且關聯新訂閱
