import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserGuard, type UserRequest } from '../auth/user.guard';
import { OrderService } from './order.service';

/**
 * Marketplace ordering — authenticated, but NOT tenant-scoped.
 *
 * ⚠️ `UserGuard`, NOT `TenantGuard`, AND THAT IS NOT A WEAKENING. Every other
 * business controller in this API is tenant-guarded because it reads
 * tenant-owned tables. These routes read `catalogue.orders`, whose RLS predicate
 * is the USER. A vehicle owner buying a filter holds no membership, so
 * `TenantGuard` would 401 exactly the people this slice exists for.
 *
 * What keeps that safe is not the guard's carefulness: a request authenticated
 * here never receives a tenant context, so `withUser` leaves `app.tenant_id`
 * unset and every tenant-owned table returns zero rows. Pointing a route here at
 * a workshop table yields an empty response, not a leak.
 *
 * ⚠️ THE USER ID COMES FROM THE VALIDATED TOKEN (`req.appUserId`) AND NEVER FROM
 * THE BODY OR A QUERY PARAMETER. `buyer_user_id` is written from it, and
 * migration 022's `buyer_insert` WITH CHECK refuses any other value — so even a
 * bug here cannot create an order in somebody else's name. Both layers, as
 * everywhere else.
 */
@Controller('marketplace')
@UseGuards(UserGuard)
export class MarketplaceController {
  constructor(private readonly orders: OrderService) {}

  /**
   * Place an order. A basket spanning several suppliers becomes SEVERAL orders
   * — see migration 022 — so this returns a list, always.
   */
  @Post('orders')
  async place(
    @Req() req: UserRequest,
    @Body() body: { items?: unknown; delivery?: unknown },
  ) {
    return this.orders.placeOrder(
      req.appUserId,
      (body?.items ?? []) as never,
      (body?.delivery ?? {}) as never,
    );
  }

  /** The signed-in buyer's own orders. */
  @Get('orders')
  async mine(@Req() req: UserRequest) {
    return this.orders.listMyOrders(req.appUserId);
  }

  /**
   * The supplier order inbox.
   *
   * Same shape of query as `mine`; the POLICY is what makes them different
   * lists. Keeping the difference in the database rather than in a WHERE clause
   * here means a mistake in this file cannot widen it.
   */
  @Get('supplier/orders')
  async supplierInbox(@Req() req: UserRequest) {
    return this.orders.listSupplierOrders(req.appUserId);
  }

  /** One order with lines and history. 404 — never 403 — when it is not yours. */
  @Get('orders/:id')
  async one(@Req() req: UserRequest, @Param('id') id: string) {
    return this.orders.getOrder(req.appUserId, id);
  }

  /** Confirm, dispatch, deliver or cancel. The rules live in order-rules.ts. */
  @Patch('orders/:id/status')
  async status(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: { status?: unknown; reason?: unknown },
  ) {
    return this.orders.changeStatus(req.appUserId, id, body?.status, body?.reason);
  }

  /**
   * Record a settlement made outside the app.
   *
   * There is deliberately no "pay now" route: no payment provider is
   * configured, and choosing one is the owner's decision alone. This is the
   * complete, working, zero-cost path — not a placeholder for one.
   */
  @Patch('orders/:id/payment')
  async payment(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: { method?: unknown; reference?: unknown },
  ) {
    return this.orders.recordPayment(req.appUserId, id, body?.method, body?.reference);
  }
}
