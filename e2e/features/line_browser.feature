Feature: In-app browsers are no longer blocked
  Users open Uknow from a LINE message, so the app must work inside LINE's
  built-in browser (and other in-app browsers) instead of replacing the whole
  app with a "please reopen in Safari/Chrome" block page. These scenarios
  simulate each in-app browser's user agent and assert the real app renders,
  a LINE user can reach signup, and PayUni checkout completes end to end.

  Scenario Outline: <platform> renders the full app instead of a block page
    Given I am browsing inside the "<platform>" in-app browser
    When I visit "/"
    Then the full app should render

    Examples:
      | platform        |
      | LINE (iOS)      |
      | LINE (Android)  |
      | Facebook        |
      | Instagram       |
      | WeChat          |
      | Android WebView |

  Scenario: An injected LINE LIFF SDK global no longer forces a block page
    Given the LINE LIFF SDK global is present
    When I visit "/"
    Then the full app should render

  Scenario: A LINE user can reach the signup form
    Given I am browsing inside the "LINE (iOS)" in-app browser
    When I visit "/register"
    Then I should see the signup email step

  Scenario: A LINE user completes a successful PayUni payment end to end
    Given I am browsing inside the "LINE (iOS)" in-app browser
    And I am logged in with registration step 1
    And PayUni will report a successful payment for trade number "PU00000900"
    When I visit "/payment/checkout"
    And I click pay
    Then I should see the payment result "success"

  Scenario: A LINE user sees a failed PayUni payment result
    Given I am browsing inside the "LINE (Android)" in-app browser
    And I am logged in with registration step 1
    And PayUni will report a failed payment for trade number "PU00000901"
    When I visit "/payment/checkout"
    And I click pay
    Then I should see the payment result "failed"
