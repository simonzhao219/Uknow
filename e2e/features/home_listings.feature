Feature: Public service-provider directory (home page)
  The public landing page ("/", no auth guard) lists the active service
  providers from the `public_listings` view and lets an anonymous visitor
  narrow them with a keyword search over name / service description / tags
  before opening a provider's detail page.

  @smoke @listing
  Scenario: The directory renders a card for each active listing
    Given the public directory lists providers "Alice 美髮師", "Bob 美甲師"
    When I visit "/"
    Then I should see the listing card for "Alice 美髮師"
    And I should see the listing card for "Bob 美甲師"

  @listing
  Scenario: An empty directory shows the no-listings empty state
    Given the public directory has no listings
    When I visit "/"
    Then I should see the text "目前沒有可用的服務者"

  @listing @negative
  Scenario: A directory load failure shows an error with retry, not the empty state
    Given the public directory is temporarily failing
    When I visit "/"
    Then I should see the text "載入失敗"
    And I should not see the text "目前沒有可用的服務者"
    When the public directory recovers with providers "Alice 美髮師"
    And I retry loading the directory
    Then I should see the listing card for "Alice 美髮師"

  @listing
  Scenario: A keyword search narrows the directory to matching providers
    Given the public directory lists providers "Alice 美髮師", "Bob 美甲師"
    When I visit "/"
    And I search the directory for "Alice"
    Then I should see the listing card for "Alice 美髮師"
    And I should not see the listing card for "Bob 美甲師"

  @listing @negative
  Scenario: A search with no matches shows the empty state, then clears back
    Given the public directory lists providers "Alice 美髮師", "Bob 美甲師"
    When I visit "/"
    And I search the directory for "這個關鍵字不存在"
    Then I should see the text "沒有找到符合條件的服務者"
    When I clear the directory search and filters
    Then I should see the listing card for "Alice 美髮師"
    And I should see the listing card for "Bob 美甲師"

  @listing
  Scenario: Opening a listing card navigates to its detail page
    Given the public directory lists providers "Alice 美髮師"
    When I visit "/"
    And I open the listing card for "Alice 美髮師"
    Then I should be on the detail page for "Alice 美髮師"

  @listing
  Scenario: Without location permission the newest listing stays on top
    Given the public directory has a listing "台北服務者" in "台北市"
    And the public directory has a listing "高雄服務者" in "高雄市"
    When I visit "/"
    Then the first listing should be "台北服務者"

  @listing
  Scenario: With location granted the directory sorts nearest-first
    Given the public directory has a listing "台北服務者" in "台北市"
    And the public directory has a listing "高雄服務者" in "高雄市"
    And my location is "高雄市"
    When I visit "/"
    Then the first listing should be "高雄服務者"

  @listing @compatibility
  Scenario: The directory renders mobile cards on a small screen
    Given I am on a mobile-sized screen
    And the public directory lists providers "Alice 美髮師"
    When I visit "/"
    Then I should see the listing card for "Alice 美髮師"
