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
      # 規則逐條的正確性由 src/utils/passwordPolicy.test.ts（14 個測試）
      # 涵蓋；這裡只保留兩個代表，證明 (a) 政策錯誤會 inline 呈現、
      # (b) 確認欄不一致走的是另一條路徑（requireConfirmation）。
      | password  | confirm   | message                          |
      | short1A   | short1A   | 至少 8 個字元                      |
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

  # --- Email 邀請（R2）：信中連結直接進設定密碼步驟 ---

  Scenario: An invite link opens the set-password step and lands on complete profile with the referral verified
    Given the invite accept succeeds for "invitee@example.com" at registration step 0
    And the referral code "8048876" is valid for referrer "推薦人測試"
    When I open an invite link for "invitee@example.com" with referral code "8048876"
    Then I should be on the signup step
    And the invite token should be gone from the address bar
    When I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should be redirected to "/auth/complete-profile"
    And the password login used "invitee@example.com" and "Passw0rd!"
    And the profile referral code field should contain "8048876"
    And the profile referral code status should read "推薦人：推薦人測試"

  Scenario: An expired invite link moves to the login step and points to forgot password
    Given the invite accept fails with status 400 and code "expired"
    When I open an invite link for "invitee@example.com" with referral code "8048876"
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should be on the login step
    And I should see the alert "邀請連結已過期（7 天內有效）。請推薦人再寄一次；若你已設定過密碼請直接登入，還沒有請點「忘記密碼」設定"
    And I should not see the text "English fallback"

  Scenario: An already accepted invite link switches to login with an empty password
    Given the invite accept fails with status 409 and code "already_accepted"
    When I open an invite link for "invitee@example.com" with referral code "8048876"
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should be on the login step
    And I should see the alert "此邀請已完成設定，請用先前設定的密碼登入"
    And the login password field should be empty

  Scenario: An invitee arriving without the link sees how to set a password on the login step
    Given a registered member "invitee@example.com" whose login always fails
    When I enter email "invitee@example.com" and continue
    Then I should see the text "透過邀請信加入的話，請用信中連結；還沒設定密碼請用忘記密碼"

  Scenario: A failed sign-in right after accepting the invite falls back to the login step
    Given the invite accept succeeds but the password login fails
    When I open an invite link for "invitee@example.com" with referral code "8048876"
    And I set password "Passw0rd!" and confirm "Passw0rd!"
    And I submit signup
    Then I should be on the login step
    And I should see the alert "密碼已設定完成，請用剛設定的密碼登入"
