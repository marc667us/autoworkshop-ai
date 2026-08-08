"""Configuration for the agent host.

Every value is injected from the environment. There are no hardcoded paths and
— by design — no credential of any kind beyond `AGENT_HOST_TOKEN`, which is the
shared secret callers present to reach this service. There is no database URL,
no storage key and no payment key, because this service has no business holding
one (CLAUDE.md §3 / ADR-010).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings, read from the process environment.

    Field names map to upper-case environment variables: `ollama_base_url` is
    read from `OLLAMA_BASE_URL`, and so on.
    """

    model_config = SettingsConfigDict(
        env_file=None,  # the environment is the only source; no file paths.
        case_sensitive=False,
        extra="ignore",
    )

    # --- LLM ---------------------------------------------------------------
    ollama_base_url: str = "http://localhost:11434"
    ollama_text_model: str = "llama3.2"
    # A local 3B model on CPU is not fast. This bound is what stops a slow
    # model from holding a reception desk's request open indefinitely; when it
    # trips, triage degrades to rules rather than failing.
    llm_timeout_seconds: float = 60.0

    # --- Auth --------------------------------------------------------------
    # EMPTY MEANS REFUSE EVERYTHING. This default is not a convenience for
    # local development — it is the fail-closed posture. See `app/http.py`.
    agent_host_token: str = ""

    # --- Extraction backend (ADR-015, bring-your-own-connection) -----------
    # 🔴 OPTIONAL, AND NEVER A LITERAL IN SOURCE. Read from the environment
    # only. The repository is public and gitleaks scans history, so no key
    # value — nor any placeholder shaped like one — belongs in a .py file, a
    # test, a docstring or a default argument.
    #
    # EMPTY IS THE SUPPORTED DEFAULT: with no key the service uses local Ollama
    # and costs nothing, which ADR-012 requires. Setting it opts in to
    # ScrapeGraph's hosted API, which bills credits — the owner's decision
    # alone. See `app/extraction.py`.
    scrapegraph_api_key: str = ""

    # --- Scraping safety ---------------------------------------------------
    # Comma-separated hostnames. An entry may be an exact host
    # ("parts.example.com") or a dot-prefixed suffix (".example.com") that
    # matches that domain and its subdomains. Empty means scraping is refused
    # outright — again, fail closed.
    scrape_allowlist: str = ""
    scrape_timeout_seconds: float = 20.0
    # A bounded read. Without this, one hostile (or merely enormous) page can
    # exhaust the host's memory.
    scrape_max_bytes: int = 2_000_000
    # Minimum gap between two fetches of the SAME host, in seconds. This is the
    # politeness bound; it is per-host, so unrelated suppliers do not queue
    # behind each other.
    scrape_min_interval_seconds: float = 2.0
    # A real, descriptive User-Agent. A scraper that lies about who it is gives
    # a site operator no way to contact us or to block us cleanly.
    scrape_user_agent: str = (
        "AutoWorkshopAI-AgentHost/0.1 (+https://github.com/marc667us/autoworkshop-ai)"
    )
    # robots.txt is honoured by default. The flag exists so a site the workshop
    # owns (or has written permission for) can be fetched, not as a casual
    # opt-out.
    scrape_respect_robots: bool = True

    @property
    def allowlist_hosts(self) -> tuple[str, ...]:
        """The allowlist, normalised to lower-case with blanks dropped.

        Kept as a parsed property rather than a `list[str]` field because
        pydantic-settings attempts JSON decoding on complex-typed fields, which
        turns a perfectly ordinary `A,B` env var into a startup crash.
        """
        return tuple(
            entry.strip().lower().rstrip(".")
            for entry in self.scrape_allowlist.split(",")
            if entry.strip()
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton.

    Cached so that a request does not re-read the environment. Tests that
    manipulate the environment must call `get_settings.cache_clear()`.
    """
    return Settings()


__all__ = ["Settings", "get_settings"]
