Feature: Reward points and withdrawal
  The 獎勵回饋 page (RewardDashboard.tsx, route /rewards) is where the value a
  member unlocks *after paying* actually lands: points earned from the referral
  relationship (推薦關係 -> 點數) accumulate here, and this is the only place a
  member turns those points back into cash (提領). These flows are exactly the
  "after payment, the features must actually work" outcomes users care about, so
  the coverage below walks the real chain — see the money, see where it came
  from, and get it out — plus every guardrail that legitimately blocks a
  withdrawal.

  The route sits behind ProtectedRoute + RequireMembershipRoute, so only an
  entitled (active/grace) member reaches it; an expired member is redirected to
  checkout by the guard (covered in route_guards.feature) and never renders this
  page, which is why the "subscription invalid" guardrail here is exercised via
  the grace period, the one invalid-for-withdrawal state that can still view it.

  @rewards
  Scenario: A paid member sees their points balance and the referral that earned it
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And my reward history shows a first-generation referral commission "一代推薦 - 王小明" worth 200
    When I visit "/rewards"
    Then I should see the reward dashboard
    And I should see the text "5000P"
    And I should see the text "8000P"
    And I should see the text "一代推薦"
    And I should see the text "+200P"

  @rewards
  Scenario: A member with no rewards yet sees the empty history state
    Given I am a paid member who joined the referral program
    And my reward summary shows 0 available and 0 total earned
    And my reward history is empty
    When I visit "/rewards"
    Then I should see the reward dashboard
    And I should see the empty reward history

  @rewards
  Scenario: Withdrawal is blocked until the member joins the referral program
    Given I am a paid member who has not joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    When I visit "/rewards"
    Then the apply-withdrawal button should be disabled
    And I should see the text "尚未加入推薦計畫，無法申請提領"

  @rewards
  Scenario: Withdrawal is blocked when the balance is below the minimum
    Given I am a paid member who joined the referral program
    And my reward summary shows 500 available and 500 total earned
    When I visit "/rewards"
    Then the apply-withdrawal button should be disabled
    And I should see the text "可提領Point不足"

  @rewards
  Scenario: Withdrawal is blocked once the daily limit has been used
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned and already withdrew today
    When I visit "/rewards"
    Then the apply-withdrawal button should be disabled
    And I should see the text "今日已提領過一次，請明天再試"

  @rewards
  Scenario: A member in the grace period cannot withdraw
    Given I am a grace-period member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    When I visit "/rewards"
    Then the apply-withdrawal button should be disabled
    And I should see the text "訂閱處於寬限期，無法申請提領。請補繳以恢復服務。"

  @rewards
  Scenario: An eligible member can submit a withdrawal application end to end
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And my ID card photos are already on file
    And submitting a withdrawal succeeds
    When I visit "/rewards"
    And I start a withdrawal application
    And I enter the withdrawal amount "1000"
    And I proceed past the amount step
    And I confirm the withdrawal summary
    And I fill the withdrawal identity form with ID "A123456789" bank "臺灣銀行" account "1234567890"
    And I agree to the withdrawal terms
    And I submit the withdrawal application
    Then I should see a toast containing "提領申請已成功提交"

  @rewards
  Scenario: A backend rejection of the withdrawal is surfaced to the member
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And my ID card photos are already on file
    And submitting a withdrawal fails with "已達每日提領上限"
    When I visit "/rewards"
    And I start a withdrawal application
    And I enter the withdrawal amount "1000"
    And I proceed past the amount step
    And I confirm the withdrawal summary
    And I fill the withdrawal identity form with ID "A123456789" bank "臺灣銀行" account "1234567890"
    And I agree to the withdrawal terms
    And I submit the withdrawal application
    Then I should see a toast containing "已達每日提領上限"

  @rewards
  Scenario: A member confirms collection of an approved withdrawal
    Given I am a paid member who joined the referral program
    And my reward summary shows 3000 available and 8000 total earned
    And I have a withdrawal "wd-e2e-1" awaiting collection
    And confirming collection of "wd-e2e-1" succeeds
    When I visit "/rewards"
    And I click collect on the awaiting withdrawal
    And I advance through the collection reminder
    And I advance through the collection preview
    And I verify collection with ID "A123456789"
    Then I should see the text "查收確認成功"
