#!/usr/bin/env bash
# Generate the self-signed certificate the local Mailpit sink uses for STARTTLS.
#
# ── 🔴 WHY A LOCAL MAIL SINK NEEDS TLS AT ALL ─────────────────────────────────
#
# `SmtpMailTransport` sets `requireTLS` on every port except 465 and offers no
# way to turn it off. That is right for production — mail leaves Render across
# the public internet — but it means a PLAINTEXT sink cannot be reached by the
# real transport at all. Testing against one would require either relaxing the
# production code or writing a second transport for the test, and both prove a
# code path the product never executes.
#
# Raising the sink to the app's standard is the honest way round: the transport
# is exercised exactly as production runs it, unmodified.
#
# ── ⚠️ WHY THIS IS GENERATED AND NOT COMMITTED ───────────────────────────────
#
# It is a throwaway localhost key, but this repository has a live incident
# involving a credential in public git history, and the security CI scans for
# key material by name. A generated file cannot become that.
#
# Usage:  bash scripts/dev-mailpit-cert.sh
# Then:   docker compose --profile dev up -d mailpit
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/infrastructure/docker/mailpit-tls"
mkdir -p "$DIR"

if [[ -f "$DIR/cert.pem" && -f "$DIR/key.pem" ]]; then
  echo "[OK]   certificate already present at infrastructure/docker/mailpit-tls"
  exit 0
fi

# MSYS_NO_PATHCONV stops Git Bash on Windows rewriting the /CN=... subject into
# a drive path — a rewrite that produces a certificate with the wrong name and
# a TLS failure several steps later, which is a miserable thing to debug.
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" -days 3650 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null

# The SAN is the part that matters: Node verifies the HOSTNAME, so a certificate
# with only a CN and no subjectAltName is rejected by modern TLS stacks.
echo "[OK]   generated a 10-year self-signed cert for localhost + 127.0.0.1"
echo "       trust it in tests with NODE_EXTRA_CA_CERTS=$DIR/cert.pem"
