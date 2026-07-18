Feature: Referral visibility
  A referrer must see a newly-paid downline after a simple page refresh,
  without logging out and back in. The referral tree cache follows
  stale-while-revalidate (DataCacheContext): cached data paints instantly,
  but any entry restored from sessionStorage (i.e. after F5) is treated as
  stale and revalidated in the background — one round-trip after refresh
  the tree is guaranteed fresh. The old design served a 5-minute-TTL cache
  as-is after refresh, so users believed their reward was lost.

  Scenario: A newly-paid downline appears in the referral tree
    Given I am logged in as an active member
    And my referral tree has a first-generation member "新下線甲"
    When I visit "/referrals"
    Then I should see the text "新下線甲"

  Scenario: An old cache is revalidated so the new downline becomes visible
    Given I am logged in as an active member
    And my referral tree was cached 6 minutes ago with member "舊快取成員"
    And my referral tree has a first-generation member "新下線乙"
    When I visit "/referrals"
    Then I should see the text "新下線乙"

  Scenario: A cache restored after refresh is revalidated in the background
    Given I am logged in as an active member
    And my referral tree was cached 0 minutes ago with member "快取成員"
    And my referral tree has a first-generation member "重新整理後的新成員"
    When I visit "/referrals"
    Then I should see the text "重新整理後的新成員"
