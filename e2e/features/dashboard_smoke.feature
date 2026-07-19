Feature: Dashboard smoke test
  MemberDashboard.tsx — this first pass only smoke-tests that a full member
  lands here and sees their referral code; deeper dashboard coverage
  (rewards, tasks, service providers) is out of scope for now.

  Scenario: A full member sees their dashboard and referral code
    Given I am logged in with registration step 3 and a referral code "REF001"
    When I visit "/dashboard"
    Then I should see the dashboard
    And I should see the text "REF001"

  Scenario: A member shares an invite (copy fallback) carrying link and code
    Given I am logged in with registration step 3 and a referral code "REF001"
    And the browser has no native share sheet
    When I visit "/dashboard"
    And I click the share referral button
    Then I should see a toast containing "邀請訊息已複製到剪貼簿"
