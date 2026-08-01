import { Controller, Get } from '@nestjs/common';

/**
 * ⚠️ THIS ENDPOINT IS A LIVENESS CHECK AND NOTHING MORE. READ THIS BEFORE
 * TRUSTING IT, OR BEFORE POINTING A MONITOR AT IT.
 *
 * It returns `{status:'ok'}` UNCONDITIONALLY. It touches no database, no cache,
 * no message bus and no identity provider — so it answers 200 with every
 * dependency in the stack dead. That is correct for what a container
 * orchestrator needs ("is this process still running?") and actively misleading
 * as an answer to "is the system working?".
 *
 * That distinction is not theoretical here. Keycloak answered its own
 * `/health/ready` with UP for THIRTY HOURS while its database was dead: the
 * port was open, the endpoint returned 200, and nobody could sign in. This
 * endpoint has exactly the same shape.
 *
 * **For readiness, use `GET /api/v1/operations/report`** (`OperationsService`),
 * which completes a real protocol exchange with Postgres, Redis, NATS, object
 * storage and the Keycloak REALM, and reports what each one actually proved.
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'autoworkshop-api',
      release: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
