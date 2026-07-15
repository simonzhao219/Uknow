Feature: Dashboard smoke test
  MemberDashboard.tsx — this first pass only smoke-tests that a full member
  lands here and sees their referral code; deeper dashboard coverage
  (rewards, tasks, service providers) is out of scope for now.

  Scenario: A full member sees their dashboard and referral code
    Given I am logged in with registration step 3 and a referral code "REF001"
    When I visit "/dashboard"
    Then I should see the dashboard
    And I should see the text "REF001"
