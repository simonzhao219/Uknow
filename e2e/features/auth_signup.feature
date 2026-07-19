Feature: Signup
  AuthPage.tsx's step 2 becomes a signup form when the email isn't
  registered yet; successful signup hands off to email OTP verification.

  Background:
    Given I visit "/register"
    And the email "new-user@example.com" is not yet registered

  Scenario: A new email shows the signup form
    When I enter email "new-user@example.com" and continue
    Then I should be on the signup step

  Scenario Outline: Password policy violations are shown inline
    When I enter email "new-user@example.com" and continue
    And I set password "<password>" and confirm "<confirm>"
    And I submit signup
    Then I should see a field error containing "<message>"

    Examples:
      | password  | confirm   | message                          |
      | short1A   | short1A   | 至少 8 個字元                      |
      | alllower1 | alllower1 | 至少一個大寫字母（A-Z）              |
      | ALLUPPER1 | ALLUPPER1 | 至少一個小寫字母（a-z）              |
      | NoDigitsX | NoDigitsX | 至少一個數字（0-9）                 |
      | Passw0rd! | Different | 兩次輸入的密碼不一致，請重新確認       |

  Scenario: Successful signup navigates to OTP verification
    Given signing up with password "Passw0rd!" succeeds
    When I enter email "new-user@example.com" and continue
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should be redirected to "/auth/verify-otp"

  Scenario: An invite link's referral code is captured for later auto-fill
    When I visit "/register?ref=abc123"
    Then the pending referral code should be "abc123"

  Scenario: An already-registered email is reported with a friendly message
    Given signing up fails because the email is already registered
    When I enter email "new-user@example.com" and continue
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should see a toast containing "此電子郵件已經註冊過，請改用登入。"

  Scenario: A breached password is reported as such, not as a generic failure
    Given signing up fails because the password was found in a breach
    When I enter email "new-user@example.com" and continue
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should see a toast containing "此密碼曾出現在資料外洩名單中，容易被猜到，請改用其他密碼。"

  Scenario: Too-frequent signups are reported as a rate limit
    Given signing up fails because of the email rate limit
    When I enter email "new-user@example.com" and continue
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should see a toast containing "操作過於頻繁，請稍後再試。"

  Scenario: A failure checking the email keeps the user on the email step
    Given checking whether the email exists fails
    When I enter email "new-user@example.com" and continue
    Then I should see a toast containing "檢查 Email 時發生錯誤"
