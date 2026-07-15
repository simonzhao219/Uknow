Feature: Payment checkout
  PaymentCheckout.tsx is the single NT$1,200/year membership fee screen. It
  independently re-checks the user's profile on mount and self-redirects if
  the registration state has already moved on — the exact logic behind a
  previously-shipped bug where paid users bounced back here instead of the
  result page.

  Scenario: A user with an active pending order is redirected to the result page
    Given I am logged in with registration step 2 and last trade number "PU00000003"
    When I visit "/payment/checkout"
    Then I should be redirected to "/payment/result?tradeNo=PU00000003"

  Scenario: An already-paid user is redirected to the dashboard
    Given I am logged in with registration step 2 and a referral code "REF001"
    When I visit "/payment/checkout"
    Then I should be redirected to "/dashboard"

  Scenario: Referrer info is shown when the profile has an uncached referral code
    Given I am logged in with registration step 1 referred by code "friend1" from "推薦人測試"
    When I visit "/payment/checkout"
    Then I should see the text "推薦人：推薦人測試"

  Scenario: Clicking pay redirects through a simulated successful PayUni payment
    Given I am logged in with registration step 1
    And PayUni will report a successful payment for trade number "PU00000004"
    When I visit "/payment/checkout"
    And I click pay
    Then I should see the payment result "success"

  Scenario: Clicking pay redirects through a simulated failed PayUni payment
    Given I am logged in with registration step 1
    And PayUni will report a failed payment for trade number "PU00000005"
    When I visit "/payment/checkout"
    And I click pay
    Then I should see the payment result "failed"

  Scenario: The pay button locks immediately after being clicked
    Given I am logged in with registration step 1
    And PayUni's redirect will be slow for trade number "PU00000006"
    When I visit "/payment/checkout"
    And I click pay
    Then the pay button should be disabled
    And I should see the lock countdown

  Scenario: Paying later signs the user out
    Given I am logged in with registration step 1
    And logging out succeeds
    When I visit "/payment/checkout"
    And I click pay later
    Then I should be redirected to "/login"

  Scenario: Editing resets registration and returns to the profile form
    Given I am logged in with registration step 1
    And resetting registration succeeds
    When I visit "/payment/checkout"
    And I click edit
    Then I should be redirected to "/auth/complete-profile"

  Scenario: A duplicate-subscription error is surfaced as a warning
    Given I am logged in with registration step 1
    And PayUni preparation fails with "已有有效訂閱，請到期後再續約"
    When I visit "/payment/checkout"
    And I click pay
    Then I should see a toast containing "已有有效訂閱，請到期後再續約"
