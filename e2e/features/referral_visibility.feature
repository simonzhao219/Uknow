Feature: Referral visibility
  A referrer must see a newly-paid downline without logging out and back in.
  The referral tree is cached in sessionStorage (DataCacheContext) with a
  5-minute TTL — an expired cache entry is treated as a miss and refetched,
  while a fresh one is still served. The TTL used to be dead code, so the
  tree never updated for the entire session.

  Scenario: A newly-paid downline appears in the referral tree
    Given I am logged in as an active member
    And my referral tree has a first-generation member "新下線甲"
    When I visit "/referrals"
    Then I should see the text "新下線甲"

  Scenario: An expired cache is bypassed so the new downline becomes visible
    Given I am logged in as an active member
    And my referral tree was cached 6 minutes ago with member "舊快取成員"
    And my referral tree has a first-generation member "新下線乙"
    When I visit "/referrals"
    Then I should see the text "新下線乙"

  Scenario: A fresh cache is still served without refetching
    Given I am logged in as an active member
    And my referral tree was cached 0 minutes ago with member "快取成員"
    And my referral tree has a first-generation member "不該出現的成員"
    When I visit "/referrals"
    Then I should see the text "快取成員"
