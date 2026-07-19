"""Steps for rewards_withdrawal.feature — the points balance / reward history /
withdrawal flows on the 獎勵回饋 page (RewardDashboard.tsx).

The member-seeding Givens install a *complete* set of reward-endpoint mocks
(summary, withdrawals, history, id-photos, verify-id) so the page's parallel
bootstrap fetches never hit the real-network guard; later Givens override
individual slices. Every reward read is mocked at an exact URL (see
BackendApiMock._route_exact), so those overrides are order-independent.
"""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_reward_history_record, build_withdrawal_record
from mocks.fixtures import seed_authenticated_session
from steps.common_steps import *  # noqa: F401,F403

scenarios("rewards_withdrawal.feature")


# --- Member sessions that can reach /rewards -------------------------------

def _seed_member(context, api_mock, *, account_status, sub_status, joined):
    seed_authenticated_session(
        context,
        registration_step=3,
        accountStatus=account_status,
        subscriptionEndDate="2027-01-01T00:00:00.000Z",
        referralProgramJoined=joined,
    )
    api_mock.set_subscription_status(has_subscription=True, status=sub_status)
    # Full default wiring so the page's Promise.all bootstrap always resolves;
    # individual Givens below override just what they need.
    api_mock.set_reward_dashboard()


@given("I am a paid member who joined the referral program")
def paid_member_joined(context, api_mock):
    _seed_member(context, api_mock, account_status="active", sub_status="active", joined=True)


@given("I am a paid member who has not joined the referral program")
def paid_member_not_joined(context, api_mock):
    _seed_member(context, api_mock, account_status="active", sub_status="active", joined=False)


@given("I am a grace-period member who joined the referral program")
def grace_member_joined(context, api_mock):
    # Grace still passes RequireMembershipRoute (so the page renders), but the
    # withdrawal button must stay disabled — the one invalid-for-withdrawal
    # state that can actually view this page.
    _seed_member(context, api_mock, account_status="grace", sub_status="grace", joined=True)


# --- Reward summary / history / photos overrides ---------------------------

@given(parsers.parse("my reward summary shows {available:d} available and {total:d} total earned"))
def reward_summary(api_mock, available, total):
    api_mock.set_reward_summary(available=available, total_earned=total)


@given(
    parsers.parse(
        "my reward summary shows {available:d} available and {total:d} total earned and already withdrew today"
    )
)
def reward_summary_withdrew_today(api_mock, available, total):
    api_mock.set_reward_summary(available=available, total_earned=total, has_withdrawn_today=True)


@given(parsers.parse('my reward history shows a first-generation referral commission "{description}" worth {amount:d}'))
def reward_history_referral(api_mock, description, amount):
    api_mock.set_reward_history(
        [build_reward_history_record(description=description, amount=amount, balance=amount)]
    )


@given("my reward history is empty")
def reward_history_empty(api_mock):
    api_mock.set_reward_history([])


@given("my ID card photos are already on file")
def id_photos_on_file(api_mock):
    api_mock.set_reward_id_photos(
        front_url="https://mock/id-front.jpg", back_url="https://mock/id-back.jpg"
    )


@given("I have not uploaded my ID card photos yet")
def no_id_photos_on_file(api_mock):
    api_mock.set_reward_id_photos(front_url=None, back_url=None)


@given("uploading my ID card photos succeeds")
def upload_id_photos_succeeds(api_mock):
    api_mock.set_upload_id_photos_success()


# --- Withdrawal submit / collection outcomes -------------------------------

@given("submitting a withdrawal succeeds")
def withdraw_succeeds(api_mock):
    api_mock.set_withdraw_success()


@given(parsers.parse('submitting a withdrawal fails with "{message}"'))
def withdraw_fails(api_mock, message):
    api_mock.set_withdraw_error(message)


@given(parsers.parse('I have a withdrawal "{withdrawal_id}" awaiting collection'))
def withdrawal_awaiting_collection(api_mock, withdrawal_id):
    api_mock.set_reward_withdrawals(
        [build_withdrawal_record(id=withdrawal_id, status="awaiting_collection")]
    )


