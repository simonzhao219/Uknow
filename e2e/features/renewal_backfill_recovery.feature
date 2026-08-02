Feature: Renewal backfill recovery
  The multi-installment backfill flow is interruptible at any point: state
  lives on the backend (renewal contract), every step has a re-entrant
  entry, and returning from any entrance shows the remaining installments
  instead of restarting the plan (multi-step-flow recovery contracts).

  Scenario: A mid-backfill payment result shows progress instead of an activation error
    Given I am logged in as an expired member mid-backfill
    And trade "PU00000030" completes a backfill installment leaving 2 to go
    When I visit "/payment/result?tradeNo=PU00000030&status=SUCCESS"
    Then I should see the payment result "backfill_progress"
    And I should see the text "還差"
    And I should see the text "不會重複扣款"

  Scenario: Closing the result page without clicking any CTA loses nothing
    Given I am logged in as an expired member mid-backfill
    And trade "PU00000031" completes a backfill installment leaving 2 to go
    When I visit "/payment/result?tradeNo=PU00000031&status=SUCCESS"
    And I visit "/payment/checkout"
    Then I should see the text "已補至"
    And I should see the text "還差"

  Scenario: Returning to checkout from any entrance shows remaining installments
    Given I am logged in as an expired member mid-backfill
    When I visit "/payment/checkout"
    Then I should see the text "已補至"
    And I should see the text "還差"

  Scenario: Continue backfill on the result page returns to checkout
    Given I am logged in as an expired member mid-backfill
    And trade "PU00000032" completes a backfill installment leaving 2 to go
    When I visit "/payment/result?tradeNo=PU00000032&status=SUCCESS"
    And I click continue backfill
    Then I should be redirected to "/payment/checkout"
