Feature: Route guards enforce membership entitlement
  ProtectedRoute redirects anonymous visitors to /login; RequireMembershipRoute
  then gates member-only pages on *entitlement* (accountStatus derived from the
  subscription end_date): active/grace members (and admins) pass, everyone else
  is routed to where they can resolve their state — the activation-pending
  result page if they've already paid, checkout for renewal or first payment,
  or the profile form for the first-time funnel. registrationStep is demoted to
  first-time-funnel routing only. This replaces the old step-based state
  machine whose "step 2 always bounces to /payment/result" rule permanently
  trapped users whose paid order was stuck in pending.

  @smoke
  Scenario: Anonymous user is redirected to login
    Given I am not logged in
    When I visit "/dashboard"
    Then I should be redirected to "/login"

  @smoke
  Scenario: An active member reaches the member-only route directly
    Given I am logged in as an active member
    When I visit "/dashboard"
    Then I should see the dashboard

  Scenario: A member in the grace period still reaches the member-only route
    Given I am logged in as a member in grace period
    When I visit "/dashboard"
    Then I should see the dashboard

  Scenario: An admin without a subscription is not locked out
    Given I am logged in as an admin without a subscription
    When I visit "/dashboard"
    Then I should see the dashboard

  Scenario: A paid user awaiting activation is sent to the activation-pending result page
    Given I am logged in awaiting activation with trade number "PU00000001"
    When I visit "/dashboard"
    Then I should be redirected to "/payment/result?tradeNo=PU00000001"

  Scenario: A user whose payment failed is sent back to checkout, not trapped on the result page
    Given I am logged in with step 2 and a failed payment for trade "PU00000002"
    When I visit "/dashboard"
    Then I should be redirected to "/payment/checkout"

  Scenario: An expired former member is sent to checkout to renew, not the registration funnel
    Given I am logged in as an expired former member
    When I visit "/dashboard"
    Then I should be redirected to "/payment/checkout"

  Scenario Outline: The first-time funnel routes by registration step
    Given I am logged in with registration step <step> and last trade number "<trade_no>"
    When I visit "/dashboard"
    Then I should be redirected to "<destination>"

    Examples:
      | step | trade_no | destination            |
      | 0    |          | /auth/complete-profile |
      | 1    |          | /payment/checkout      |

  # Regression guard for the blank "完成付款 / 註冊資訊確認" incident: a
  # freshly-registered step-0 user (basic profile still empty) who reaches the
  # checkout page directly must be routed to fill their profile first, never
  # shown a checkout whose confirmation block is blank. This is the end-to-end
  # counterpart to the backend contract test (fresh user ⇒ step 0) and the
  # checkout guard's unit test — together they close the seam the incident fell
  # through: the backend now emits 0, and the frontend routes 0 off checkout.
  #
  # PaymentCheckout also shows a "請先完成個人資料" toast when *it* performs this
  # redirect (in-app navigation). We assert only the redirect here, not the
  # toast: a fresh page.goto triggers App.tsx's global bootstrap guard, which
  # redirects the incomplete user first and can pre-empt the checkout page's
  # toast — so the toast is genuinely non-deterministic for a cold load and
  # asserting it would be flaky.
  Scenario: A step-0 user who reaches checkout is sent to complete their profile, not shown a blank confirmation
    Given I am logged in with registration step 0
    When I visit "/payment/checkout"
    Then I should be redirected to "/auth/complete-profile"
