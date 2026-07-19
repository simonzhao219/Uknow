Feature: Login
  AuthPage.tsx drives both /login and /register: step 1 collects an email,
  step 2 becomes a login form once the email is known to already exist.

  Background:
    Given I visit "/login"

  Scenario Outline: Successful login routes by registration step
    Given a registered member "e2e-user@example.com" with password "Passw0rd!" and registration step <step>
    When I log in as "e2e-user@example.com" with password "Passw0rd!"
    Then I should be redirected to "<destination>"

    Examples:
      | step | destination            |
      | 0    | /auth/complete-profile  |
      | 1    | /payment/checkout       |
      | 3    | /dashboard              |

  Scenario: Incorrect password shows an error
    Given a registered member "e2e-user@example.com" whose login always fails
    When I log in as "e2e-user@example.com" with password "wrong-password"
    Then I should see a toast containing "Email 或密碼錯誤"

  Scenario: Invalid email format is rejected before any request is made
    When I enter email "not-an-email" and continue
    Then I should see the email field error "請輸入有效的 Email 格式（例如：example@email.com）"

  Scenario: A login whose account was deleted is sent back to registration
    Given a registered member "ghost@example.com" whose account was deleted
    When I log in as "ghost@example.com" with password "Passw0rd!"
    Then I should see a toast containing "帳號不存在或已被刪除，請重新註冊"

  Scenario: Forgot password link navigates to the reset flow
    Given a registered member "e2e-user@example.com" with password "Passw0rd!" and registration step 3
    When I enter email "e2e-user@example.com" and continue
    And I click forgot password
    Then I should be redirected to "/forgot-password"
