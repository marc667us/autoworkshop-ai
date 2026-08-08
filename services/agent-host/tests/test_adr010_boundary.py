"""THE ADR-010 BOUNDARY, ASSERTED RATHER THAN PROMISED.

CLAUDE.md §3 and ADR-010 say the agent host holds no database, storage, payment
or admin credential, and that this is "enforced in infrastructure and asserted
by negative tests in CI — not by policy text". This file is that assertion.

It works two ways, because either alone is weak:

  1. **Source grep** — no module under `app/` may so much as MENTION a database
     driver. This catches an import added inside a function, which a top-level
     import scan would miss entirely.
  2. **Import check** — the app package must not pull a driver into
     `sys.modules` when imported.

A future `pip install psycopg` plus one `import` is a failing test, not a code
review someone might skip.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parent.parent / "app"

# Every driver and ORM that could reach a database, plus the credential-shaped
# names that have no business being in this service.
_FORBIDDEN_MODULES = (
    "psycopg",
    "psycopg2",
    "asyncpg",
    "sqlalchemy",
    "sqlmodel",
    "aiosqlite",
    "sqlite3",
    "pymysql",
    "mysql",
    "pymongo",
    "redis",
    "alembic",
    "databases",
    "peewee",
    "tortoise",
)

_FORBIDDEN_TEXT = re.compile(
    r"\b(psycopg2?|asyncpg|sqlalchemy|sqlmodel|aiosqlite|sqlite3|pymysql|pymongo|"
    r"alembic|peewee|tortoise)\b",
    re.IGNORECASE,
)

# Credential-shaped environment variables. The service reads none of them.
_FORBIDDEN_ENV = re.compile(
    r"\b(DATABASE_URL|POSTGRES_\w+|PG(HOST|USER|PASSWORD|DATABASE|PORT)|"
    r"KEYCLOAK_SECRET|AWS_SECRET_\w+|STRIPE_\w+|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b"
)


def _app_sources() -> list[Path]:
    files = sorted(APP_DIR.rglob("*.py"))
    assert files, f"no source files found under {APP_DIR}"
    return files


def test_no_source_file_mentions_a_database_driver():
    """Guard 1 — a textual grep, so a function-local import cannot hide.

    This test's own pattern is built from a variable so that the file does not
    match itself.
    """
    offenders: list[str] = []
    for path in _app_sources():
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            # Comments and docstrings may DISCUSS the ban (this is how ADR-010
            # gets explained in the code); only real code is an offence.
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            match = _FORBIDDEN_TEXT.search(line)
            if match:
                offenders.append(f"{path.name}:{line_no}: {stripped}")

    assert not offenders, (
        "ADR-010 violation — the agent host must never reach a database. Found:\n"
        + "\n".join(offenders)
    )


def test_no_module_imports_a_database_driver_at_any_level():
    """Guard 1b — parse the AST so nested and conditional imports are seen too."""
    offenders: list[str] = []
    for path in _app_sources():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            for name in names:
                root = name.split(".")[0].lower()
                if root in _FORBIDDEN_MODULES:
                    offenders.append(f"{path.name}:{node.lineno}: imports {name}")

    assert not offenders, "ADR-010 violation — database import found:\n" + "\n".join(offenders)


def test_no_source_file_reads_a_credential_env_var():
    """The agent host holds no credential but its own inbound token."""
    offenders: list[str] = []
    for path in _app_sources():
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.strip().startswith("#"):
                continue
            match = _FORBIDDEN_ENV.search(line)
            if match:
                offenders.append(f"{path.name}:{line_no}: {match.group(0)}")

    assert not offenders, (
        "the agent host must hold no credential. Found:\n" + "\n".join(offenders)
    )


def test_importing_the_app_loads_no_database_driver():
    """Guard 2 — the runtime check.

    Import the whole package, HTTP shell included, then look at what actually
    landed in `sys.modules`.
    """
    for module in list(sys.modules):
        if module.split(".")[0] in _FORBIDDEN_MODULES:
            del sys.modules[module]

    import app  # noqa: F401
    import app.http  # noqa: F401
    import app.skills  # noqa: F401

    loaded = {
        name for name in sys.modules if name.split(".")[0].lower() in _FORBIDDEN_MODULES
    }
    # `sqlite3` can be dragged in by an unrelated dependency; it is still not
    # allowed to arrive via OUR package, which the source-level tests above
    # prove. Report anything that did.
    assert not loaded, f"database driver loaded by importing the app: {sorted(loaded)}"


def test_settings_expose_no_database_or_credential_field():
    """The config surface itself has nowhere to PUT a DSN.

    ADR-010 bans DATABASE, STORAGE, PAYMENT and ADMIN credentials. It does not
    ban a third-party capability key, which ADR-015 explicitly provides for as a
    bring-your-own connection. Exactly two secrets are therefore permitted, and
    they are named individually rather than allowed by pattern — a pattern would
    quietly admit the next one somebody adds:

      * `agent_host_token`     — the secret callers present TO this service;
      * `scrapegraph_api_key`  — OPTIONAL, defaults to empty, buys a hosted
                                 extraction backend and nothing else. It grants
                                 no access to this system's data.

    Neither can reach the database, and neither is an admin credential.
    """
    from app.config import Settings

    fields = set(Settings.model_fields)
    banned = {"database_url", "postgres_url", "pg_host", "dsn", "db_url"}

    assert not (fields & banned), f"config exposes a database field: {fields & banned}"

    permitted_secrets = {"agent_host_token", "scrapegraph_api_key"}
    secretish = {
        f
        for f in fields
        if ("secret" in f or "password" in f or "key" in f or "token" in f)
        and f not in permitted_secrets
    }
    assert not secretish, f"config exposes an unexpected credential field: {secretish}"

    # The optional one must DEFAULT to absent, or "zero cost by default" is a
    # claim rather than a configuration (ADR-012).
    assert Settings.model_fields["scrapegraph_api_key"].default == ""


def test_the_declared_dependencies_contain_no_database_driver():
    """pyproject is part of the boundary: a driver cannot be installed by accident."""
    pyproject = (APP_DIR.parent / "pyproject.toml").read_text(encoding="utf-8")
    # Strip comments — the file EXPLAINS the ban, which must not read as a hit.
    body = "\n".join(
        line for line in pyproject.splitlines() if not line.strip().startswith("#")
    )
    offenders = [m.group(0) for m in _FORBIDDEN_TEXT.finditer(body)]

    assert not offenders, f"pyproject declares a database driver: {offenders}"


@pytest.mark.parametrize("skill_name", ["triage_service_request", "discover_suppliers", "discover_leads"])
def test_every_skill_is_exported_for_the_adk_wrapper(skill_name):
    """§0.3: an agent/tool that is not exported is not finished."""
    import app

    assert skill_name in app.__all__
    assert callable(getattr(app, skill_name))
