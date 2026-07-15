Feature: Complete profile
  CompleteProfile.tsx collects the fields required before checkout: name,
  national ID, birth date, phone, and an optional referral code that (once
  verified) is bound permanently. The submit button re-evaluates validation
  on every render and stays disabled until every field passes, so most
  scenarios here assert on that disabled state rather than a submit-time
  error message.

  Background:
    Given I am logged in with registration step 0
    And I visit "/auth/complete-profile"

  Scenario Outline: The submit button stays disabled until every field is valid
    When I fill the profile form with name "<name>" national ID "<national_id>" birth date "<birth_date>" phone "<phone>"
    Then the profile submit button should be disabled

    Examples:
      | name | national_id | birth_date | phone      |
      |      | A123456789  | 1990-01-01 | 0912345678 |
      | 測試 | B99999999   | 1990-01-01 | 0912345678 |
      | 測試 | A123456789  | 1990-01-01 | 12345      |
      | 測試 | A123456789  | 2020-01-01 | 0912345678 |
      | 測試 | A123456789  | 1990-01-01 | 0912345678 |

  Scenario: A valid referral code shows the referrer's name
    Given the referral code "abc123" is valid for referrer "推薦人測試"
    When I fill the referral code "abc123"
    And I click verify referral code
    Then I should see the referral code status "推薦人：推薦人測試"

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
