Feature: 阿凱的七年 — 續約獎勵任務機制的組合行為劇本
  依 docs/plans/upline-pairing-lines/rules.md M1-M8 重建的十章時間軸,
  人審 2026-08-07 裁決通過(裁決紀錄見 PR #199 的 review.md)。
  cast 獨立於 30 人主樹(orgchart-saga.yaml);各章循序執行、前章狀態
  是後章前提;演員首次登場時才經 GUI 建置。預設推薦人 P0 由本 feature
  自備(分支上不存在正式站的資料層設定)。標【DB】的斷言走 service-role
  直查(無 GUI 落點),其餘皆 GUI;對 P0 的獎勵斷言一律用事件前後
  delta,不斷言絕對值。

  Background:
    Given journey 測試環境已就緒
    And 管理員帳號已完成 bootstrap
    And saga 演員名冊與預設推薦人 P0 已就緒

  @journey @renewal_saga
  Scenario: 第 1 章 首購——不填碼掛預設推薦人,K0 掛 U1,active 不能付款
    When saga 演員 "U1" 不填推薦碼完成首購
    And saga 演員 "U2" 不填推薦碼完成首購
    And saga 演員 "K0" 以 "U1" 的推薦碼完成首購
    Then "U1" 的上代在管理台會員詳情顯示為預設推薦人
    And "U2" 的上代在管理台會員詳情顯示為預設推薦人
    And "U1" 的預設推薦標記已寫入【DB】
    And "K0" 的推薦邊指向 "U1"【DB】
    And "U1" 因 "K0" 的首購獲得第 1 代獎勵【DB】
    And "U1" 的任務卡顯示進度 1/8
    And 預設推薦人本章的點數增量合計 300P【DB】
    And "K0" 於 active 期間開啟付款頁被導回儀表板並顯示訂閱中

  @journey @renewal_saga
  Scenario: 第 2 章 A 樹下線——W1 掛 K0,三代鏈走到預設推薦人
    When saga 演員 "W1" 以 "K0" 的推薦碼完成首購
    Then "K0" 因 "W1" 的首購獲得第 1 代獎勵【DB】
    And "K0" 的任務卡顯示進度 1/8
    And "U1" 因 "W1" 的首購獲得第 2 代獎勵【DB】
    And 預設推薦人本次事件的點數增量為 100P【DB】

  @journey @renewal_saga
  Scenario: 第 3 章 補繳 extend——接續原效期、每筆各發獎、失效上線照收
    Given saga 將 "U1" 推入剛過期
    And saga 將 "K0" 推入過期超過一年並記下接續錨點
    When "K0" 開付款頁並以續約逐筆補繳 2 筆
    Then "K0" 的最新到期日接續原錨點約兩年【DB】
    And "K0" 的上代仍為 "U1"【DB】
    And "U1" 因 "K0" 的補繳獲得續約獎勵合計 200P——即使 "U1" 此刻已失效【DB】
    And "U1" 因 "K0" 的補繳任務進度不增加【DB】

  @journey @renewal_saga
  Scenario: 第 4 章 fresh 換樹清空——A14 揭露、A15 二次確認、U2 首次配對
    Given saga 將 "K0" 推入剛過期
    When "K0" 開付款頁選新約、填 "U2" 的碼、經 A14 揭露與 A15 二次確認完成付款
    Then "K0" 的上代已改為 "U2"【DB】
    And "K0" 的可提領點數已歸零【DB】
    And "K0" 的獎勵明細出現「新約重置」列
    And "U2" 因 "K0" 的新約獲得第 1 代獎勵【DB】
    And "U2" 的任務卡顯示進度 1/8
