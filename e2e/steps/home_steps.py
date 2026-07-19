"""Steps for the public directory: the home page listing/search
(`home_listings.feature`) and the provider detail page
(`service_provider_detail.feature`). Both read the `public_listings` view, so
they share the `rest_mock` and a per-scenario `directory` map (name -> row)
that lets later steps resolve a provider's id from its display name."""

import pytest
from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403  — I visit / see text / redirected
from mocks.supabase_rest_mock import build_public_listing

scenarios("home_listings.feature", "service_provider_detail.feature")


def _listing_id(index: int) -> str:
    return f"a0000000-0000-0000-0000-0000000000{index:02d}"


def _parse_names(names: str):
    return [part.strip().strip('"').strip() for part in names.split(",")]


# Subset of HomePage's built-in city→coordinate table, enough to drive the
# "sort by distance from me" behaviour deterministically.
_CITY_COORDS = {
    "台北市": {"latitude": 25.0330, "longitude": 121.5654},
    "高雄市": {"latitude": 22.6273, "longitude": 120.3014},
}


@pytest.fixture
def directory():
    """name -> public_listings row, shared across a scenario's steps."""
    return {}


# --- Given -----------------------------------------------------------------


@given(parsers.parse("the public directory lists providers {names}"))
def directory_lists(rest_mock, directory, names):
    rows = []
    for i, name in enumerate(_parse_names(names), start=1):
        row = build_public_listing(listing_id=_listing_id(i), name=name)
        directory[name] = row
        rows.append(row)
    rest_mock.set_public_listings(rows)


@given("the public directory has no listings")
def directory_empty(rest_mock, directory):
    rest_mock.set_public_listings([])


@given(parsers.parse('the public directory has a listing "{name}" in "{city}"'))
def directory_add_city_listing(rest_mock, directory, name, city):
    # Accumulates across steps, preserving insertion order (which HomePage keeps
    # as the default "most recent first" order until distance sort reorders it).
    row = build_public_listing(listing_id=_listing_id(len(directory) + 1), name=name, city=city)
    directory[name] = row
    rest_mock.set_public_listings(list(directory.values()))


@given(parsers.parse('my location is "{city}"'))
def my_location_is(context, city):
    context.grant_permissions(["geolocation"])
    context.set_geolocation(_CITY_COORDS[city])


@given("I am on a mobile-sized screen")
def on_mobile_screen(page):
    page.set_viewport_size({"width": 375, "height": 812})


@given("the public directory is temporarily failing")
def directory_failing(rest_mock):
    rest_mock.fail_public_listings()


@given(parsers.parse('a public listing "{name}" exists with description "{desc}"'))
def public_listing_exists(rest_mock, directory, name, desc):
    row = build_public_listing(name=name, description=desc)
    rest_mock.set_public_listing(row)
    directory[name] = row


@given(parsers.parse('no public listing exists for id "{listing_id}"'))
def no_public_listing(rest_mock, listing_id):
    rest_mock.set_public_listing(None)


# --- When ------------------------------------------------------------------


@when(parsers.parse('the public directory recovers with providers {names}'))
def directory_recovers(rest_mock, directory, names):
    rows = []
    for i, name in enumerate(_parse_names(names), start=1):
        row = build_public_listing(listing_id=_listing_id(i), name=name)
        directory[name] = row
        rows.append(row)
    # set_public_listings clears the pending failure installed by
    # fail_public_listings, so the retry button's refetch succeeds.
    rest_mock.set_public_listings(rows)


@when("I retry loading the directory")
def retry_directory(page):
    page.get_by_role("button", name="重新載入").click()


@then(parsers.parse('I should not see the text "{text}"'))
def should_not_see_text(page, text):
    expect(page.get_by_text(text)).to_have_count(0)


@when(parsers.parse('I search the directory for "{text}"'))
def search_directory(home_page, text):
    home_page.search(text)


@when("I clear the directory search and filters")
def clear_directory(home_page):
    home_page.clear_filters()


@when(parsers.parse('I open the listing card for "{name}"'))
def open_listing_card(home_page, directory, name):
    home_page.open_listing(directory[name]["id"])


@when("I open that listing's detail page")
def open_that_detail(page, directory):
    # These scenarios seed exactly one listing.
    row = next(iter(directory.values()))
    page.goto(f"/service-providers/{row['id']}")


# --- Then ------------------------------------------------------------------


@then(parsers.parse('I should see the listing card for "{name}"'))
def should_see_card(home_page, directory, name):
    expect(home_page.card(directory[name]["id"])).to_be_visible(timeout=5_000)


@then(parsers.parse('I should not see the listing card for "{name}"'))
def should_not_see_card(home_page, directory, name):
    expect(home_page.card(directory[name]["id"])).to_have_count(0)


@then(parsers.parse('I should be on the detail page for "{name}"'))
def on_detail_page(page, directory, name):
    page.wait_for_url(f"**/service-providers/{directory[name]['id']}", timeout=10_000)


@then(parsers.parse('the first listing should be "{name}"'))
def first_listing_should_be(home_page, name):
    expect(home_page.cards().first).to_contain_text(name, timeout=5_000)
