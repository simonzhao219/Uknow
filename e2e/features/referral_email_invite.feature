Feature: Email invite card
  InviteCard.tsx — with the build flag on (.env.development), every "邀請好友"
  entry opens one invite card. An empty email means quick share; a filled email
  needs the consent box and posts /referrals/invites. Results land in the card's
  live region, worded by error code; when sending is impossible the main button
  turns back into quick share.

  Background:
    Given I am logged in with registration step 3 and a referral code "8048877"

  Scenario: An accepted email invite echoes the full address and clears the form
    Given sending email invites is accepted
    When I visit "/dashboard"
    And I click the invite friend button
    And I fill the invite email "Friend@Example.com" and agree to the consent
    And I send the email invite
    Then the invite card should say "已受理邀請（寄往 friend@example.com）。"
    And the invite request carried "friend@example.com" with consent
    And the invite card main button should read "快速分享"

  Scenario: Inviting the same address again is still reported as accepted
    Given sending email invites is accepted
    When I visit "/dashboard"
    And I click the invite friend button
    And I fill the invite email "friend@example.com" and agree to the consent
    And I send the email invite
    And I fill the invite email "friend@example.com" and agree to the consent
    And I send the email invite
    Then the invite card should say "已受理邀請（寄往 friend@example.com）。"

  Scenario Outline: A refused email invite points to quick share
    Given sending email invites fails with status <status> and code "<code>"
    When I visit "/dashboard"
    And I click the invite friend button
    And I fill the invite email "friend@example.com" and agree to the consent
    And I send the email invite
    Then the invite card should say "<message>"
    And the invite card main button should read "快速分享"

    Examples:
      | status | code              | message                                                |
      | 429    | rate_limited_hour | 每小時最多寄 5 封，請稍後再試，或改按下方『快速分享』 |
      | 429    | rate_limited_day  | 今天的邀請額度已用完，請明天再試或改按下方『快速分享』 |
      | 503    | unavailable       | 暫時無法寄送，可改按下方『快速分享』                   |

  Scenario: A paused email invite collapses the email field for this card
    Given sending email invites fails with status 503 and code "disabled"
    When I visit "/dashboard"
    And I click the invite friend button
    And I fill the invite email "friend@example.com" and agree to the consent
    And I send the email invite
    Then the invite card should say "Email 邀請暫停中，可改按下方『快速分享』"
    And the invite card should have no email field
