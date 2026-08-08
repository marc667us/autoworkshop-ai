"""A thin Ollama client.

Deliberately thin: a plain `httpx` POST to `/api/generate`. There is no agent
loop here and no framework. Per ADR-018 and the owner's standing instruction,
this project does not build agent loops on ADK / LangChain / LangGraph /
AutoGen / CrewAI. (scrapegraph-ai drags LangChain in as its own internal
dependency, which is unavoidable and fine — we simply do not build on it.)

THE CONTRACT OF THIS MODULE IS THAT IT NEVER RAISES. Every function returns
`None` on any failure. A workshop must keep running when a local model is down,
so a dead LLM has to degrade to rules, never break the desk.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from .config import Settings, get_settings

logger = logging.getLogger(__name__)


def generate(
    prompt: str,
    *,
    system: str | None = None,
    settings: Settings | None = None,
    json_mode: bool = False,
) -> str | None:
    """Ask the local model for a completion. Returns None on ANY failure.

    "Any failure" means: connection refused, DNS failure, timeout, non-200,
    malformed body, or the model simply not being pulled. The caller is not
    asked to distinguish them because the caller's response to all of them is
    identical — fall back.
    """
    cfg = settings or get_settings()

    payload: dict[str, Any] = {
        "model": cfg.ollama_text_model,
        "prompt": prompt,
        "stream": False,
        # temperature 0: triage should be reproducible. The same complaint
        # producing a different priority on a retry is not a feature.
        "options": {"temperature": 0},
    }
    if system:
        payload["system"] = system
    if json_mode:
        # Ollama constrains decoding to valid JSON. It does not guarantee the
        # SHAPE is right, so callers still validate — see `generate_json`.
        payload["format"] = "json"

    try:
        response = httpx.post(
            f"{cfg.ollama_base_url.rstrip('/')}/api/generate",
            json=payload,
            timeout=cfg.llm_timeout_seconds,
        )
        if response.status_code != 200:
            logger.warning(
                "ollama returned %s for model %s", response.status_code, cfg.ollama_text_model
            )
            return None
        body = response.json()
    except Exception as exc:  # noqa: BLE001 - a dead LLM must never propagate.
        logger.warning("ollama unreachable (%s): %s", type(exc).__name__, exc)
        return None

    text = body.get("response")
    if not isinstance(text, str) or not text.strip():
        return None
    return text


def generate_json(
    prompt: str,
    *,
    system: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    """Ask for a JSON object and parse it. Returns None on any failure.

    Returns None rather than a partial dict when the body is not a JSON
    *object*: a bare list or string means the model misunderstood the task, and
    guessing at it produces confident nonsense.
    """
    raw = generate(prompt, system=system, settings=settings, json_mode=True)
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("ollama returned non-JSON despite format=json")
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def health(settings: Settings | None = None) -> bool:
    """Is the model server answering at all? Never raises."""
    cfg = settings or get_settings()
    try:
        response = httpx.get(
            f"{cfg.ollama_base_url.rstrip('/')}/api/tags",
            timeout=min(5.0, cfg.llm_timeout_seconds),
        )
        return response.status_code == 200
    except Exception:  # noqa: BLE001
        return False


__all__ = ["generate", "generate_json", "health"]
