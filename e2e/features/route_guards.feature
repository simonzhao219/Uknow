Feature: Route guards enforce the registration-step state machine
  ProtectedRoute redirects anonymous visitors to /login; RequirePaymentRoute
  then redirects logged-in members based on registrationStep (0 = needs
  profile, 1 = needs payment, 2 = payment submitted awaiting confirmation,
  3 = full member) before the actual page is ever rendered. This is the
  exact logic behind a previously-shipped bug where paid users bounced back
  to checkout instead of the result page.

  @smoke
  Scenario: Anonymous user is redirected to login
    Given I am not logged in
    When I visit "/dashboard"
    Then I should be redirected to "/login"

  Scenario Outline: Registration step determines the landing page for a member-only route
    Given I am logged in with registration step <step> and last trade number "<trade_no>"
    When I visit "/dashboard"
    Then I should be redirected to "<destination>"

    Examples:
      | step | trade_no   | destination                         |
      | 0    |            | /auth/complete-profile               |
      | 1    |            | /payment/checkout                    |
      | 2    | PU00000001 | /payment/result?tradeNo=PU00000001   |
      | 2    |            | /payment/checkout                    |

  @smoke
  Scenario: A full member reaches the member-only route directly
    Given I am logged in with registration step 3
    When I visit "/dashboard"
    Then I should see the dashboard
