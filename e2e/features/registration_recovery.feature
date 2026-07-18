Feature: Registration flow recovery
  Registration is a multi-step flow: create account → verify email (OTP) →
  complete profile → pay. Every step must be resumable — interrupting one can
  never strand the account in a dead end.

  The incident this guards against: a user signs up (email + password), lands
  on the OTP page, closes it, then comes back and tries to log in with the
  *correct* password. The account exists but its email was never verified, so
  GoTrue refuses the login with `email_not_confirmed`. The old UI reported this
  as "Email 或密碼錯誤" and offered no route back into verification — the
  account looked permanently broken. There are two independent guards that must
  keep it recoverable: step 1 detects the unverified account up front, and the
  login handler is a safety net if the form was reached anyway.

  # --- Guard A: step 1 detects the unverified account before the login form ---

  Scenario: Entering an unverified email at step 1 goes straight to verification
    Given I visit "/login"
    And the email "stuck@example.com" exists but is not verified
    And resending the verification code succeeds
    When I enter email "stuck@example.com" and continue
    Then I should be redirected to "/auth/verify-otp"

  # --- Guard B: the login handler catches email_not_confirmed as a safety net ---

  Scenario: A password login rejected as unverified resumes verification
    Given the login form is reachable for "stuck@example.com" but the password login is rejected as unverified
    And resending the verification code succeeds
    When I log in as "stuck@example.com" with password "Passw0rd!"
    Then I should be redirected to "/auth/verify-otp"

  Scenario: The stuck login is explained honestly, not as a wrong password
    Given the login form is reachable for "stuck@example.com" but the password login is rejected as unverified
    And resending the verification code succeeds
    When I log in as "stuck@example.com" with password "Passw0rd!"
    Then I should see a toast containing "尚未完成 Email 驗證"

  # --- Regression guard: a real wrong password must still say so ---

  Scenario: A genuinely wrong password is still reported as such
    Given a registered member "real@example.com" whose login always fails
    When I log in as "real@example.com" with password "wrong-password"
    Then I should see a toast containing "Email 或密碼錯誤"
