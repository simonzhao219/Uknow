Feature: Legal document reading
  Legal/contract documents referenced from inside a flow (the registration
  terms, the referral-program rules and contract) are read in an in-page
  dialog (LegalDialog), not by navigating to a route. Reading them therefore
  never unmounts the source form/dialog and needs no back button — closing
  the overlay returns the user exactly where they were.

  The standalone document routes still exist for direct URLs (e.g. footer
  links). Their back button must not become a dead no-op when the page is the
  first entry in history (opened in a new tab, via a direct URL, or after a
  refresh): instead of navigate(-1) into the void, it falls back to home.

  Scenario: A document opened as the first history entry has a working back button
    Given I visit "/terms-of-service"
    When I click the document back button
    Then I should be redirected to "/"

  # The reported bug: the referral-program docs used target="_blank", so the
  # doc opened in a new tab whose in-app back button (navigate(-1)) was a dead
  # no-op. They now open as an in-page dialog over the join dialog — no new
  # tab, no navigation, and closing returns to the untouched join dialog.
  Scenario: The referral-program documents open in-page without leaving the dashboard
    Given I am logged in as an active member
    And I visit "/dashboard"
    When I open the join referral program dialog
    And I open the referral rules document
    Then the document should open in an in-page dialog on the dashboard
    When I close the document dialog
    Then the join referral program dialog should still be open
