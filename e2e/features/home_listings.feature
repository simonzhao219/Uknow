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
