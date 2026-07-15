Feature: OTP verification
  OTPVerificationPage.tsx is only reachable via React Router state set by a
  successful signup — there is no query param or bare URL that lands on it
  validly, so every scenario here (except the last) drives a real signup first.

  Scenario: Correct code verifies and proceeds
    Given I have just signed up with email "new-user@example.com"
    And verifying the code succeeds with registration step 1
    When I enter the OTP code "123456"
    Then I should be redirected to "/payment/checkout"

  Scenario: Incorrect or expired code shows an error and clears the input
    Given I have just signed up with email "new-user@example.com"
    And verifying the code always fails
    When I enter the OTP code "000000"
    Then I should see a toast containing "驗證碼錯誤或已過期，請重新寄送"

  Scenario: Resend becomes available once the 3-minute window expires
    Given I have just signed up with email "new-user@example.com"
    And 3 minutes and 1 second have passed
    And resending the code succeeds
    When I click resend
    Then I should see a toast containing "驗證碼已重新寄出，請查看信箱"

  Scenario: Direct navigation without a pending signup redirects to login
    Given I am not logged in
    When I visit "/auth/verify-otp"
    Then I should be redirected to "/login"
