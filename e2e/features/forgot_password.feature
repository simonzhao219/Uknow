Feature: Forgot password
  The recovery flow spans three pages: ForgotPasswordPage collects an email and
  triggers a recovery OTP, OTPVerificationPage verifies the 6-digit code (which
  establishes a recovery session), and ResetPasswordPage sets the new password.
  Supabase Auth is fully mocked, so no real email or OTP is ever sent.

  Scenario: Requesting a reset code sends the user to OTP verification
    Given the account "e2e-user@example.com" can receive a reset code
    When I request a password reset for "e2e-user@example.com"
    Then I should be redirected to "/auth/verify-otp"

  Scenario: An invalid email is rejected before any request is made
    When I visit "/forgot-password"
    And I submit the reset request for "not-an-email"
    Then I should see a field error containing "請輸入有效的 Email 格式"

  Scenario: A failed send shows an error and keeps the user on the page
    Given sending the reset code fails
    When I visit "/forgot-password"
    And I submit the reset request for "e2e-user@example.com"
    Then I should see a toast containing "發送密碼重設信失敗，請稍後再試"

  Scenario: A correct recovery code lands on the new-password page
    Given the account "e2e-user@example.com" can receive a reset code
    And the recovery code verifies successfully
    When I request a password reset for "e2e-user@example.com"
    And I enter the recovery code "123456"
    Then I should be redirected to "/auth/reset-password"

  Scenario: An incorrect recovery code shows an error
    Given the account "e2e-user@example.com" can receive a reset code
    And the recovery code is incorrect or expired
    When I request a password reset for "e2e-user@example.com"
    And I enter the recovery code "000000"
    Then I should see a toast containing "驗證碼錯誤或已過期，請重新寄送"

  Scenario: Resend becomes available once the 3-minute window expires
    Given the account "e2e-user@example.com" can receive a reset code
    When I request a password reset for "e2e-user@example.com"
    And the reset code window expires
    And I request the recovery code again
    Then I should see a toast containing "驗證碼已重新寄出，請查看信箱"

  Scenario: The new-password page redirects to forgot-password without a session
    When I visit "/auth/reset-password"
    Then I should be redirected to "/forgot-password"
    And I should see a toast containing "驗證已過期，請重新申請密碼重設"

  Scenario: A weak new password is rejected
    Given the account "e2e-user@example.com" can receive a reset code
    And the recovery code verifies successfully
    When I request a password reset for "e2e-user@example.com"
    And I enter the recovery code "123456"
    And I set the new password "short" and confirmation "short"
    Then I should see a field error containing "密碼需包含"

  Scenario: A mismatched confirmation is rejected
    Given the account "e2e-user@example.com" can receive a reset code
    And the recovery code verifies successfully
    When I request a password reset for "e2e-user@example.com"
    And I enter the recovery code "123456"
    And I set the new password "Passw0rd!" and confirmation "Passw0rd?"
    Then I should see a field error containing "兩次輸入的密碼不一致"

  Scenario: Successfully setting a new password returns to login
    Given the account "e2e-user@example.com" can receive a reset code
    And the recovery code verifies successfully
    And updating the password succeeds
    When I request a password reset for "e2e-user@example.com"
    And I enter the recovery code "123456"
    And I set the new password "NewPassw0rd!" and confirmation "NewPassw0rd!"
    Then I should be redirected to "/login"

  Scenario: A failed password update shows an error
    Given the account "e2e-user@example.com" can receive a reset code
    And the recovery code verifies successfully
    And updating the password fails
    When I request a password reset for "e2e-user@example.com"
    And I enter the recovery code "123456"
    And I set the new password "NewPassw0rd!" and confirmation "NewPassw0rd!"
    Then I should see a toast containing "密碼重設失敗，請稍後再試"
