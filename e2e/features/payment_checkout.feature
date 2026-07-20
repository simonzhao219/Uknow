Feature: Payment checkout
  PaymentCheckout.tsx is the single NT$1,200/year membership fee screen. It
  independently re-checks the user's profile on mount and self-redirects if
  the registration state has already moved on — the exact logic behind a
  previously-shipped bug where paid users bounced back here instead of the
  result page.

  Scenario: A paid user awaiting activation is redirected to the result page
    Given I am logged in awaiting activation with trade number "PU00000003"
    When I visit "/payment/checkout"
    Then I should be redirected to "/payment/result?tradeNo=PU00000003"

  Scenario: A step-2 user whose payment failed stays on checkout to retry
    Given I am logged in with step 2 and a failed payment for trade "PU00000098"
    When I visit "/payment/checkout"
    Then I should see the text "完成付款"

  Scenario: An already-paid active member is redirected to the dashboard
    Given I am logged in with registration step 2 and a referral code "REF001"
    When I visit "/payment/checkout"
    Then I should be redirected to "/dashboard"

  Scenario: An expired former member sees both renewal options
    Given I am logged in as an expired former member
    When I visit "/payment/checkout"
    Then I should see the text "續費會員"
    And I should see the text "續約（接續原效期）"
    And I should see the text "新約（重新起算）"

  Scenario: A member expired for over a year can only start a fresh contract
    Given I am logged in as a long-expired former member
    When I visit "/payment/checkout"
    Then I should see the text "新約（重新起算）"
    And I should see the text "無法接續原效期"

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

  Scenario: The pay button disables immediately after being clicked, before PayUni even responds
    Given I am logged in with registration step 1
    And PayUni's prepare call never resolves
    When I visit "/payment/checkout"
    And I click pay
    Then the pay button should be disabled

  # 「稍後付款」按身分分流：首次註冊者維持登出（resolvePostLoginAction 會在
  # 下次登入時把 step 1/2 使用者靜默導回結帳，漏斗接得回去），但按鈕文字
  # 必須把「會登出」講清楚；續費會員只是想先離開，登出他們是錯的。
  Scenario: Paying later as a first-time signup signs the user out, and says so
    Given I am logged in with registration step 1
    And logging out succeeds
    When I visit "/payment/checkout"
    Then the pay-later button should be labeled "登出，稍後再付款"
    When I click pay later
    Then I should be redirected to "/login"

  Scenario: A renewing member who pays later stays signed in
    Given I am logged in as an expired former member
    When I visit "/payment/checkout"
    Then the pay-later button should be labeled "稍後再說"
    When I click pay later
    Then I should be redirected to "/"
    And I should see a toast containing "隨時可回來完成續費"

  # Regression: clicking edit used to land on the profile form and then
  # immediately bounce back to checkout, because CompleteProfile's guard keyed
  # off "profile has data" rather than the user's edit intent. It must now stay
  # on the form AND prefill what the user was just looking at — otherwise the
  # re-submit would blank out fields (and even wipe the bound referral code).
  Scenario: Editing returns to the profile form, stays there, and prefills the data
    Given I am logged in with registration step 1
    And resetting registration succeeds
    When I visit "/payment/checkout"
    And I click edit
    Then I should be redirected to "/auth/complete-profile"
    And I should remain on the complete profile page
    And the name field should contain "測試用戶"
    And the phone field should contain "0912345678"

  Scenario: A duplicate-subscription error is surfaced as a warning
    Given I am logged in with registration step 1
    And PayUni preparation fails with "已有有效訂閱，請到期後再續約"
    When I visit "/payment/checkout"
    And I click pay
    Then I should see a toast containing "已有有效訂閱，請到期後再續約"
