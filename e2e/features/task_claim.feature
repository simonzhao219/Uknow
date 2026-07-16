Feature: Task rewards update membership visibly
  Claiming the 推薦王 free-renewal-year reward extends the subscription
  end_date on the backend; the frontend must invalidate its cached
  subscription status so the member dashboard shows the new period
  immediately — not the pre-claim dates for the rest of the session.

  Scenario: The 推薦王 monthly progress is visible on the task dashboard
    Given I am logged in as an active member
    And my task center shows 3 referrals this month
    When I visit "/tasks"
    Then I should see the text "已推薦 3 人"

  Scenario: Claiming the free-renewal-year reward updates the dashboard subscription period
    Given I am logged in as an active member
    And my task center has an unclaimed free-renewal-year reward "reward-e2e-1"
    And my subscription extends from "2026-12-31" to "2027-12-31" when claimed
    When I visit "/tasks"
    And I claim the pending reward with id number "A123456789"
    And I visit "/dashboard"
    Then I should see the text "2027/12/31"
