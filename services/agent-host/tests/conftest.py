"""Shared fixtures.

Every test in this suite is hermetic: no network, no model, no database (there
is nothing to connect to anyway). Fetching and extraction are injected, which
is the payoff of the skills being pure functions.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# The service root, so `import app` works when pytest is run from here without
# the package being installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings, get_settings  # noqa: E402
from app.schemas import ServiceRequestInput, Technician  # noqa: E402
from app.scraping import reset_rate_limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_settings_cache():
    """Stop one test's environment leaking into the next.

    `get_settings` is deliberately cached in production; a cached value that
    survives a monkeypatched env var would make these tests assert nothing.
    """
    get_settings.cache_clear()
    reset_rate_limiter()
    yield
    get_settings.cache_clear()
    reset_rate_limiter()


@pytest.fixture
def settings() -> Settings:
    """Settings with a populated allowlist and a rate limit that does not sleep."""
    return Settings(
        agent_host_token="test-token",
        scrape_allowlist="parts.example.com,.suppliers.example.org",
        scrape_min_interval_seconds=0.0,
        ollama_base_url="http://localhost:11434",
    )


@pytest.fixture
def technicians() -> list[Technician]:
    """A small roster with distinct specialisms and distinct workloads."""
    return [
        Technician(id="tech-1", display_name="Ama Boateng", skills=["brakes", "mechanical"], open_jobs=3),
        Technician(id="tech-2", display_name="Kofi Mensah", skills=["auto-electrics", "diagnostics"], open_jobs=1),
        Technician(id="tech-3", display_name="Yaw Owusu", skills=["brakes", "suspension"], open_jobs=1),
    ]


@pytest.fixture
def brake_request(technicians) -> ServiceRequestInput:
    return ServiceRequestInput(
        complaint="There is a grinding noise from the front brakes and the pedal feels soft.",
        vehicle_description="2015 Toyota Hilux 2.4 D-4D",
        registration="GR-1234-20",
        technicians=technicians,
    )


@pytest.fixture
def unreachable_llm():
    """An LLM callable that behaves exactly as a dead Ollama does: returns None."""

    def _llm(_prompt: str):
        return None

    return _llm


@pytest.fixture
def no_db_env(monkeypatch):
    """Assert-friendly: prove nothing in the app reads a DB env var."""
    for var in ("DATABASE_URL", "PGHOST", "PGPASSWORD", "POSTGRES_URL"):
        monkeypatch.setenv(var, "postgres://should-never-be-read/x")
    yield
    for var in ("DATABASE_URL", "PGHOST", "PGPASSWORD", "POSTGRES_URL"):
        os.environ.pop(var, None)
