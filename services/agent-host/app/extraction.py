"""Structured extraction from already-fetched HTML — a bring-your-own adapter.

TWO BACKENDS, ONE CONTRACT (ADR-015, the shape of
`apps/api/src/notifications/mail-transport.ts`):

  * `LocalOllamaBackend` — scrapegraph-ai's `SmartScraperGraph` driven by the
    local Ollama server. **THE DEFAULT, AND ZERO COST.** ADR-012 makes zero
    cost a hard rule, so the product must be fully functional with no key
    configured at all. This is not a degraded stub — it is the supported path.
  * `HostedScrapeGraphBackend` — ScrapeGraph's hosted API. Opt-in, selected
    only when `SCRAPEGRAPH_API_KEY` is set. It bills credits, which is why it
    can never be the default.

Both return the same shape, so no caller can tell which ran except by reading
the explicit `extraction_backend` field on the result.

🔴 THE API KEY IS NEVER A LITERAL IN SOURCE. It is read from the environment
through `Settings` and nowhere else — no default argument, no test fixture, no
docstring example, no placeholder that resembles a real key. This repository is
public and gitleaks scans history on every push;
`tests/test_extraction_backend.py` asserts that no source file contains the
`sgai-` key prefix, and `describe()` is tested to leak no substring of the key.

⚠️ NEITHER BACKEND IS EVER GIVEN A URL. Both receive HTML that
`app/scraping.py` already fetched under the SSRF, robots, size and rate guards.
The hosted client's `extract()` takes `html=` for exactly this reason: handing
it `url=` would move fetching to a third party's network, where not one of this
service's guards applies.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any

from .config import Settings, get_settings

logger = logging.getLogger(__name__)


class ExtractionBackend(ABC):
    """One way of turning HTML plus a prompt into a dict."""

    #: Stable identifier reported to callers via `extraction_backend`.
    name: str = "unknown"

    @abstractmethod
    def is_configured(self) -> bool:
        """Can this backend actually run?"""

    @abstractmethod
    def describe(self) -> str:
        """For diagnostics. MUST NEVER include the key, or any part of it."""

    @abstractmethod
    def extract(self, prompt: str, html: str) -> dict[str, Any] | None:
        """Run one extraction. Returns None on any failure; never raises."""


def _coerce_payload(result: Any) -> dict[str, Any] | None:
    """Accept a dict, or a JSON string, and reject anything else.

    A bare list or a string that is not JSON means the model misunderstood the
    task; guessing at it produces confident nonsense.
    """
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        try:
            parsed = json.loads(result)
        except (ValueError, TypeError):
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


class LocalOllamaBackend(ExtractionBackend):
    """scrapegraph-ai's SmartScraperGraph over the local Ollama server.

    Zero marginal cost by construction: a local model over a local base URL.
    There is no branch here that could reach a paid provider.
    """

    name = "local-ollama"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def is_configured(self) -> bool:
        # Always available: it needs only a base URL, which has a working
        # default. Whether the server is actually UP is a runtime question, and
        # a down server degrades to `None` like any other failure.
        return bool(self._settings.ollama_base_url)

    def describe(self) -> str:
        return (
            f"local scrapegraph-ai via Ollama "
            f"({self._settings.ollama_text_model} at {self._settings.ollama_base_url}), zero cost"
        )

    def _graph_config(self) -> dict[str, Any]:
        return {
            "llm": {
                # scrapegraph-ai selects its provider from this `provider/model`
                # prefix; "ollama/" is what routes it to the local server.
                "model": f"ollama/{self._settings.ollama_text_model}",
                "base_url": self._settings.ollama_base_url,
                "temperature": 0,
                "format": "json",
                "model_tokens": 8192,
            },
            "verbose": False,
            "headless": True,
            "loader_kwargs": {},
        }

    def extract(self, prompt: str, html: str) -> dict[str, Any] | None:
        try:
            # Imported lazily: scrapegraph-ai pulls a large dependency tree, and
            # importing it at module scope would make `/health` and `/triage` —
            # the paths that must work when everything else is broken — pay for
            # it.
            from scrapegraphai.graphs import SmartScraperGraph
        except Exception as exc:  # noqa: BLE001
            logger.warning("scrapegraph-ai unavailable: %s", exc)
            return None

        try:
            graph = SmartScraperGraph(
                prompt=prompt,
                # HTML, not a URL. In scrapegraph-ai 2.1.6
                # `SmartScraperGraph.__init__` does
                # `input_key = "url" if source.startswith("http") else "local_dir"`,
                # so a non-URL source skips its fetching node entirely and our
                # guards remain the only way this service reaches the network.
                source=html,
                config=self._graph_config(),
            )
            return _coerce_payload(graph.run())
        except Exception as exc:  # noqa: BLE001
            logger.warning("local extraction failed (%s): %s", type(exc).__name__, exc)
            return None


class HostedScrapeGraphBackend(ExtractionBackend):
    """ScrapeGraph's hosted API. Opt-in, and it bills credits.

    Selected only when the operator has set a key. Never the default: ADR-012
    requires the product to work at zero cost, and spending is the owner's
    decision alone.
    """

    name = "hosted-scrapegraph"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def is_configured(self) -> bool:
        # `.strip()` matters: `SCRAPEGRAPH_API_KEY="   "` is truthy in Python,
        # so a whitespace-only value would otherwise select the hosted backend
        # and then fail every call with a garbage credential — presenting a
        # configuration mistake as a provider outage.
        return bool(self._settings.scrapegraph_api_key.strip())

    def describe(self) -> str:
        # 🔴 The key is NEVER rendered — not in full, and not as a prefix,
        # suffix or length. "A key is set" is the entire useful fact; anything
        # more is a leak into logs and diagnostics endpoints.
        return "hosted ScrapeGraph API (key configured, billed per credit)"

    def extract(self, prompt: str, html: str) -> dict[str, Any] | None:
        if not self.is_configured():
            return None
        try:
            from scrapegraph_py import ScrapeGraphAI
        except Exception as exc:  # noqa: BLE001
            logger.warning("scrapegraph-py unavailable: %s", exc)
            return None

        client = None
        try:
            client = ScrapeGraphAI(api_key=self._settings.scrapegraph_api_key.strip())
            # `html=`, never `url=` — see the module docstring. Fetching stays
            # behind this service's own guards.
            result = client.extract(prompt, html=html)

            if getattr(result, "status", None) != "success":
                logger.warning(
                    "hosted extraction returned %s: %s",
                    getattr(result, "status", "?"),
                    getattr(result, "error", None),
                )
                return None
            data = getattr(result, "data", None)
            if data is None:
                return None
            # `ExtractResponse.json_data` is the structured payload; `raw` is
            # the unparsed fallback.
            payload = _coerce_payload(getattr(data, "json_data", None))
            if payload is None:
                payload = _coerce_payload(getattr(data, "raw", None))
            return payload
        except Exception as exc:  # noqa: BLE001
            # Deliberately logs the exception TYPE and message only. A hosted
            # client can embed request details in a repr, and this service must
            # not be the thing that writes a key into a log line.
            logger.warning("hosted extraction failed (%s): %s", type(exc).__name__, exc)
            return None
        finally:
            if client is not None:
                try:
                    client.close()
                except Exception:  # noqa: BLE001 - closing must never mask the result
                    pass


def select_backend(settings: Settings | None = None) -> ExtractionBackend:
    """Choose the extraction backend. Local unless a key is configured.

    The whole selection rule, in one place: a key present means the operator
    opted in to the hosted API; no key means the zero-cost local path, which is
    fully supported rather than a fallback.
    """
    cfg = settings or get_settings()
    hosted = HostedScrapeGraphBackend(cfg)
    if hosted.is_configured():
        return hosted
    return LocalOllamaBackend(cfg)


def extract(
    prompt: str,
    html: str,
    *,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    """Run one extraction over pre-fetched HTML. Returns None on any failure.

    Never raises. A local model that is down, slow, or confused must degrade to
    an empty result with a note, because a discovery screen showing "nothing
    found, model unreachable" is fine and a 500 is not.
    """
    if not html.strip():
        return None
    return select_backend(settings).extract(prompt, html)


__all__ = [
    "ExtractionBackend",
    "HostedScrapeGraphBackend",
    "LocalOllamaBackend",
    "extract",
    "select_backend",
]
