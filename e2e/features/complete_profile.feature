Feature: Complete profile
  CompleteProfile.tsx collects the fields required before checkout: name,
  national ID, birth date, phone, and an optional referral code that (once
  verified) is bound permanently. The submit button is never silently
  disabled on invalid input — a disabled button with no visible reason is a
  dead-end (see docs/multi-step-flow-recovery.md). Instead the button stays
  clickable and a click on an invalid form surfaces the specific reason
  inline and keeps the user on the page, so these scenarios assert on that
  submit-time error rather than a disabled state.

  Background:
    Given I am logged in with registration step 0
    And I visit "/auth/complete-profile"

  Scenario Outline: An invalid form does not silently disable the button — clicking surfaces the reason
    When I fill the profile form with name "<name>" national ID "<national_id>" birth date "<birth_date>" phone "<phone>"
    Then the profile submit button should be enabled
    When I submit the profile form
    Then I should see a field error containing "<error>"
    And I should still be on the complete profile page

    Examples:
      | name | national_id | birth_date | phone      | error            |
      |      | A123456789  | 1990-01-01 | 0912345678 | 請輸入真實姓名   |
      | 測試 | B99999999   | 1990-01-01 | 0912345678 | 第 2 碼需為      |
      | 測試 | A123456789  | 1990-01-01 | 12345      | 手機號碼格式不正確 |
      | 測試 | A123456789  | 2020-01-01 | 0912345678 | 註冊用戶需年滿   |
      | 測試 | A123456789  | 1990-01-01 | 0912345678 | 請同意服務條款   |

  Scenario: A valid referral code shows the referrer's name
    Given the referral code "abc123" is valid for referrer "推薦人測試"
    When I fill the referral code "abc123"
    And I click verify referral code
    Then I should see the referral code status "推薦人：推薦人測試"

  Scenario: A referral code from an invite link is auto-filled and auto-verified
    Given the referral code "abc123" is valid for referrer "推薦人測試"
    And an invite link with referral code "abc123" has been opened
    When I visit "/auth/complete-profile"
    Then the referral code field should contain "abc123"
    And I should see the referral code status "推薦人：推薦人測試"

  Scenario: An invalid referral code is rejected
    Given the referral code "expired1" is invalid with message "推薦碼已過期"
    When I fill the referral code "expired1"
    And I click verify referral code
    Then I should see a toast containing "推薦碼已過期"

  Scenario: A fully valid submission proceeds to checkout
    Given saving the profile succeeds with registration step 1
    When I fill the profile form with name "測試用戶" national ID "A123456789" birth date "1990-01-01" phone "0912345678"
    And I check the terms checkbox
    Then the profile submit button should be enabled
    When I submit the profile form
    And I confirm the referral code warning
    Then I should be redirected to "/payment/checkout"
