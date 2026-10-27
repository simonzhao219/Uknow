Feature: Referral management attention banner and load errors
  The referral page lists the first-generation members who are about to expire in a
  banner (the most urgent few). Beyond that cap the banner offers the full paged list
  ("全部 N 位 ›"), which replaces the tree in place. A failed page load is a retryable
  callout, and retrying re-requests the data without reloading the page.

  Scenario: The banner opens the full paged list of members about to expire
    Given I am logged in as an active member
    And 25 first-generation members are about to expire
    When I visit "/referrals"
    And I open the full expiring list
    Then I should see 20 of 25 expiring members shown
    When I load more expiring members
    Then I should see 25 of 25 expiring members shown

  Scenario: The full list gives way back to the referral tree
    Given I am logged in as an active member
    And 25 first-generation members are about to expire
    When I visit "/referrals"
    And I open the full expiring list
    And I return to the referral tree
    Then I should see the referral tree

  Scenario: A failed referral load shows a retry callout and retrying does not reload the page
    Given I am logged in as an active member
    And my referral tree has a first-generation member "重試後的成員"
    And the referral network fails to load once
    When I visit "/referrals"
    Then I should see the text "暫時無法取得推薦資料"
    When I retry loading the referral page
    Then I should see the text "重試後的成員"
    And the page was not reloaded
