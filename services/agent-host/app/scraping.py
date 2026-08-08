"""Fetching the open web, safely.

This module is the ONLY thing in the service that makes an outbound request to
a caller-supplied address, and it is written on the assumption that the URL is
hostile.

Four independent guards, in order:

1. **Allowlist.** The host must be one the operator configured. Not a pattern
   the caller supplies — a value from the environment.
2. **Resolved-IP check.** The hostname is RESOLVED and every address it resolves
   to must be public. Checking the string would be decorative: `db.internal`,
   `metadata.evil.com` and any domain an attacker controls can all point at
   127.0.0.1 or 169.254.169.254. `tests/test_scraping_safety.py` proves this
   path with a hostname that looks public and resolves private.
3. **robots.txt.**
4. **Bounded** timeout, response size, and per-host rate.

⚠️ REDIRECTS ARE NOT FOLLOWED AUTOMATICALLY. An allowlisted host answering
`302 -> http://127.0.0.1/` would walk straight through guards 1 and 2, because
those ran against the ORIGINAL url. Each hop is re-validated from scratch.

Note also that scrapegraph-ai is never handed a URL. It is handed HTML that
this module already fetched, so its own fetcher can never run and can never
bypass any of the above.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import threading
import time
import urllib.robotparser
from urllib.parse import urlparse, urlunparse

import httpx

from .config import Settings, get_settings

logger = logging.getLogger(__name__)

# The cloud metadata endpoints. `169.254.169.254` is already caught by the
# link-local rule; it is named explicitly because it is the single address most
# worth being unable to reach, and an explicit name survives a refactor of the
# range logic.
_BLOCKED_EXPLICIT = frozenset(
    {
        ipaddress.ip_address("169.254.169.254"),  # AWS/GCP/Azure IMDS
        ipaddress.ip_address("100.100.100.200"),  # Alibaba metadata
        ipaddress.ip_address("fd00:ec2::254"),  # AWS IMDS over IPv6
    }
)

_ALLOWED_SCHEMES = frozenset({"http", "https"})

# Per-host timestamp of the last fetch, for the politeness bound. Guarded by a
# lock because the FastAPI shell serves requests on a thread pool.
_last_fetch: dict[str, float] = {}
_last_fetch_lock = threading.Lock()

_MAX_REDIRECTS = 3


class ScrapeRefused(Exception):
    """The request was refused by a safety guard.

    Carries a message intended to be shown to the operator: "why did it refuse"
    is the only useful thing to say when it does.
    """


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Is this address one we must never connect to?

    Deliberately a denylist of *categories* rather than of ranges: every
    category below is a property of the address object, so a range added to
    RFC1918 or the IANA special registry is caught without a code change.
    """
    # An IPv4 address smuggled inside IPv6 (::ffff:127.0.0.1) must be judged on
    # the IPv4 address it actually is.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped

    if ip in _BLOCKED_EXPLICIT:
        return True
    return bool(
        ip.is_private  # RFC1918 10/8, 172.16/12, 192.168/16 (and fc00::/7)
        or ip.is_loopback  # 127.0.0.0/8, ::1
        or ip.is_link_local  # 169.254.0.0/16, fe80::/10
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified  # 0.0.0.0
    )


