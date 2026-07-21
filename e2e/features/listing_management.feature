Feature: Listing management
  刊登管理 (ServiceProviderManagement.tsx + Create/Edit/Detail) lets a member
  publish a single service listing. CRUD talks to Supabase PostgREST directly
  (`/rest/v1/listings`, `/rest/v1/public_listings`) under RLS, so these
  scenarios mock the REST layer via `rest_mock`. Management/create/edit sit
  behind RequireMembershipRoute (active only); the public detail page has
  no guard.

  @listing @smoke
  Scenario: A member with no listing sees the empty state and a create action
    Given I am logged in as an active member
    And I have no listing yet
    When I visit "/service-providers"
    Then I should see the text "尚未刊登服務者"
    And I should see the create-listing action

  @listing
  Scenario: A member with a listing sees it summarised
    Given I am logged in as an active member
    And I have an active listing named "美髮小美"
    When I visit "/service-providers"
    Then I should see the text "美髮小美"

  # 刊登本身沒有狀態或效期——是否對外顯示完全由帳號訂閱決定，且在資料層
  # 一處守門（public_listings view 以 has_active_subscription 過濾），會員
  # 過期／停權的刊登會自動從首頁消失。因此刊登管理頁不再顯示任何「活躍／
  # 過期」徽章，也沒有對應的狀態情境；過期會員本就被 RequireMembershipRoute
  # 導去 checkout（見下方 route_guard 情境）。

  @listing @route_guard
  Scenario: An expired member cannot reach listing management and is sent to checkout
    Given I am logged in as an expired former member
    When I visit "/service-providers"
    Then I should be redirected to "/payment/checkout"

  @listing
  Scenario: Visiting create while already owning a listing bounces to edit
    Given I am logged in as an active member
    And I have an active listing named "已有刊登"
    When I visit "/service-providers/create"
    Then I should be redirected to "/service-providers/edit/11111111-1111-1111-1111-111111111111"
    And I should see a toast containing "每個帳號只能建立一個刊登"

  @listing
  Scenario: Deleting a listing returns the member to the empty state
    Given I am logged in as an active member
    And I have an active listing named "要刪除的刊登"
    When I visit "/service-providers"
    And I delete the listing
    Then I should see a toast containing "刊登已成功刪除"
    And I should see the text "尚未刊登服務者"

  @listing
  Scenario: A member cannot edit a listing they do not own
    Given I am logged in as an active member
    And there is a listing owned by another member
    When I visit "/service-providers/edit/22222222-2222-2222-2222-222222222222"
    Then I should see a toast containing "您無權編輯此刊登"
    And I should be redirected to "/service-providers"

  @listing
  Scenario: Anyone can view a public listing detail without logging in
    Given a public listing named "公開美甲師" exists
    When I visit "/service-providers/33333333-3333-3333-3333-333333333333"
    Then I should see the listing detail for "公開美甲師"

  @listing
  Scenario: A missing listing shows a not-found message
    Given the public listing does not exist
    When I visit "/service-providers/99999999-9999-9999-9999-999999999999"
    Then I should see the text "找不到此服務者"

  @listing
  Scenario: A member creates a listing from a fully valid form
    Given I am logged in as an active member
    And I have no listing yet
    And photo uploads succeed
    When I visit "/service-providers/create"
    And I fill in a valid listing and submit
    Then I should see a toast containing "刊登建立成功"
    And I should be redirected to "/service-providers"

  # 回歸釘：上傳完成的回寫曾用 stale closure 覆寫整份表單——使用者在
  # 照片上傳期間輸入的欄位（此處為聯絡方式）會在上傳完成時被清空，
  # 送出鈕永遠 disabled。冷啟動下 CI 反覆間歇失敗的根因即此。
  Scenario: Input typed while photos are uploading survives the upload completing
    Given I am logged in as an active member
    And I have no listing yet
    And photo uploads are captured until released
    When I visit "/service-providers/create"
    And I fill the listing form while photos are still uploading
    And the photo uploads complete
    Then the create submit button should become enabled
