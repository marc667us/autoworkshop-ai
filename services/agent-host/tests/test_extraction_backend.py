"""The extraction backend adapter (ADR-015) and the secrecy of the key.

Two things are under test:

  1. **Selection.** No key means the local, zero-cost Ollama backend — the
     DEFAULT and the tested path, because ADR-012 requires the product to work
     with no key at all. A key means the hosted one.
  2. **The key never escapes.** Not into `describe()`, not into a result, not
     into a repr, and not into any source file in the package.

⚠️ THE DUMMY KEY IN THIS FILE IS NOT SHAPED LIKE A REAL ONE. It is deliberately
not prefixed `sgai-`, because `test_no_source_file_contains_a_real_key_prefix`
scans every file in the service — this one included — and a realistic-looking
placeholder is exactly the thing that trains people to ignore a gitleaks hit.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.config import Settings
from app.extraction import (
    HostedScrapeGraphBackend,
    LocalOllamaBackend,
    extract,
    select_backend,
)

SERVICE_ROOT = Path(__file__).resolve().parent.parent

# A dummy value that could never be mistaken for a credential.
#
# ⚠️ IT CONTAINS NO ENGLISH WORDS, ON PURPOSE. The substring test below rejects
# any 4-character fragment of the key appearing in `describe()`. A friendly
# placeholder like "...-credential-..." shares "cred" with the word "credit" in
# the description and fails on a collision that proves nothing — which would
# train the next person to loosen a test that is actually doing its job.
_DUMMY_KEY = "zzz9qqq8www7vvv6uuu5ttt4"


# --------------------------------------------------------------------------
# Selection
# --------------------------------------------------------------------------


def test_no_key_selects_the_LOCAL_backend(settings: Settings):
    """THE DEFAULT AND THE SUPPORTED PATH. Zero cost, per ADR-012."""
    assert settings.scrapegraph_api_key == ""

    backend = select_backend(settings)

    assert isinstance(backend, LocalOllamaBackend)
    assert backend.name == "local-ollama"
    assert backend.is_configured() is True


def test_a_key_selects_the_HOSTED_backend():
    cfg = Settings(scrapegraph_api_key=_DUMMY_KEY, scrape_allowlist="parts.example.com")

    backend = select_backend(cfg)

    assert isinstance(backend, HostedScrapeGraphBackend)
    assert backend.name == "hosted-scrapegraph"
    assert backend.is_configured() is True


@pytest.mark.parametrize("blank", ["", "   ", "\t", "\n"])
def test_a_blank_key_is_treated_as_absent(blank):
    """A var set to whitespace is unconfigured, not "configured with nothing".

    `SCRAPEGRAPH_API_KEY="   "` is truthy in Python. Without an explicit strip
    it would select the hosted backend and fail every call on a garbage
    credential, which reads as a provider outage rather than the typo it is.
    """
    cfg = Settings(scrapegraph_api_key=blank)

    assert isinstance(select_backend(cfg), LocalOllamaBackend)
    assert HostedScrapeGraphBackend(cfg).is_configured() is False


def test_the_key_comes_only_from_the_environment(monkeypatch):
    """`Settings` reads `SCRAPEGRAPH_API_KEY`; nothing else supplies it."""
    monkeypatch.setenv("SCRAPEGRAPH_API_KEY", _DUMMY_KEY)

    assert Settings().scrapegraph_api_key == _DUMMY_KEY

    monkeypatch.delenv("SCRAPEGRAPH_API_KEY", raising=False)
    assert Settings().scrapegraph_api_key == ""


def test_the_default_is_empty_so_the_product_works_with_no_key():
    """ADR-012: zero cost must be a complete, working configuration."""
    assert Settings.model_fields["scrapegraph_api_key"].default == ""


# --------------------------------------------------------------------------
# The key must never be rendered
# --------------------------------------------------------------------------


def test_describe_leaks_no_substring_of_the_key():
    """`describe()` says a key is set. It does not say what it is.

    Every substring of length >= 4 is checked, so a "helpful" prefix or suffix
    (`sgai-1234…`, `…cdef`) fails this test rather than shipping.
    """
    cfg = Settings(scrapegraph_api_key=_DUMMY_KEY)
    described = HostedScrapeGraphBackend(cfg).describe()

    # The leak checks come FIRST so that a failure reports the security problem
    # rather than a wording mismatch that happens to be noticed on the way.
    assert _DUMMY_KEY not in described
    for size in range(4, len(_DUMMY_KEY) + 1):
        for start in range(0, len(_DUMMY_KEY) - size + 1):
            fragment = _DUMMY_KEY[start : start + size]
            assert fragment not in described, f"describe() leaked {fragment!r}"

    assert "configured" in described.lower()


def test_local_describe_names_the_backend_and_says_zero_cost(settings: Settings):
    described = LocalOllamaBackend(settings).describe()

    assert "ollama" in described.lower()
    assert "zero cost" in described.lower()


def test_the_key_never_reaches_a_discovery_result(monkeypatch):
    """Nothing the caller receives contains the credential."""
    from app.schemas import ScrapeRequest
    from app.skills.supplier_discovery import discover_suppliers

    cfg = Settings(
        scrapegraph_api_key=_DUMMY_KEY,
        scrape_allowlist="parts.example.com",
        scrape_min_interval_seconds=0.0,
    )
    # Force the hosted backend to fail, which is the path most likely to want
    # to explain itself with the key in hand.
    monkeypatch.setattr(
        "app.extraction.HostedScrapeGraphBackend.extract", lambda self, p, h: None
    )

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=cfg,
        fetcher=lambda url: (url, "<html><body>x</body></html>"),
    )

    assert _DUMMY_KEY not in result.model_dump_json()
    assert result.extraction_backend == "hosted-scrapegraph"


# --------------------------------------------------------------------------
# The backend choice is visible ONLY through the explicit field
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("key", "expected_backend"),
    [("", "local-ollama"), (_DUMMY_KEY, "hosted-scrapegraph")],
)
def test_the_schema_is_identical_whichever_backend_runs(monkeypatch, key, expected_backend):
    """Swapping backends changes one field and nothing else.

    Both are forced to return the same payload, so any difference in the result
    would be the adapter leaking its identity into the data.
    """
    from app.schemas import ScrapeRequest
    from app.skills.supplier_discovery import discover_suppliers

    payload = {"suppliers": [{"name": "S1", "city": "Accra"}], "parts": []}
    monkeypatch.setattr(
        "app.extraction.LocalOllamaBackend.extract", lambda self, p, h: payload
    )
    monkeypatch.setattr(
        "app.extraction.HostedScrapeGraphBackend.extract", lambda self, p, h: payload
    )

    cfg = Settings(
        scrapegraph_api_key=key,
        scrape_allowlist="parts.example.com",
        scrape_min_interval_seconds=0.0,
    )
    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=cfg,
        fetcher=lambda url: (url, "<html><body>x</body></html>"),
    )

    assert result.extraction_backend == expected_backend
    # Everything else is byte-identical between the two runs.
    body = result.model_dump()
    body.pop("extraction_backend")
    assert body == {
        "suppliers": [
            {
                "name": "S1",
                "country": None,
                "city": "Accra",
                "website": None,
                "contact": None,
                "source_url": "https://parts.example.com/x",
            }
        ],
        "parts": [],
        "source_url": "https://parts.example.com/x",
        "source": "model",
        "notes": "Extracted 1 supplier(s) and 0 part(s).",
    }


def test_hosted_backend_without_a_key_extracts_nothing():
    """A misconstructed hosted backend refuses rather than calling out."""
    assert HostedScrapeGraphBackend(Settings()).extract("p", "<html></html>") is None


def test_extract_facade_returns_none_on_empty_html(settings: Settings):
    assert extract("prompt", "   ", settings=settings) is None


# --------------------------------------------------------------------------
# Source hygiene — the repository is public
# --------------------------------------------------------------------------


def test_no_source_file_contains_a_real_key_prefix():
    """No file in this service may contain the `sgai-` credential prefix.

    gitleaks scans history on every push; a key committed once is compromised
    for good. This asserts the state of the tree rather than trusting review.

    The pattern requires the prefix PLUS a long random-looking suffix, which is
    what a credential actually is. Matching the bare prefix instead flagged the
    comments that document this very rule — a scanner whose only hits are the
    prose warning against it gets switched off, so it must match keys and not
    discussions of keys.
    """
    pattern = re.compile("sgai" + r"-[A-Za-z0-9_]{8,}", re.IGNORECASE)
    offenders: list[str] = []

    # Only OUR files. Walking the whole service root descends into `.venv` —
    # tens of thousands of third-party files — and cost 20 seconds to filter
    # them out afterwards. The vendored dependencies are not what this repo
    # commits, so they are not what this test is about.
    candidates = [
        path
        for directory in ("app", "tests")
        for path in (SERVICE_ROOT / directory).rglob("*")
    ] + list(SERVICE_ROOT.glob("*"))

    for path in sorted(set(candidates)):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        if path.suffix.lower() not in {".py", ".toml", ".md", ".txt", ".cfg", ".ini"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line_no, line in enumerate(text.splitlines(), 1):
            if pattern.search(line):
                offenders.append(f"{path.relative_to(SERVICE_ROOT)}:{line_no}")

    assert not offenders, f"a ScrapeGraph key prefix appears in source: {offenders}"


def test_no_source_file_assigns_a_literal_to_the_key():
    """The key is read from config — never assigned a literal anywhere.

    Catches `scrapegraph_api_key="..."` and `SCRAPEGRAPH_API_KEY = "..."` with a
    credential-shaped value, including as a default argument. The empty-string
    default in `Settings` is the only permitted assignment.

    COMMENTS ARE SCANNED TOO — a key pasted into a comment is just as leaked as
    one in code. What keeps that from flagging prose is the shape of the VALUE:
    it must contain a non-whitespace character and be at least 8 long. That lets
    a comment illustrate a blank or whitespace value (which is what the
    fail-closed behaviour is about) while still catching a real 40-character
    credential anywhere in the file.

    ⚠️ THE ANNOTATED FORM IS THE ONE THAT GETS MISSED. A first version of this
    scanner used a single `name [:=] "value"` pattern and sailed straight past
    `scrapegraph_api_key: str = "..."` — the `: str ` between the name and the
    `=` defeated it — so an injected 26-character literal in `config.py` was
    reported CLEAN. Every form is matched explicitly now, and each one is
    re-verified by injection.
    """
    patterns = (
        # `name = "..."` and `name: str = "..."` (annotated or not),
        # including a default argument in a signature.
        re.compile(
            r"""(scrapegraph_api_key)\s*(?::\s*[^=\n]+?)?=\s*["']([^"']+)["']""",
            re.IGNORECASE,
        ),
        # `"scrapegraph_api_key": "..."` in a dict literal.
        re.compile(
            r"""["'](scrapegraph_api_key)["']\s*:\s*["']([^"']+)["']""",
            re.IGNORECASE,
        ),
    )
    offenders: list[str] = []

    for path in sorted((SERVICE_ROOT / "app").rglob("*.py")):
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for pattern in patterns:
                match = pattern.search(line)
                if match and match.group(2).strip() and len(match.group(2)) >= 8:
                    # The message REDACTS the value: a test that finds a leaked
                    # credential must not be the thing that prints it into CI
                    # logs.
                    offenders.append(f"{path.name}:{line_no}: {match.group(1)}=<redacted>")
                    break

    assert not offenders, f"a literal is assigned to the key: {offenders}"
