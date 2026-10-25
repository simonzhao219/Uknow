Feature: Task center information hierarchy
  The task center's main number is this round's progress ("x / target"). Four medals
  stand in for the old progress bar: each covers a quarter of the target, so with a
  target of 8 an odd count lights half a medal and an even count a full one. A member
  who paid but has not joined the referral program keeps accruing progress and is
  pointed to the referral page; a failed load is a retryable callout that does not
  reload the page.

  Scenario Outline: The medals light up with this round's referrals
    Given I am logged in as an active member
    And my task center shows <count> referrals this month
    When I visit "/tasks"
    Then the round progress reads "<progress>"
    And the medals are lit "<lit>"

    Examples:
      | count | progress | lit       |
      | 0     | 0 / 8    | 0,0,0,0   |
      | 1     | 1 / 8    | 0.5,0,0,0 |
      | 3     | 3 / 8    | 1,0.5,0,0 |
      | 8     | 8 / 8    | 1,1,1,1   |
      | 10    | 2 / 8    | 1,0,0,0   |

  Scenario: A new member sees every medal dark and a hint that the task starts after the first referral
    Given I am logged in as an active member
    And my task center shows 0 referrals this month
    When I visit "/tasks"
    Then the medals are lit "0,0,0,0"
    And I should see the text "完成第一次推薦後，任務將自動啟動"

  Scenario: A member who has not joined the referral program keeps the progress and is pointed to the referral page
    Given I am logged in as an active member who has not joined the referral program
    And my task center shows 2 referrals this month
    When I visit "/tasks"
    Then the round progress reads "2 / 8"
    And I should see the text "推薦碼目前不能出示或分享"
    When I follow the link "前往推薦管理加入"
    Then I should be redirected to "/referrals"

  Scenario: A member who joined the referral program sees no join hint
    Given I am logged in as an active member
    And my task center shows 2 referrals this month
    When I visit "/tasks"
    Then the round progress reads "2 / 8"
    And I should not see the text "尚未加入推薦計畫"

  Scenario: A pending reward is announced above the task card with a claim button
    Given I am logged in as an active member
    And my task center has an unclaimed free-renewal-year reward "reward-e2e-2"
    When I visit "/tasks"
    Then I should see the claim button

  Scenario: A failed task load shows a retry callout and retrying does not reload the page
    Given I am logged in as an active member
    And my task center shows 3 referrals this month
    And the task list fails to load once
    When I visit "/tasks"
    Then I should see the text "暫時無法取得任務資料"
    When I retry loading the task center
    Then the round progress reads "3 / 8"
    And the page was not reloaded
