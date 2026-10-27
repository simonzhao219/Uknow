Feature: Admin dashboard
  "/admin" (AdminRoute — admins only) is a four-tab management console:
  獎金提領管理 / 會員管理 / 系統公告 / 系統告警 (accessible names; the tabs
  show only 提領 / 會員 / 公告 / 告警). A logged-in
  non-admin is redirected to their dashboard rather than seeing it.

  @smoke @route_guard @negative
  Scenario: A logged-in non-admin is redirected away from /admin
    Given I am logged in as an active member
    When I visit "/admin"
    Then I should be redirected to "/dashboard"

  @smoke
  Scenario: The admin console renders its management tabs
    Given I am logged in as an admin
    And there are no withdrawal applications
    When I visit "/admin"
    Then I should see the text "平台管理"
    And I should see the "獎金提領管理" tab
    And I should see the "會員管理" tab

  Scenario: Switching to the members tab lists platform members
    Given I am logged in as an admin
    And there are no withdrawal applications
    And the platform has a member named "陳大文"
    When I visit "/admin"
    And I open the "會員管理" tab
    Then I should see the text "陳大文"

  Scenario: The system alerts tab lists unresolved alerts and resolving clears them
    Given I am logged in as an admin
    And there are no withdrawal applications
    And there is an unresolved system alert "付款處理失敗，需人工介入"
    When I visit "/admin"
    And I open the "系統告警" tab
    Then I should see the text "付款處理失敗，需人工介入"
    When I resolve the first system alert
    Then I should see a toast containing "已標記處理"
    And I should see the text "目前沒有未處理的告警"

  # 切回分頁時先顯示剛才的列表、背景更新（S5 記憶體快取）。扣住列表讀取才看得到
  # 更新中的那一段——快網路下它在一個 frame 內就結束了。
  Scenario: Returning to a visited tab shows the previous list at once while it refreshes
    Given I am logged in as an admin
    And there is a pending withdrawal from "王小明"
    And the platform has a member named "陳大文"
    When I visit "/admin"
    Then I should see the text "王小明"
    When I open the "會員管理" tab
    Then I should see the text "陳大文"
    When the withdrawal list stops responding
    And I open the "獎金提領管理" tab
    Then the withdrawal list shows "王小明" without a loading skeleton
    And the withdrawal list is refreshing
    When the withdrawal list responds again
    Then the withdrawal list is no longer refreshing

  @compatibility
  Scenario: On a phone, returning to a visited tab shows the previous list at once while it refreshes
    Given I am on a 375px-wide phone screen
    And I am logged in as an admin
    And there is a pending withdrawal from "王小明"
    And the platform has a member named "陳大文"
    When I visit "/admin"
    Then I should see the text "王小明"
    When I open the "會員管理" tab
    Then I should see the text "陳大文"
    When the withdrawal list stops responding
    And I open the "獎金提領管理" tab
    Then the withdrawal list shows "王小明" without a loading skeleton
    And the withdrawal list is refreshing
    When the withdrawal list responds again
    Then the withdrawal list is no longer refreshing

  # 退件不受確認閘門約束；送出後列表留在畫面上背景重讀。走 journey 共用的 page object。
  Scenario: Rejecting a withdrawal keeps the list on screen while it refreshes
    Given I am logged in as an admin
    And there is a pending withdrawal from "王小明"
    When I visit "/admin"
    Then I should see the text "王小明"
    When the withdrawal list stops responding
    And I reject the withdrawal from "王小明"
    Then I should see the text "已退件：王小明"
    And the withdrawal list shows "王小明" without a loading skeleton
    And the withdrawal list is refreshing
    When the withdrawal list responds again
    Then the withdrawal list is no longer refreshing
