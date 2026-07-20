Feature: Admin dashboard
  "/admin" (AdminRoute — admins only) is a five-tab management console:
  獎金提領管理 / 會員管理 / 公告管理 / 系統告警 / 管理員設置. A logged-in
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

  Scenario: The withdrawals tab shows the empty state when there are none
    Given I am logged in as an admin
    And there are no withdrawal applications
    When I visit "/admin"
    Then I should see the text "目前沒有提領申請"

  Scenario: A pending withdrawal shows the applicant and a pending badge
    Given I am logged in as an admin
    And there is a pending withdrawal from "王小明"
    When I visit "/admin"
    Then I should see the text "王小明"
    And I should see the text "待處理"

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

  Scenario: Marking a pending withdrawal as paid
    Given I am logged in as an admin
    And there is a pending withdrawal from "王小明"
    When I visit "/admin"
    And I mark the withdrawal as paid
    Then I should see the text "已標記匯款完成"

  @negative
  Scenario: Rejecting a pending withdrawal refunds the applicant
    Given I am logged in as an admin
    And there is a pending withdrawal from "王小明"
    When I visit "/admin"
    And I reject the withdrawal
    Then I should see the text "已退件"
