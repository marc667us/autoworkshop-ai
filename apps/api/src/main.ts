import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Every external client passes through the gateway; the API never trusts a
  // client-supplied tenant id (`autoworkshop 1.txt` §9). Tenant context is
  // derived from validated Keycloak claims + membership in Phase 2.
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.warn(`[api] listening on :${port}`);
}

void bootstrap();
