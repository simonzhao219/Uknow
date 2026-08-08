Feature: 刊登 RLS — 直打 PostgREST 的授權邊界
  前端直連 PostgREST 讀寫 listings(CreateServiceProvider /
  EditServiceProvider / ServiceProviderManagement),Edge Function 的
  service_role 繞過 RLS 碰不到這條路,而 anon key 隨 bundle 公開出貨——
  RLS 是這條路徑上唯一的授權機制。本 feature 以真實 anon / authenticated
  身分直打 PostgREST,驗證那五條 policy 真的允許與拒絕。

  結構層(policy 集合、角色、條件表達式)由 api/rls-policies.test.ts 每個
  PR 釘住;這裡驗的是**行為**——本地缺 hosted 的 table GRANT,直連在 RLS
  被評估之前就吃 42501,只有 hosted 分支測得到。

  兩種拒絕形狀不同,不可混為一談:
  - 違反 WITH CHECK(INSERT/UPDATE)→ 4xx + code 42501
  - 被 USING 過濾(SELECT/UPDATE/DELETE)→ **不是錯誤**,200/204 + 0 列

  4xx 不寫死成 403:authenticated 收到 403、anon 收到 401,同一句
  RLS 訊息、不同狀態碼。判讀以 message 為準,見 tools/rls_probe.py。

  節點:B5 有效擁有者、B6 攻擊者、B7 失效擁有者、B8 無刊登(偽造目標)。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成
    And 管理員帳號已完成 bootstrap
    And RLS 測試資料已就緒

  # ── 讀取邊界 ────────────────────────────────────────────────
  # 有效會員的刊登任何人都讀得到(§11 公開瀏覽),所以「B 讀不到 A」刻意
  # 不斷言——邊界在失效會員身上。

  @journey @listing @rls
  Scenario: 失效會員仍讀得到自己的刊登
    When "B7" 以自己的身分直讀 listings
    Then 直讀結果包含 "B7" 的刊登

  @journey @listing @rls
  Scenario: 訪客直讀 listings 看得到有效會員的刊登
    When 訪客直讀 listings
    Then 直讀結果包含 "B5" 的刊登

  @journey @listing @rls
  Scenario: 訪客直讀 listings 看不到失效會員的刊登
    When 訪客直讀 listings
    Then 直讀結果不包含 "B7" 的刊登

  @journey @listing @rls
  Scenario: 其他會員直讀看不到失效會員的刊登
    When "B6" 以自己的身分直讀 listings
    Then 直讀結果不包含 "B7" 的刊登

  # characterization:規格書 §13 的管理後台沒有「刊登管理」模組,這條驗的是
  # policy 明文宣告的 or is_admin() 授權語意,不是規格明文需求(見 plan §7)。
  @journey @listing @rls
  Scenario: 管理員直讀看得到失效會員的刊登
    When 管理員以自己的身分直讀 listings
    Then 直讀結果包含 "B7" 的刊登

  # ── 寫入邊界 ────────────────────────────────────────────────

  # 正面路徑。它同時是下面「影響零列」那兩條的另一半:0 列在「policy 正確」
  # 與「policy 整條被刪」兩種情況下長得一樣,兩條合看才分得出來。
  @journey @listing @rls
  Scenario: 擁有者更新自己的刊登會成功
    When "B5" 把自己刊登的服務介紹改成 "RLS 正面路徑"
    Then 該次更新影響一列
    And "B5" 的刊登服務介紹已變成 "RLS 正面路徑"

  @journey @listing @rls @negative
  Scenario: 會員不能以他人身分建立刊登
    When "B6" 嘗試以 "B8" 的身分建立刊登
    Then 該次寫入被 RLS 拒絕
    And "B8" 名下沒有任何刊登

  @journey @listing @rls @negative
  Scenario: 訪客不能建立刊登
    When 訪客嘗試以 "B8" 的身分建立刊登
    Then 該次寫入被 RLS 拒絕
    And "B8" 名下沒有任何刊登

  @journey @listing @rls @negative
  Scenario: 會員更新他人刊登影響零列且資料未變
    When "B6" 嘗試把 "B5" 的刊登服務介紹改成 "已被入侵"
    Then 該次更新影響零列
    And "B5" 的刊登服務介紹不是 "已被入侵"

  @journey @listing @rls @negative
  Scenario: 會員刪除他人刊登影響零列且該列仍在
    When "B6" 嘗試刪除 "B5" 的刊登
    Then 該次刪除影響零列
    And "B5" 的刊登仍然存在

  @journey @listing @rls @negative
  Scenario: 擁有者不能把刊登的擁有權改給他人
    When "B5" 嘗試把自己刊登的擁有者改成 "B8"
    Then 該次寫入被 RLS 拒絕
    And "B5" 的刊登仍然屬於 "B5"
