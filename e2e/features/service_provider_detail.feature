Feature: Public service-provider detail page
  "/service-providers/:id" (no auth guard) reads a single row from the
  `public_listings` view and renders the provider's photo gallery, 服務介紹
  and 聯絡方式 sections. An unknown id shows a "找不到此服務者" screen instead
  of crashing.

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
