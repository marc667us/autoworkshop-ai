import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * THE VERIFICATION QUEUE — a platform administrator checks a self-registered
 * business, then publishes it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Owner, 2026-08-09: *"when [a new] workshop or supplier [registers] the admin
 * is alerted to verify and approve and update the registries."*
 *
 * The alert is a database trigger (migration 070) so it commits with the
 * registration. This service is the other three verbs: SEE the queue, DECIDE,
 * and — on approval — UPDATE THE REGISTRIES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 🔴 APPROVAL IS WHAT PUBLISHES. THAT IS THE WHOLE POINT ────────────────
 *
 * `catalogue.mechanic_directory.is_published` and
 * `catalogue.suppliers.is_published` / `.is_verified` are all `NOT NULL DEFAULT
 * FALSE` (migration 021: "a row created without thinking about it is
 * invisible"). A registration therefore starts invisible without anything
 * having to make it so, and `decide('approved')` is the only thing in the
 * product that flips those flags for a self-registered business.
 *
 * ⚠️ AND THE FLIP HAPPENS IN THE SAME TRANSACTION AS THE DECISION. A decision
 * recorded without the publication would show an administrator "approved" while
 * the business stayed invisible — and they would have no reason to look again.
 * That is this repository's "config reads correct while the mechanism is INERT"
 * defect, which it has now recorded five times.
 *
 * ── ⚠️ REJECTION DOES NOT DELETE ANYTHING ─────────────────────────────────
 *
 * A rejected business keeps its tenant, its organisation and its owner's
 * membership. Three reasons: the account must be able to sign in to READ the
 * rejection and its reason; deleting a tenant cascades through every table that
 * references it, which is not a thing to do from a queue screen; and a
 * rejection is frequently a "not yet" — a missing document — rather than a
 * verdict about the business existing.
 *
 * What rejection does is leave the registries untouched, so nothing is
 * published. Un-publishing on a re-rejection IS handled, because an approval
 * that is later reversed must actually take the listing down.
 */

export type RegistrationKind = 'workshop' | 'supplier';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationRow {
  id: string;
  organizationId: string;
  organizationName: string | null;
  kind: RegistrationKind;
  status: RegistrationStatus;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedByEmail: string | null;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

const SELECT_COLUMNS = `
  r.id, r.organization_id, r.kind, r.status, r.submitted_by, r.submitted_at,
  r.decided_at, r.decision_note,
  o.name AS organization_name,
  u.display_name AS submitted_by_name,
  u.email AS submitted_by_email`;

function iso(v: unknown): string {
  return (v as Date)?.toISOString?.() ?? String(v);
}

function toRow(r: Record<string, unknown>): RegistrationRow {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    organizationName: (r.organization_name as string) ?? null,
    kind: r.kind as RegistrationKind,
    status: r.status as RegistrationStatus,
    submittedBy: (r.submitted_by as string) ?? null,
    submittedByName: (r.submitted_by_name as string) ?? null,
    submittedByEmail: (r.submitted_by_email as string) ?? null,
    submittedAt: iso(r.submitted_at),
    decidedAt: r.decided_at ? iso(r.decided_at) : null,
    decisionNote: (r.decision_note as string) ?? null,
  };
}

/**
 * 🔴 PLATFORM ADMINISTRATOR ONLY, AND NOT "an owner of something".
 *
 * A `workshop_owner` administers their own workshop and must not be able to
 * verify anybody else's business — that would let the first registrant approve
 * their own competitors, or themselves via a second account. Migration 069's
 * UPDATE policy carries the same rule on both `USING` and `WITH CHECK`, and the
 * rehearsal measured it: the registrant's own UPDATE matched ZERO rows while an
 * administrator's matched one.
 *
 * ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE, per this repository's most
 * expensive recurring defect.
 */
function assertPlatformAdmin(ctx: TenantContext, what: string): void {
  if (ctx.activeRole !== 'platform_administrator') {
    throw new ForbiddenException(
      `${what} is available to a platform administrator only. Your registration is in the queue — a platform administrator will review it, and you can carry on setting up your organisation in the meantime.`,
    );
  }
}

@Injectable()
export class OrganizationRegistrationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The queue. Platform administrator only.
   *
   * ⚠️ `pending` FIRST, then newest. An administrator opening this screen is
   * here to clear a backlog, and burying the outstanding work under a month of
   * decided rows is how a queue stops being worked.
   */
  async list(
    ctx: TenantContext,
    opts: { status?: string; kind?: string } = {},
  ): Promise<RegistrationRow[]> {
    assertPlatformAdmin(ctx, 'The registration queue');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM identity.organization_registrations r
           JOIN identity.organizations o ON o.id = r.organization_id
           LEFT JOIN identity.users u ON u.id = r.submitted_by
          WHERE ($1::text IS NULL OR r.status = $1)
            AND ($2::text IS NULL OR r.kind = $2)
          ORDER BY (r.status = 'pending') DESC, r.submitted_at DESC
          LIMIT 200`,
        [opts.status ?? null, opts.kind ?? null],
      );
      return res.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * What the REGISTRANT sees about their own registration.
   *
   * 🔴 A SEPARATE METHOD, DELIBERATELY NOT `list` WITH A WIDER GATE. The queue
   * is administrators' and this is the registrant's own row; giving them one
   * method with a role branch is how a filter eventually gets dropped and a
   * supplier reads every other business's verification state.
   *
   * Migration 069's SELECT policy already confines a non-admin to their own
   * organisation, so this is the app-layer half of the same rule.
   */
  async mine(ctx: TenantContext): Promise<RegistrationRow | null> {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM identity.organization_registrations r
           JOIN identity.organizations o ON o.id = r.organization_id
           LEFT JOIN identity.users u ON u.id = r.submitted_by
          WHERE r.organization_id = $1`,
        [ctx.organizationId],
      );
      const row = res.rows[0];
      return row ? toRow(row as Record<string, unknown>) : null;
    });
  }

  /**
   * Approve or reject, and publish or un-publish accordingly.
   *
   * ⚠️ A REJECTION REQUIRES A REASON. "No" with nothing attached cannot be
   * acted on by the business receiving it, so they register again and the queue
   * grows. An approval does not require one — "yes" is self-explanatory.
   */
  async decide(
    ctx: TenantContext,
    id: string,
    decision: 'approved' | 'rejected',
    note: string | undefined,
  ): Promise<RegistrationRow> {
    assertPlatformAdmin(ctx, 'Deciding a registration');
    const trimmed = note?.trim();
    if (decision === 'rejected' && !trimmed) {
      throw new BadRequestException(
        'Say why it was rejected. The business is shown this, and a refusal with no reason cannot be acted on.',
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      // A single conditional UPDATE rather than read-then-write: two
      // administrators pressing Approve and Reject at the same moment must
      // produce one decision, not last-writer-wins. Same shape as
      // `AgentProposalService.decide`.
      const res = await client.query(
        `UPDATE identity.organization_registrations r
            SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
          WHERE r.id = $1
          RETURNING r.id, r.organization_id, r.kind`,
        [id, decision, ctx.userId, trimmed ?? null],
      );
      const updated = res.rows[0] as
        | { id: string; organization_id: string; kind: RegistrationKind }
        | undefined;
      if (!updated) throw new NotFoundException('That registration was not found.');

      // ── THE REGISTRIES ─────────────────────────────────────────────────
      // 🔴 IN THIS TRANSACTION. A decision that commits without the
      // publication leaves an administrator certain they approved a business
      // that remains invisible, with no reason ever to look again.
      const publish = decision === 'approved';
      if (updated.kind === 'workshop') {
        // ⚠️ UPDATE, NOT UPSERT. `catalogue.mechanic_directory` carries a
        // trading name, city and country that this service does not have and
        // must not invent — a fabricated business address is worse than an
        // absent listing. The workshop fills those in from its own settings;
        // approval only flips the switch. A workshop that has not written its
        // profile yet updates zero rows here, which is correct: there is
        // nothing to publish.
        await client.query(
          `UPDATE catalogue.mechanic_directory
              SET is_published = $2
            WHERE organization_id = $1`,
          [updated.organization_id, publish],
        );
      } else {
        // 🔴 BY `organization_id`, AND THIS USED TO MATCH ON NAME.
        //
        // The first version was:
        //
        //     WHERE o.id = $1 AND lower(s.name) = lower(o.name)
        //
        // Codex, 2026-08-09: register a supplier using the NAME of an existing
        // unverified one, and an administrator approving YOUR registration
        // publishes and VERIFIES THEIRS — every row sharing that name. The
        // mirror defect was as bad: a genuinely new supplier matched nothing,
        // so approval marked them `approved` and published NOTHING, leaving an
        // administrator certain they had approved an invisible business.
        //
        // Migration 071 adds `catalogue.suppliers.organization_id` with a
        // partial UNIQUE index, and `register_supplier` now creates the listing
        // row bound to the organisation, unpublished. So this can reach exactly
        // one row and it is always the registrant's own.
        await client.query(
          `UPDATE catalogue.suppliers
              SET is_published = $2, is_verified = $2, updated_at = now()
            WHERE organization_id = $1`,
          [updated.organization_id, publish],
        );
      }

      await this.audit.write(client, ctx, {
        action: `identity.registration.${decision}`,
        resourceType: 'organization_registration',
        resourceId: updated.id,
        detail: {
          kind: updated.kind,
          organizationId: updated.organization_id,
          published: publish,
          note: trimmed ?? null,
        },
      });

      const full = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM identity.organization_registrations r
           JOIN identity.organizations o ON o.id = r.organization_id
           LEFT JOIN identity.users u ON u.id = r.submitted_by
          WHERE r.id = $1`,
        [updated.id],
      );
      return toRow(full.rows[0] as Record<string, unknown>);
    });
  }
}
