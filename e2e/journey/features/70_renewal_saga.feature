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
    And "U1" 因 "K0" 的補繳獲得續約獎勵合計 200P——失效上線照收【DB】
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

  @journey @renewal_saga
  Scenario: 第 5 章 B 樹下線——W2 掛 K0,X1 讓改樹後的三代鏈走到 U2
    When saga 演員 "W2" 以 "K0" 的推薦碼完成首購
    Then "K0" 因 "W2" 的首購獲得第 1 代獎勵【DB】
    And "K0" 的任務卡顯示進度 1/8
    And "U2" 因 "W2" 的首購獲得第 2 代獎勵【DB】
    When saga 演員 "X1" 以 "W2" 的推薦碼完成首購
    Then "W2" 因 "X1" 的首購獲得第 1 代獎勵【DB】
    And "K0" 因 "X1" 的首購獲得第 2 代獎勵【DB】
    And "U2" 因 "X1" 的首購獲得第 3 代獎勵【DB】

  @journey @renewal_saga
  Scenario: 第 6 章 Q9 防線——待審提領擋 fresh,駁回退點後解封
    Given saga 種給 "K0" 1000P 種子點數
    When "K0" 完成身分驗證並申請提領 1000P
    And saga 將 "K0" 推入剛過期
    Then "K0" 的付款頁新約選項因待審提領被停用
    When 管理員在管理台駁回第一筆提領
    Then "K0" 的付款頁新約選項恢復可選

  @journey @renewal_saga
  Scenario: 第 7 章 S9 與 Q14a——填現任上代碼照樣清空,歷史桶跨清空保留
    Given saga 將 "K0" 的任務月桶平移至上月
    When "K0" 開付款頁選新約、填 "U2" 的碼、經 A14 揭露與 A15 二次確認完成付款
    Then "K0" 的上代已改為 "U2"【DB】
    And "K0" 的可提領點數已歸零【DB】
    When saga 快照收獎基準並將 "W2" 推入剛過期
    And "W2" 以續約完成一筆補繳
    Then "K0" 因 "W2" 的續約獎勵增量 100P 且任務不增加【DB】
    And "U2" 因 "W2" 的續約獲得第 2 代獎勵增量 100P【DB】

  @journey @renewal_saga
  Scenario: 第 8 章 credit 與 A8——過期不能領,補繳復活後領取改現有列且雙事件各發獎
    Given saga 依 "K0" 的既有月桶種一張未領取的推薦王 credit
    And saga 將 "K0" 推入剛過期
    Then "K0" 因會籍失效連任務中心也進不了——credit 仍未領取【DB】
    When saga 快照第 8 章收獎基準
    And "K0" 以續約完成一筆補繳
    Then "U2" 因 "K0" 的補繳獲得第 1 代續約獎勵增量 100P【DB】
    When "K0" 於任務中心領取免費續約獎勵
    Then "K0" 的最新到期日因領取再延長約一年且訂閱列數不變【DB】
    And "U2" 因 "K0" 的領取獲得 claim 鍵第 1 代獎勵——兩事件合計增量 200P【DB】
    And "U2" 於第 8 章兩事件後任務進度不增加【DB】

  @journey @renewal_saga
  Scenario: 第 9 章 A10 fresh 版——不填碼的新約掛回預設推薦人,帳本清空
    Given saga 將 "W1" 推入剛過期
    When "W1" 開付款頁選新約且不填推薦碼、經 A15 二次確認完成付款
    Then "W1" 的上代在管理台會員詳情顯示為預設推薦人
    And "W1" 的預設推薦標記已寫入【DB】
    And "W1" 的可提領點數已歸零【DB】
    And 預設推薦人本次事件的點數增量為 100P【DB】

  @journey @renewal_saga
  Scenario: 第 10 章 終章對帳——分類軸、免費續約註記與推導餘額
    # 推導(帳本):K0 = ch2 +100(W1)→ ch4 歸零 → ch5 +200(W2/X1)→
    # ch6 +1000 −1015 +1015 → ch7 歸零後 +100(W2 補繳)→ ch8/ch9 不變
    # = 100P;任務 0/8(ch7 月桶平移後當月無配對)。U2 = ch4 +100 +
    # ch5 +200 + ch7 +200 + ch8 +200 = 700P(從未清空,持續 active)。
    Then "K0" 的獎勵明細分類軸含推薦新人、子代續約與新約重置
    And "K0" 的獎勵頁可提領餘額顯示 100P
    And "K0" 的任務卡顯示進度 0/8
    And "U2" 的獎勵明細出現「任務免費續約」註記
    And "U2" 的獎勵頁可提領餘額顯示 700P
