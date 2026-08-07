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
  active member reaches it; an expired member is redirected to checkout by the
  guard (covered in route_guards.feature) and never renders this page. With the
  grace period removed (two-state membership), there is no longer any state that
  can view this page yet is invalid for withdrawal, so the "subscription invalid"
  guardrail is enforced at the guard and backend layers rather than here.

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
  Scenario: A member without ID photos on file uploads them during the application
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And I have not uploaded my ID card photos yet
    And uploading my ID card photos succeeds
    And submitting a withdrawal succeeds
    When I visit "/rewards"
    And I start a withdrawal application
    And I enter the withdrawal amount "1000"
    And I proceed past the amount step
    And I confirm the withdrawal summary
    And I fill the withdrawal identity form with ID "A123456789" bank "臺灣銀行" account "1234567890"
    And I upload my ID card photos
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

  @compatibility
  Scenario: A toast carrying an unbreakable error code stays inside a phone screen
    # 後端錯誤訊息會原樣進 toast。中文句子能自由斷行所以永遠塞得下,但錯誤
    # 代碼這種不可斷的長 token 沒有斷點:它會把訊息欄撐開、卡片頂到寬度上限,
    # 然後整張卡片掛到視窗外(修正前 375px 下左右各溢出 61px,兩端文字被切)。
    Given I am on a 375px-wide phone screen
    And I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And my ID card photos are already on file
    And submitting a withdrawal fails with "ERR_SUBSCRIPTION_STATE_TRANSITION_FAILURE_0x8F2A1C9D"
    When I visit "/rewards"
    And I start a withdrawal application
    And I enter the withdrawal amount "1000"
    And I proceed past the amount step
    And I confirm the withdrawal summary
    And I fill the withdrawal identity form with ID "A123456789" bank "臺灣銀行" account "1234567890"
    And I agree to the withdrawal terms
    And I submit the withdrawal application
    Then I should see a toast containing "ERR_SUBSCRIPTION_STATE_TRANSITION_FAILURE"
    And the toast should stay within the screen

  # --- Amount guardrails (WithdrawalProcess.validateStep1) ------------------
  # The money core: what can actually leave the account. Each violation must be
  # caught client-side before the confirm step, mirroring the backend's rules.

  @rewards
  Scenario: The application stays locked until the terms are agreed
    # Every field is valid; the submit gate must remain closed purely because
    # the terms checkbox is unticked, and open the moment it is ticked.
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And my ID card photos are already on file
    When I visit "/rewards"
    And I start a withdrawal application
    And I enter the withdrawal amount "1000"
    And I proceed past the amount step
    And I confirm the withdrawal summary
    And I fill the withdrawal identity form with ID "A123456789" bank "臺灣銀行" account "1234567890"
    Then I should see the text "身分證驗證成功"
    And the submit-withdrawal button should be disabled
    When I agree to the withdrawal terms
    Then the submit-withdrawal button should be enabled

  @rewards
  Scenario: A failed ID-photo upload aborts the submission with an error
    Given I am a paid member who joined the referral program
    And my reward summary shows 5000 available and 8000 total earned
    And I have not uploaded my ID card photos yet
    And uploading my ID card photos fails with "照片上傳失敗，請稍後再試"
    When I visit "/rewards"
    And I start a withdrawal application
    And I enter the withdrawal amount "1000"
    And I proceed past the amount step
    And I confirm the withdrawal summary
    And I fill the withdrawal identity form with ID "A123456789" bank "臺灣銀行" account "1234567890"
    And I upload my ID card photos
    And I agree to the withdrawal terms
    And I submit the withdrawal application
    Then I should see a toast containing "照片上傳失敗，請稍後再試"

  # --- Collection (查收) guardrail ------------------------------------------

  @rewards
  Scenario: A collection whose ID fails verification surfaces the error and stays open
    Given I am a paid member who joined the referral program
    And my reward summary shows 3000 available and 8000 total earned
    And I have a withdrawal "wd-e2e-1" awaiting collection
    And confirming collection of "wd-e2e-1" fails with "身分證字號與提領申請不符"
    When I visit "/rewards"
    And I click collect on the awaiting withdrawal
    And I advance through the collection reminder
    And I advance through the collection preview
    And I verify collection with ID "A123456789"
    Then I should see the text "確認查收失敗"

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
