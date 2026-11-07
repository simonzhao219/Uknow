Feature: Renewal backfill recovery
  The multi-installment backfill flow is interruptible at any point: state
  lives on the backend (renewal contract), every step has a re-entrant
  entry, and returning from any entrance shows the remaining installments
  instead of restarting the plan (multi-step-flow recovery contracts).

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


  Scenario: An expired member with a stale first-purchase snapshot still sees both renewal modes
    Given I am logged in as an expired member with a stale first-purchase snapshot
    When I visit "/payment/checkout"
    Then I should see the text "續費方式"
    And I should see the text "續約"

  Scenario: A fresh renewal with nothing to forfeit still asks for confirmation
    Given I am logged in as an expired former member
    When I visit "/payment/checkout"
    And I choose the fresh renewal mode
    And I click pay
    Then I should see the text "確定要以新約重新開始嗎？"
    And I should see the text "目前沒有點數或推薦紀錄需要清空。"
