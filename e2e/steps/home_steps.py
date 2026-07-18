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


@given(parsers.parse('a public listing "{name}" exists with description "{desc}"'))
def public_listing_exists(rest_mock, directory, name, desc):
    row = build_public_listing(name=name, description=desc)
    rest_mock.set_public_listing(row)
    directory[name] = row


@given(parsers.parse('no public listing exists for id "{listing_id}"'))
def no_public_listing(rest_mock, listing_id):
    rest_mock.set_public_listing(None)


# --- When ------------------------------------------------------------------


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