@given(parsers.parse('confirming collection of "{withdrawal_id}" succeeds'))
def confirm_collection_succeeds(api_mock, withdrawal_id):
    api_mock.set_confirm_collection_success(withdrawal_id)


@given(parsers.parse('confirming collection of "{withdrawal_id}" fails with "{message}"'))
def confirm_collection_fails(api_mock, withdrawal_id, message):
    api_mock.set_confirm_collection_error(withdrawal_id, message)


@given("verifying the national ID always fails")
def verify_id_always_fails(api_mock):
    # A rejected national ID leaves isIdVerified false, so the submit gate stays
    # closed — the security-relevant guard against withdrawing under a mismatched
    # identity. (A 4xx surfaces the generic "驗證失敗，請稍後再試" reason.)
    api_mock.set_verify_id_error()


@given(parsers.parse('uploading my ID card photos fails with "{message}"'))
def upload_id_photos_fails(api_mock, message):
    api_mock.set_upload_id_photos_error(message)


# --- Withdrawal application flow (WithdrawalProcess) ------------------------

@when("I start a withdrawal application")
def start_withdrawal(reward_page):
    reward_page.start_withdrawal()


@when(parsers.parse('I enter the withdrawal amount "{amount}"'))
def enter_amount(reward_page, amount):
    reward_page.fill_amount(amount)


@when("I proceed past the amount step")
def proceed_amount(reward_page):
    reward_page.next_step()


@when("I confirm the withdrawal summary")
def confirm_summary(reward_page):
    reward_page.confirm_and_continue()


@when(
    parsers.parse(
        'I fill the withdrawal identity form with ID "{id_number}" bank "{bank}" account "{account}"'
    )
)
def fill_identity(reward_page, id_number, bank, account):
    reward_page.fill_id_number(id_number)
    reward_page.select_bank(bank)
    reward_page.fill_bank_account(account)


@when(parsers.parse('I enter the withdrawal ID number "{id_number}"'))
def enter_withdrawal_id(reward_page, id_number):
    reward_page.fill_id_number(id_number)


@when("I upload my ID card photos")
def upload_id_photos(reward_page):
    reward_page.upload_id_photos()


@when("I agree to the withdrawal terms")
def agree_terms(reward_page):
    reward_page.agree_terms()


@when("I submit the withdrawal application")
def submit_withdrawal(reward_page):
    reward_page.submit_withdrawal()


# --- Collection (查收) flow -------------------------------------------------

@when("I click collect on the awaiting withdrawal")
def click_collect(reward_page):
    reward_page.collect_button().click()


@when("I advance through the collection reminder")
def advance_reminder(reward_page):
    reward_page.collection_next()


@when("I advance through the collection preview")
def advance_preview(reward_page):
    reward_page.collection_next()


@when(parsers.parse('I verify collection with ID "{id_number}"'))
def verify_collection(reward_page, id_number):
    reward_page.fill_collection_id(id_number)
    reward_page.confirm_collection()


# --- Assertions ------------------------------------------------------------

@then("I should see the reward dashboard")
def should_see_reward_dashboard(reward_page):
    expect(reward_page.heading()).to_be_visible(timeout=5_000)


@then("the apply-withdrawal button should be disabled")
def apply_button_disabled(reward_page):
    expect(reward_page.apply_withdrawal_button()).to_be_disabled(timeout=5_000)


@then("I should see the empty reward history")
def should_see_empty_history(reward_page):
    expect(reward_page.history_empty_state()).to_be_visible(timeout=5_000)


@then("the submit-withdrawal button should be disabled")
def submit_withdrawal_disabled(reward_page):
    expect(reward_page.submit_button()).to_be_disabled(timeout=5_000)


@then("the submit-withdrawal button should be enabled")
def submit_withdrawal_enabled(reward_page):
    expect(reward_page.submit_button()).to_be_enabled(timeout=5_000)
