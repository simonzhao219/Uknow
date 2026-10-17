Feature: Public service-provider detail page
  "/service-providers/:id" (no auth guard) reads a single row from the
  `public_listings` view and renders the provider's photo gallery, 服務介紹
  and 聯絡方式 sections. An unknown id shows a "找不到此服務者" screen instead
  of crashing; a transient read failure is NOT "not found" — visitors arriving
  from a shared LINE link get an error with retry instead.

  @listing
  Scenario: A known listing renders its details
    Given a public listing "Cara 美容師" exists with description "專業臉部保養與清潔"
    When I open that listing's detail page
    Then I should see the text "Cara 美容師"
    And I should see the text "服務介紹"
    And I should see the text "聯絡方式"

  @listing @negative
  Scenario: An unknown listing shows the not-found screen
    Given no public listing exists for id "deadbeef-0000-0000-0000-000000000000"
    When I visit "/service-providers/deadbeef-0000-0000-0000-000000000000"
    Then I should see the text "找不到此服務者"

  @listing @negative
  Scenario: A detail load failure shows an error with retry, not the not-found screen
    Given a public listing "Cara 美容師" exists with description "專業臉部保養與清潔"
    And the listing detail read is temporarily failing
    When I open that listing's detail page
    Then I should see the text "暫時無法載入服務者資料"
    And I should not see the text "找不到此服務者"
    When the listing detail read recovers
    And I retry loading the listing detail
    Then I should see the text "Cara 美容師"
    And I should see the text "服務介紹"

  @listing
  Scenario: Opening a shared detail link directly, the back button returns to the directory
    Given a public listing "Cara 美容師" exists with description "專業臉部保養與清潔"
    When I open that listing's detail page
    And I press the detail page's back button labelled "回首頁"
    Then I should be redirected to "/"
    And I should see the text "找到你需要的專業服務"

  @listing
  Scenario: After reloading a detail page opened from the directory, back still returns to the directory
    Given the public directory lists providers "Alice 美髮師"
    And the directory listing "Alice 美髮師" has a detail page
    When I visit "/"
    And I open the listing card for "Alice 美髮師"
    And I reload the page
    And I press the detail page's back button labelled "返回上一頁"
    Then I should be redirected to "/"
    And I should see the listing card for "Alice 美髮師"