def _resolve(host: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve a hostname to every address it answers with.

    EVERY address is checked, not just the first. A host with one public A
    record and one private one is not half-safe.
    """
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ScrapeRefused(f"could not resolve host {host!r}: {exc}") from exc

    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for info in infos:
        sockaddr = info[4]
        try:
            addresses.append(ipaddress.ip_address(sockaddr[0]))
        except ValueError:  # pragma: no cover - getaddrinfo returning a non-IP
            continue
    if not addresses:
        raise ScrapeRefused(f"host {host!r} resolved to no usable address")
    return addresses


def _host_allowed(host: str, settings: Settings) -> bool:
    """Exact host match, or a dot-prefixed allowlist entry matching a subdomain.

    Suffix matching requires the leading dot precisely so that an entry like
    `.example.com` cannot be satisfied by `notexample.com`.
    """
    host = host.lower().rstrip(".")
    for entry in settings.allowlist_hosts:
        if entry.startswith("."):
            if host == entry[1:] or host.endswith(entry):
                return True
        elif host == entry:
            return True
    return False


def validate_url(url: str, settings: Settings | None = None) -> tuple[str, str]:
    """Run guards 1 and 2. Returns `(normalised_url, host)` or raises.

    Raises `ScrapeRefused` with a message that says which guard refused and
    why.
    """
    cfg = settings or get_settings()

    parsed = urlparse(url.strip())
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise ScrapeRefused(
            f"scheme {parsed.scheme!r} is not allowed; only http and https are fetched"
        )
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise ScrapeRefused("the url has no hostname")

    # Guard 1 — the operator's allowlist.
    if not cfg.allowlist_hosts:
        raise ScrapeRefused(
            "scraping is refused: SCRAPE_ALLOWLIST is unset, so no host is permitted"
        )
    if not _host_allowed(host, cfg):
        raise ScrapeRefused(
            f"host {host!r} is not in SCRAPE_ALLOWLIST; "
            f"allowed: {', '.join(cfg.allowlist_hosts)}"
        )

    # Guard 2 — what the name actually POINTS AT.
    for ip in _resolve(host):
        if _is_blocked_ip(ip):
            raise ScrapeRefused(
                f"host {host!r} resolves to {ip}, which is a private, loopback, "
                "link-local or otherwise internal address; refused to prevent "
                "server-side request forgery"
            )

    normalised = urlunparse(parsed._replace(fragment=""))
    return normalised, host


def robots_allows(url: str, settings: Settings | None = None) -> bool:
    """Guard 3 — does the site's robots.txt permit our User-Agent here?

    robots.txt is fetched with `httpx` under our own timeout rather than via
    `RobotFileParser.read()`, which calls `urllib.request.urlopen` with NO
    timeout — an unbounded fetch inside a safety check is its own problem. Only
    the parsing comes from `urllib.robotparser`.

    A robots.txt that cannot be fetched is treated as ALLOW, which is the
    conventional reading (and what `RobotFileParser` itself does on a 404). A
    site that means to refuse can serve the file.
    """
    cfg = settings or get_settings()
    if not cfg.scrape_respect_robots:
        return True

    parsed = urlparse(url)
    robots_url = urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))
    parser = urllib.robotparser.RobotFileParser()

    try:
        response = httpx.get(
            robots_url,
            timeout=min(10.0, cfg.scrape_timeout_seconds),
            headers={"User-Agent": cfg.scrape_user_agent},
            follow_redirects=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.info("robots.txt unreachable at %s (%s); proceeding", robots_url, exc)
        return True

    if response.status_code in (401, 403):
        # An access-controlled robots.txt means "you are not welcome here".
        return False
    if response.status_code >= 400:
        return True

    parser.parse(response.text.splitlines())
    return parser.can_fetch(cfg.scrape_user_agent, url)


def _rate_limit(host: str, settings: Settings) -> None:
    """Guard 4a — sleep so that two fetches of one host are spaced out."""
    interval = settings.scrape_min_interval_seconds
    if interval <= 0:
        return
    with _last_fetch_lock:
        previous = _last_fetch.get(host)
        now = time.monotonic()
        if previous is not None:
            wait = interval - (now - previous)
            if wait > 0:
                time.sleep(min(wait, interval))
        _last_fetch[host] = time.monotonic()


def _read_bounded(response: httpx.Response, limit: int) -> str:
    """Guard 4b — read at most `limit` bytes, then stop.

    Streams and counts. A `Content-Length` header is a claim, not a bound, so
    the count is what actually stops the read.
    """
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > limit:
            chunks.append(chunk[: limit - (total - len(chunk))])
            logger.info("response truncated at %d bytes", limit)
            break
        chunks.append(chunk)
    return b"".join(chunks).decode("utf-8", errors="replace")


def fetch(url: str, settings: Settings | None = None) -> tuple[str, str]:
    """Fetch a page through every guard. Returns `(final_url, html)`.

    Raises `ScrapeRefused` if any guard refuses, at any redirect hop.
    """
    cfg = settings or get_settings()
    current = url

    for _hop in range(_MAX_REDIRECTS + 1):
        # Guards 1 + 2, re-run for EVERY hop. This is the whole reason
        # redirects are handled by hand.
        current, host = validate_url(current, cfg)

        if not robots_allows(current, cfg):
            raise ScrapeRefused(f"robots.txt at {host} disallows fetching {current}")

        _rate_limit(host, cfg)

        try:
            with httpx.stream(
                "GET",
                current,
                timeout=cfg.scrape_timeout_seconds,
                headers={
                    "User-Agent": cfg.scrape_user_agent,
                    "Accept": "text/html,application/xhtml+xml",
                },
                follow_redirects=False,
            ) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise ScrapeRefused(f"{current} redirected without a location")
                    # Resolve relative redirects against the current URL, then
                    # loop so the new target faces the guards from the top.
                    current = str(httpx.URL(current).join(location))
                    continue
                if response.status_code >= 400:
                    raise ScrapeRefused(
                        f"{current} returned HTTP {response.status_code}"
                    )
                html = _read_bounded(response, cfg.scrape_max_bytes)
                return current, html
        except ScrapeRefused:
            raise
        except httpx.HTTPError as exc:
            raise ScrapeRefused(f"could not fetch {current}: {exc}") from exc

    raise ScrapeRefused(f"too many redirects starting from {url}")


def reset_rate_limiter() -> None:
    """Clear the per-host clock. For tests only."""
    with _last_fetch_lock:
        _last_fetch.clear()


__all__ = [
    "ScrapeRefused",
    "fetch",
    "reset_rate_limiter",
    "robots_allows",
    "validate_url",
]
