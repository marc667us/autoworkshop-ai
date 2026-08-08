"""The scraping guards.

The headline test is `test_refuses_hostname_that_RESOLVES_to_a_private_ip`: a
guard that only inspects the string is decorative, because the attacker owns
the DNS record. These tests fake resolution rather than relying on a real
resolver, so they prove the guard consults resolution at all — and stay
hermetic.
"""

from __future__ import annotations

import socket

import pytest

from app.config import Settings
from app.scraping import ScrapeRefused, fetch, validate_url


def _fake_getaddrinfo(ip: str):
    """A resolver that answers every name with one chosen address."""

    def _resolver(host, port, *args, **kwargs):
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, port or 0))]

    return _resolver


# --------------------------------------------------------------------------
# Guard 2 — the resolved address. THE IMPORTANT ONE.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "private_ip",
    [
        "127.0.0.1",  # loopback
        "10.1.2.3",  # RFC1918
        "172.16.5.4",  # RFC1918
        "192.168.0.10",  # RFC1918
        "169.254.169.254",  # cloud metadata
        "0.0.0.0",  # unspecified
        "::1",  # IPv6 loopback
        "::ffff:127.0.0.1",  # IPv4 loopback smuggled inside IPv6
    ],
)
def test_refuses_hostname_that_RESOLVES_to_a_private_ip(
    settings: Settings, monkeypatch, private_ip
):
    """A perfectly innocent-looking ALLOWLISTED hostname pointing somewhere internal.

    `parts.example.com` is on the allowlist and its name gives nothing away —
    it passes any string-based check there is. The only thing that catches it
    is resolving the name and judging the ADDRESS.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(private_ip))

    with pytest.raises(ScrapeRefused) as excinfo:
        validate_url("https://parts.example.com/catalogue", settings)

    message = str(excinfo.value)
    assert "server-side request forgery" in message
    # The message must name the address, or an operator cannot act on it.
    assert private_ip.replace("::ffff:", "") in message or "127.0.0.1" in message


def test_allows_hostname_that_resolves_to_a_public_ip(settings: Settings, monkeypatch):
    """The same host, resolving publicly, is permitted — the guard is not a blanket no."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))

    url, host = validate_url("https://parts.example.com/catalogue", settings)

    assert host == "parts.example.com"
    assert url.startswith("https://parts.example.com/")


def test_refuses_when_ANY_resolved_address_is_private(settings: Settings, monkeypatch):
    """One public A record does not launder a private one.

    A host with a public and a private address is not half-safe: which one gets
    connected to is the resolver's choice, not ours.
    """

    def _mixed(host, port, *args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("10.0.0.5", 0)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", _mixed)

    with pytest.raises(ScrapeRefused, match="10.0.0.5"):
        validate_url("https://parts.example.com/x", settings)


def test_refuses_unresolvable_host(settings: Settings, monkeypatch):
    def _fails(*args, **kwargs):
        raise socket.gaierror("Name or service not known")

    monkeypatch.setattr(socket, "getaddrinfo", _fails)

    with pytest.raises(ScrapeRefused, match="could not resolve"):
        validate_url("https://parts.example.com/x", settings)


# --------------------------------------------------------------------------
# Guard 1 — the allowlist.
# --------------------------------------------------------------------------


def test_refuses_host_not_on_allowlist(settings: Settings, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))

    with pytest.raises(ScrapeRefused, match="not in SCRAPE_ALLOWLIST"):
        validate_url("https://evil.example.net/x", settings)


def test_refuses_everything_when_allowlist_is_unset(monkeypatch):
    """Fail closed: an unconfigured allowlist permits no host, not every host."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
    empty = Settings(scrape_allowlist="", agent_host_token="t")

    with pytest.raises(ScrapeRefused, match="SCRAPE_ALLOWLIST is unset"):
        validate_url("https://parts.example.com/x", empty)


def test_dot_prefixed_entry_matches_subdomains_only(settings: Settings, monkeypatch):
    """`.suppliers.example.org` must match a subdomain but not a lookalike."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))

    # Subdomain and apex both allowed.
    validate_url("https://eu.suppliers.example.org/a", settings)
    validate_url("https://suppliers.example.org/a", settings)

    # A host that merely ENDS with the same letters is not a subdomain. Without
    # the required leading dot this would slip through a naive `endswith`.
    with pytest.raises(ScrapeRefused, match="not in SCRAPE_ALLOWLIST"):
        validate_url("https://evilsuppliers.example.org/a", settings)


def test_refuses_non_http_schemes(settings: Settings):
    """file:// and gopher:// are classic SSRF escapes."""
    for url in ("file:///etc/passwd", "gopher://parts.example.com/x", "ftp://parts.example.com/x"):
        with pytest.raises(ScrapeRefused, match="is not allowed"):
            validate_url(url, settings)


def test_refuses_url_without_hostname(settings: Settings):
    with pytest.raises(ScrapeRefused, match="no hostname"):
        validate_url("https:///nowhere", settings)


# --------------------------------------------------------------------------
# Redirects — the hole a naive implementation leaves wide open.
# --------------------------------------------------------------------------


def test_redirect_to_a_private_address_is_refused(settings: Settings, monkeypatch):
    """An allowlisted host that answers `302 -> http://127.0.0.1/` must not be followed.

    Guards 1 and 2 already passed for the ORIGINAL url. If redirects were
    handed to httpx with `follow_redirects=True`, this hop would never face a
    guard at all — which is why `fetch` re-validates every hop by hand.
    """
    import httpx

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
    monkeypatch.setattr("app.scraping.robots_allows", lambda url, cfg=None: True)

    class _RedirectResponse:
        is_redirect = True
        status_code = 302
        headers = {"location": "http://127.0.0.1:8080/admin"}

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(httpx, "stream", lambda *a, **kw: _RedirectResponse())

    with pytest.raises(ScrapeRefused) as excinfo:
        fetch("https://parts.example.com/start", settings)

    # Refused because 127.0.0.1 is not on the allowlist — the redirect target
    # faced guard 1 from the top, exactly as the original URL did.
    assert "127.0.0.1" in str(excinfo.value)


def test_robots_disallow_blocks_the_fetch(settings: Settings, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
    monkeypatch.setattr("app.scraping.robots_allows", lambda url, cfg=None: False)

    with pytest.raises(ScrapeRefused, match="robots.txt"):
        fetch("https://parts.example.com/catalogue", settings)


def test_robots_is_parsed_and_honoured(settings: Settings, monkeypatch):
    """The real robots path, with the network stubbed at httpx.get."""
    import httpx

    from app.scraping import robots_allows

    class _Resp:
        status_code = 200
        text = "User-agent: *\nDisallow: /private\n"

    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _Resp())

    assert robots_allows("https://parts.example.com/public", settings) is True
    assert robots_allows("https://parts.example.com/private/x", settings) is False


def test_robots_403_is_treated_as_refusal(settings: Settings, monkeypatch):
    """An access-controlled robots.txt means "you are not welcome"."""
    import httpx

    from app.scraping import robots_allows

    class _Resp:
        status_code = 403
        text = ""

    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _Resp())
    assert robots_allows("https://parts.example.com/x", settings) is False
