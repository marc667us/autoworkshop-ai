# Local / self-hosted infrastructure

All open-source, all self-hosted (D6 zero-cost). No managed or paid service.

```bash
cp .env.example .env      # then edit the passwords
pnpm infra:up             # start
pnpm infra:logs           # follow
pnpm infra:down           # stop
```

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL + pgvector | 5432 | Authoritative data, RLS, vector search |
| Redis | 6379 | Cache, locks, BullMQ short-lived jobs |
| NATS | 4222 / 8222 | Domain events (ADR-014) |
| MinIO | 9000 / 9001 | S3-compatible object storage |
| Keycloak | 8080 | Identity — **own realm**, never Solar's (D2a) |
| coturn | 3478 + 49160-49200 | WebRTC TURN relay |

## Notes

- **Postgres is self-hosted deliberately.** Solar was destroyed on 2026-07-09 by
  an expiring free-tier database with no backups. Self-hosting removes the
  expiry vector entirely; WAL archiving + off-host backups (Supervisor C3) cover
  the rest.
- **Keycloak heap is capped at 512MB.** Solar's Keycloak OOM'd on a constrained
  host; `JAVA_OPTS_APPEND` prevents a silent repeat.
- **coturn uses host networking** because TURN needs a wide UDP relay range.
  Capacity, quotas and abuse controls are a real constraint — self-hosting
  removes the cost, not the bandwidth limit.
