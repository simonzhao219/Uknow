Feature: Registration flow recovery
  Registration is a multi-step flow: create account → verify email (OTP) →
  complete profile → pay. Every step must be resumable — interrupting one can
  never strand the account in a dead end.

  The incident this guards against: a user signs up (email + password), lands
  on the OTP page, closes it, then comes back and tries to log in with the
  *correct* password. The account exists but its email was never verified, so
  GoTrue refuses the login with `email_not_confirmed`. The old UI reported this
  as "Email 或密碼錯誤" and offered no route back into verification.

  Recovery is deliberately password-first: knowing only the email must never be
  enough to make the system send a verification email (that would be an email
  amplification / quota-exhaustion vector). GoTrue verifies the password before
  it reports email_not_confirmed, so resuming verification always requires the
  correct password.

  # --- Security guard: email alone must not trigger any mail ---

  Scenario: An unverified email alone asks for the password and sends no mail
    Given I visit "/login"
    And a monitored member "stuck@example.com" who exists but is not verified
    When I enter email "stuck@example.com" and continue
    Then I should be on the login step
    And no verification email was sent

  # --- Recovery: the correct password on an unverified account resumes OTP ---

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
