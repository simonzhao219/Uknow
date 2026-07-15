"""route_guards.feature is covered entirely by shared steps in common_steps.py."""

from pytest_bdd import scenarios

from steps.common_steps import *  # noqa: F401,F403

scenarios("route_guards.feature")
