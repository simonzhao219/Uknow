Feature: Route guards enforce membership entitlement
  ProtectedRoute redirects anonymous visitors to /login; RequireMembershipRoute
  then gates member-only pages on *entitlement* (accountStatus derived from the
  subscription end_date): active members (and admins) pass, everyone else
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

  Scenario Outline: An expired former member cannot open a member-only page and is sent to checkout
    Given I am logged in as an expired former member
    When I visit "<path>"
    Then I should be redirected to "/payment/checkout"

    Examples:
      | path              |
      | /tasks            |
      | /referrals        |
      | /service-providers |

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

  # --- First-paint header (T1 auth-state-trust, plan §1.1 S1–S11) -----------
  # The header must be right from the very first render: a remembered member
  # never flashes the guest "登入／立即刊登", and someone mid-registration only
  # ever gets a way out ("登出") plus, off the funnel pages, a way back in. The
  # /profile request is *held* (not just slow) so the first-paint state can be
  # asserted deterministically before releasing it.

  Scenario: A remembered member never sees the guest header while the profile loads
    Given I am logged in as an active member
    And the browser remembers a member hint for "王"
    And the header is being observed
    And the profile request is held
    When I visit "/"
    Then the header avatar shows "王"
    And the bottom navigation is present
    When the profile request is released
    Then the header shows the member menu
    And the header never showed "登入"
    And the header never showed "立即刊登"
    And the header layout never shifted

  Scenario: A first-time visitor sees the guest header without any profile request
    Given profile requests are counted
    When I visit "/"
    Then the header shows the guest links
    And no profile request was made

  Scenario Outline: Someone mid-registration only gets a logout button on the funnel pages
    Given <who>
    And the header is being observed
    When I visit "<path>"
    Then the header shows only a logout button
    And the bottom navigation is absent
    And the header never showed "登入"
    And the header never showed "立即刊登"
    And the header layout never shifted

    Examples:
      | who                                                         | path                                   |
      | I am logged in with registration step 0                     | /auth/complete-profile                 |
      | I am logged in with registration step 1 and last trade number "" | /payment/checkout                 |
      | I am mid-registration awaiting activation for trade "PU00000031" | /payment/result?tradeNo=PU00000031 |

  Scenario: A remembered registration shows the logout button from the first paint
    Given I am logged in with registration step 1 and last trade number ""
    And the browser remembers a funnel hint heading to "checkout"
    And the header is being observed
    And the profile request is held
    When I visit "/payment/checkout"
    Then the header shows only a logout button
    When the profile request is released
    Then the header shows only a logout button
    And the header never showed "登入"
    And the header never showed "開啟會員選單"
    And the header layout never shifted

  Scenario: Before the email code is verified the header shows only the logo
    Given I have a pending email verification for "pending@example.com"
    And the header is being observed
    When I visit "/auth/verify-otp"
    Then the header right side is empty
    And the header never showed "登入"
    And the header layout never shifted

  Scenario: Arriving on a funnel page with no hint keeps the header empty until the profile answers
    Given I am logged in with registration step 1 and last trade number ""
    And the header is being observed
    And the profile request is held
    When I visit "/payment/checkout"
    Then the header right side is empty
    When the profile request is released
    Then the header shows only a logout button
    And the header never showed "登入"
    And the header layout never shifted

  Scenario: Activation swaps the logout button for the member menu, and a reload starts as a member
    Given I am logged in as an active member
    And trade "PU00000032" enriches with a successful PayUni payment
    And the profile activates while polling for trade "PU00000032"
    And the header is being observed
    When I visit "/payment/result?tradeNo=PU00000032&status=SUCCESS"
    Then the header shows only a logout button
    And the header then switches to the member menu
    When the profile request is held
    And I reload the page
    Then the header avatar shows "測"
    And the header never showed "登入"

  Scenario: Off the funnel pages an unpaid registrant gets a way back to checkout
    Given I am logged in with registration step 1 and last trade number ""
    When I visit "/"
    Then the link "繼續完成註冊" points to "/payment/checkout"
    And the header has a logout button

  Scenario: Off the funnel pages a paid registrant awaiting activation can check progress
    Given I am mid-registration awaiting activation for trade "PU00000033"
    When I visit "/"
    Then the link "查看開通進度" points to "/payment/result?tradeNo=PU00000033"
    And the header has a logout button

  Scenario: A remembered paid registrant sees the activation-progress link from the first paint
    Given I am mid-registration awaiting activation for trade "PU00000034"
    And the browser remembers a funnel hint heading to "result"
    And the profile request is held
    When I visit "/"
    Then the header shows a disabled "查看開通進度" link
    When the profile request is released
    Then the link "查看開通進度" points to "/payment/result?tradeNo=PU00000034"

  Scenario: A hint left by another account never shows that account's initial
    Given I am logged in as an active member
    And the browser remembers a member hint for "甲" from another account
    And the header is being observed
    And the profile request is held
    When I visit "/"
    And the profile request is released
    Then the header shows the member menu
    And the header never showed "甲"

  Scenario Outline: Every header version fits one 64px row on a 320px screen
    Given I am on a 320px-wide screen
    And <who>
    When I visit "<path>"
    Then the header shows the <version> version
    And the header fits one 64px row

    Examples:
      | who                                                              | path              | version             |
      | I am not logged in                                               | /                 | guest               |
      | I am logged in and the profile is still loading                  | /payment/checkout | placeholder         |
      | I am logged in with registration step 1 and last trade number "" | /payment/checkout | logout-only         |
      | I am logged in with registration step 1 and last trade number "" | /                 | continue-and-logout |
      | I am logged in as an admin with pending withdrawals              | /                 | member              |
