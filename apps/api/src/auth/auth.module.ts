import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { KeycloakJwtService } from './keycloak-jwt.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  imports: [IdentityModule],
  providers: [KeycloakJwtService, TenantGuard],
  exports: [KeycloakJwtService, TenantGuard],
})
export class AuthModule {}
