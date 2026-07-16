Feature: Payment result
  PaymentResult.tsx resolves its screen from the `status` query param (set by
  the backend's /payuni/return redirect — always carried, even when internal
  processing failed) or a polled GET /payuni/result/:tradeNo call. For a
  successful payment it additionally checks whether the member entitlement
  (accountStatus) has activated: if not, it shows an "activating" screen that
  polls the profile and auto-advances to the dashboard once the backend's
  self-healing converges — replacing the old dead-end where a stuck order
  showed a success button that bounced the user straight back here.

  Background:
    Given I am logged in as an active member

  @smoke
  Scenario: A success status in the URL renders the success screen with PayUni details
    Given trade "PU00000010" enriches with a successful PayUni payment
    When I visit "/payment/result?tradeNo=PU00000010&status=SUCCESS"
    Then I should see the payment result "success"

  Scenario: A failed status in the URL renders the failure reason
    Given trade "PU00000011" enriches with a failed PayUni payment reason "卡片額度不足" code "51"
    When I visit "/payment/result?tradeNo=PU00000011&status=FAILED"
    Then I should see the payment result "failed"
    And I should see the text "卡片額度不足"

  Scenario: No status param falls back to polling — a completed order resolves to success
    Given trade "PU00000012" has order status "completed" with a successful PayUni payment
    When I visit "/payment/result?tradeNo=PU00000012"
    Then I should see the payment result "success"

  Scenario: No status param, a pending order resolves to success after retrying
    Given trade "PU00000013" resolves from "pending" to "completed" after one retry
    When I visit "/payment/result?tradeNo=PU00000013"
    Then I should see the payment result "success"

  Scenario: No status param, an order still pending after retries shows the pending screen
    Given trade "PU00000014" has order status "pending"
    When I visit "/payment/result?tradeNo=PU00000014"
    Then I should see the payment result "pending"

  Scenario: A missing trade number shows the missing-order screen
    When I visit "/payment/result"
    Then I should see the payment result "missing_tradeno"

  Scenario: An order that can't be found shows the unknown screen
    Given trade "PU00000015" cannot be found
    When I visit "/payment/result?tradeNo=PU00000015"
    Then I should see the payment result "unknown"

  Scenario: Success screen navigates to the dashboard
    Given trade "PU00000016" enriches with a successful PayUni payment
    When I visit "/payment/result?tradeNo=PU00000016&status=SUCCESS"
    And I click go to dashboard
    Then I should be redirected to "/dashboard"

  Scenario: Failure screen offers to retry payment
    Given trade "PU00000017" enriches with a failed PayUni payment
    When I visit "/payment/result?tradeNo=PU00000017&status=FAILED"
    And I click retry payment
    Then I should be redirected to "/payment/checkout"

  Scenario: Contact support opens the LINE link in a new tab
    When I visit "/payment/result"
    And I click contact support
    Then a new tab should open to "https://line.me/ti/p/@Uknow"

  Scenario: A paid arrival not yet activated shows the activating screen, then auto-advances once the backend converges
    Given trade "PU00000020" enriches with a successful PayUni payment
    And the profile activates while polling for trade "PU00000020"
    When I visit "/payment/result?tradeNo=PU00000020&status=SUCCESS"
    Then I should see the payment result "activating"
    And I should be redirected to "/dashboard"

  Scenario: Activation that never completes times out to a support screen that can retry
    Given trade "PU00000021" enriches with a successful PayUni payment
    And the profile never activates for trade "PU00000021"
    And the activation clock is controllable
    When I visit "/payment/result?tradeNo=PU00000021&status=SUCCESS"
    Then I should see the payment result "activating"
    When I fast-forward through the activation polling window
    Then I should see the payment result "activation_timeout"
    When I click retry activation
    Then I should see the payment result "activating"
