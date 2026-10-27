Feature: Listing management
  刊登管理 (ServiceProviderManagement.tsx + Create/Edit/Detail) lets a member
  publish a single service listing. CRUD talks to Supabase PostgREST directly
  (`/rest/v1/listings`, `/rest/v1/public_listings`) under RLS, so these
  scenarios mock the REST layer via `rest_mock`; deleting a listing goes through
  the backend (`DELETE /listings/:id`), mocked via `api_mock.set_delete_listing`. Management/create/edit sit
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

  # 刊登本身沒有狀態或效期欄位——是否對外顯示完全由帳號訂閱決定，且在資料層
  # 一處守門（public_listings view 以 has_active_subscription 過濾），會員
  # 過期／停權的刊登會自動從首頁消失。所以本頁的「刊登狀態」讀訂閱狀態：會籍有效＝
  # 「上架中」＋會籍至日期；會籍失效＝「已隱藏」（規格書 §11 只有這兩種）。過期會員本就被
  # RequireMembershipRoute 導去 checkout（見下方 route_guard 情境），所以「已隱藏」只在頁面
  # 開著時剛好到期才看得到。守衛讀 /profile 的 accountStatus、本頁讀 /subscriptions/status，
  # 所以 e2e 以「profile 仍有效、訂閱已到期」走到那個邊界。

  @listing
  Scenario: A membership that expired while the page was open shows the listing as hidden with a renewal link
    Given I am logged in as an active member
    And I have an active listing named "美髮小美"
    And my membership has expired
    When I visit "/service-providers"
    Then the listing status reads "已隱藏"
    And I should see the text "刊登已隱藏"
    And the link "續訂" points to "/payment/checkout"

  @listing
  Scenario: A member with an active membership sees the listing as live with the membership end date
    Given I am logged in as an active member
    And I have an active listing named "美髮小美"
    And my membership runs until "2027-12-31"
    When I visit "/service-providers"
    Then the listing status reads "上架中"
    And I should see the membership end date "2027/12/31"

  @listing
  Scenario: A failed listing read shows a retry callout, not the empty state, and retrying does not reload the page
    Given I am logged in as an active member
    And I have an active listing named "重試後的刊登"
    And the listing read fails once
    When I visit "/service-providers"
    Then I should see the text "暫時無法取得刊登狀態"
    And I should not see the create-listing action
    When I retry loading the listing page
    Then I should see the text "重試後的刊登"
    And the page was not reloaded

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
    And the listing deletion API succeeds
    When I visit "/service-providers"
    And I delete the listing
    Then I should see a toast containing "刊登已成功刪除"
    And I should see the text "尚未刊登服務者"

  @listing
  Scenario: A failed deletion keeps the listing and reports the failure
    Given I am logged in as an active member
    And I have an active listing named "要刪除的刊登"
    And the listing deletion API fails with a server error
    When I visit "/service-providers"
    And I delete the listing
    Then I should see the text "刪除失敗"
    And I should see the text "要刪除的刊登"

  @listing
  Scenario: A missing deletion route is not treated as an already deleted listing
    Given I am logged in as an active member
    And I have an active listing named "要刪除的刊登"
    And the listing deletion route is not deployed yet
    When I visit "/service-providers"
    And I delete the listing
    Then I should see the text "刪除失敗"
    And I should see the text "要刪除的刊登"

  @listing
  Scenario: Deleting a listing that is already gone on the server counts as deleted
    Given I am logged in as an active member
    And I have an active listing named "要刪除的刊登"
    And the listing was already deleted on the server
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

  # 驗收 7：真瀏覽器裡「選檔→取景→完成」後，離開瀏覽器的是 1:1、≤1600px、
  # 不帶 EXIF 的 JPEG，且內容就是取景框框住的那一段（fixture 中間的藍帶）。
  Scenario: A cropped photo leaves the browser square, dominantly the framed color and without EXIF
    Given I am logged in as an active member
    And I have no listing yet
    And photo uploads are recorded
    When I visit "/service-providers/create"
    And I fill in a valid listing and submit
    Then I should see a toast containing "刊登建立成功"
    And every uploaded photo is a square JPEG within 1600px without EXIF
    And every uploaded photo is dominantly the framed blue stripe

  @compatibility
  Scenario: On a phone, the crop dialog keeps Cancel and Done reachable
    Given I am on a 375px-wide phone screen
    And I am logged in as an active member
    And I have no listing yet
    And photo uploads succeed
    When I visit "/service-providers/create"
    And I pick the first listing photo
    Then the crop dialog Cancel and Done buttons are fully inside the viewport

  @listing
  Scenario: A failed photo upload can be retried without losing the other photos
    Given I am logged in as an active member
    And I have no listing yet
    And the first photo upload fails
    When I visit "/service-providers/create"
    And I fill the listing form while photos are still uploading
    Then I should see the retry action for photo 1
    When I retry photo 1
    Then all three photos finish uploading

  # 驗收 14：裁切元件 chunk 載入失敗 → 顯示重新載入、該張維持等待取景（不可
  # 送出、不會偷偷改用自動置中裁）。Chromium 會快取失敗的動態 import，同頁面內
  # 重試不會重抓，所以出路是整頁重新整理（業主／主 session 裁決）。
  @listing
  Scenario: A crop tool that fails to load blocks the photo until the page is refreshed
    Given I am logged in as an active member
    And I have no listing yet
    And photo uploads succeed
    And the crop tool chunk fails to load
    When I visit "/service-providers/create"
    And I pick the first listing photo
    Then I should see an alert containing "裁切工具載入失敗"
    And the create submit button should be disabled
    And I should see the refresh page action
    When the crop tool chunk loads again
    And I refresh the page from the alert
    And I pick the first listing photo
    Then I can finish framing photo 1
