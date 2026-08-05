import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Knowledge, technical tools and learning — slice 10 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 THE LIBRARY IS BUILT; THE CORPUS ACCUMULATES ────────────────────────
 *
 * `CLAUDE.md` §4 stages LICENSED CONTENT — OEM wiring diagrams, vehicle-specific
 * 3D geometry — and nothing else. It is easy to misread that as "the knowledge
 * module is staged". It is not. What is staged is somebody else's copyrighted
 * diagram, not the shelf it sits on, not the fault-code index, not the
 * workshop's own procedures, and not the record of who is certified to do what.
 *
 * So `knowledge.diagrams` exists and `source = 'licensed_pending'` marks a
 * diagram a workshop wants and has not licensed. Migration 048 REFUSES a
 * pending row that carries a file, so the boundary is enforced rather than
 * described.
 *
 * ── ⚠️ FAULT CODES ARE GLOBAL; EVERYTHING ELSE IS THE WORKSHOP'S ───────────
 *
 * P0300 means the same thing everywhere — a published standard, not anybody's
 * property, so `knowledge.fault_codes` carries no tenant and is readable by
 * every organisation. A workshop's own article about P0300 is emphatically NOT:
 * publishing a garage's method to its competitors is something nobody consented
 * to, so articles and procedures are organisation-scoped.
 */

/**
 * 🔴 "EVERYBODY" MEANT STAFF, AND THE CODE MEANT EVERYBODY.
 *
 * No read was gated, and `customer` is a real membership role inside the
 * workshop's organisation — so a customer could read the workshop's repair
 * procedures and safety notes (migration 048's own header calls them "its
 * intellectual property and its liability") and, from `listCertifications`,
 * every staff member's name, email and certification. Found by the Supervisor.
 *
 * `listFaultCodes` stays open: P0300 is a published standard, not anybody's
 * property.
 */
const MAY_READ_LIBRARY = [
  'workshop_owner', 'workshop_manager', 'workshop_supervisor', 'reception_staff',
  'technician', 'storekeeper', 'cashier', 'quality_controller', 'platform_administrator',
] as const;

/** Every workshop role may READ the library. A workshop that hides its manuals has no library. */
const MAY_WRITE = [
  'workshop_owner', 'workshop_manager', 'workshop_supervisor',
  'technician', 'quality_controller', 'platform_administrator',
] as const;

export interface FaultCodeRow {
  code: string;
  system: string;
  title: string;
  description: string | null;
  commonCauses: string | null;
  workshopNotes: number;
}

export interface ArticleRow {
  id: string;
  title: string;
  body: string;
  category: string;
  faultCode: string | null;
  isShared: boolean;
  createdAt: string;
}

export interface ProcedureRow {
  id: string;
  title: string;
  appliesTo: string | null;
  steps: string;
  estimatedMinutes: number | null;
  safetyNotes: string | null;
  requiresCertification: string | null;
  isActive: boolean;
  /** Nothing enforces `requiresCertification` yet, and the screen prints that. */
  certificationIsEnforced: boolean;
}

export interface DiagramRow {
  id: string;
  title: string;
  diagramKind: string;
  appliesTo: string | null;
  source: string;
  licenceNote: string | null;
  hasFile: boolean;
}

export interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  provider: string | null;
  durationMinutes: number | null;
  grantsCertification: string | null;
  isActive: boolean;
  holders: number;
}

export interface CertificationRow {
  id: string;
  userId: string;
  holderName: string;
  name: string;
  awardedOn: string;
  expiresOn: string | null;
  daysUntilExpiry: number | null;
  reference: string | null;
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private assertMayReadLibrary(ctx: TenantContext): void {
    if (!MAY_READ_LIBRARY.includes(ctx.activeRole as (typeof MAY_READ_LIBRARY)[number])) {
      throw new ForbiddenException(
        'This workshop\'s technical library is for its staff. If you are a customer, ' +
          'your repair history and messages are on your own pages.',
      );
    }
  }

  private assertMayWrite(ctx: TenantContext): void {
    if (!MAY_WRITE.includes(ctx.activeRole as (typeof MAY_WRITE)[number])) {
      throw new ForbiddenException(
        'Your role can read the library but not add to it. Everything here stays readable to you — ' +
          'ask a supervisor or the owner to file something new.',
      );
    }
  }

  /**
   * The standard fault codes, with a count of what THIS workshop has written
   * about each.
   *
   * ⚠️ THE COUNT IS SCOPED AND THE CODES ARE NOT. That asymmetry is the point:
   * every workshop sees the same nine codes and only its own notes.
   */
  async listFaultCodes(ctx: TenantContext, q?: string): Promise<FaultCodeRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT f.code, f.system, f.title, f.description, f.common_causes,
                (SELECT count(*) FROM knowledge.articles a
                  WHERE a.fault_code = f.code
                    AND a.tenant_id = $1 AND a.organization_id = $2) AS workshop_notes
           FROM knowledge.fault_codes f
          WHERE $3::text IS NULL
             OR f.code ILIKE '%' || $3 || '%'
             OR f.title ILIKE '%' || $3 || '%'
          ORDER BY f.code`,
        [ctx.tenantId, ctx.organizationId, q && q.trim() ? q.trim() : null],
      );
      return r.rows.map((x) => ({
        code: x.code as string,
        system: x.system as string,
        title: x.title as string,
        description: (x.description as string | null) ?? null,
        commonCauses: (x.common_causes as string | null) ?? null,
        workshopNotes: Number(x.workshop_notes),
      }));
    });
  }

  async listArticles(ctx: TenantContext): Promise<ArticleRow[]> {
    this.assertMayReadLibrary(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, title, body, category, fault_code, is_shared, created_at
           FROM knowledge.articles
          WHERE tenant_id = $1 AND organization_id = $2 AND is_published
          ORDER BY created_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        title: x.title as string,
        body: x.body as string,
        category: x.category as string,
        faultCode: (x.fault_code as string | null) ?? null,
        isShared: x.is_shared as boolean,
        createdAt: (x.created_at as Date).toISOString(),
      }));
    });
  }

  async createArticle(
    ctx: TenantContext,
    input: { title: string; body: string; category: string; faultCode?: string },
  ): Promise<ArticleRow[]> {
    this.assertMayWrite(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO knowledge.articles
           (tenant_id, organization_id, title, body, category, fault_code, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [
          ctx.tenantId, ctx.organizationId, input.title.trim(), input.body,
          input.category, input.faultCode ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'knowledge.article.created',
        resourceType: 'article',
        detail: { title: input.title.trim(), faultCode: input.faultCode ?? null },
      });
    });
    return this.listArticles(ctx);
  }

  async listProcedures(ctx: TenantContext): Promise<ProcedureRow[]> {
    this.assertMayReadLibrary(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, title, applies_to, steps, estimated_minutes, safety_notes,
                requires_certification, is_active
           FROM knowledge.procedures
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY is_active DESC, title`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        title: x.title as string,
        appliesTo: (x.applies_to as string | null) ?? null,
        steps: x.steps as string,
        estimatedMinutes: x.estimated_minutes === null ? null : Number(x.estimated_minutes),
        safetyNotes: (x.safety_notes as string | null) ?? null,
        requiresCertification: (x.requires_certification as string | null) ?? null,
        isActive: x.is_active as boolean,
        // 🔴 HONEST, NOT ASPIRATIONAL. Nothing checks a technician's
        // certifications before they open a procedure. Saying so on the screen
        // is the difference between a stated requirement and a claimed guard.
        certificationIsEnforced: false,
      }));
    });
  }

  async createProcedure(
    ctx: TenantContext,
    input: {
      title: string; steps: string; appliesTo?: string; estimatedMinutes?: number;
      safetyNotes?: string; requiresCertification?: string;
    },
  ): Promise<ProcedureRow[]> {
    this.assertMayWrite(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO knowledge.procedures
           (tenant_id, organization_id, title, applies_to, steps, estimated_minutes,
            safety_notes, requires_certification, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
        [
          ctx.tenantId, ctx.organizationId, input.title.trim(), input.appliesTo ?? null,
          input.steps, input.estimatedMinutes ?? null, input.safetyNotes ?? null,
          input.requiresCertification ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'knowledge.procedure.created',
        resourceType: 'procedure',
        detail: { title: input.title.trim() },
      });
    });
    return this.listProcedures(ctx);
  }

  async listDiagrams(ctx: TenantContext): Promise<DiagramRow[]> {
    this.assertMayReadLibrary(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, title, diagram_kind, applies_to, source, licence_note,
                (asset_id IS NOT NULL) AS has_file
           FROM knowledge.diagrams
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY source, title`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        title: x.title as string,
        diagramKind: x.diagram_kind as string,
        appliesTo: (x.applies_to as string | null) ?? null,
        source: x.source as string,
        licenceNote: (x.licence_note as string | null) ?? null,
        hasFile: x.has_file as boolean,
      }));
    });
  }

  async createDiagram(
    ctx: TenantContext,
    input: { title: string; diagramKind: string; appliesTo?: string; source: string; licenceNote?: string },
  ): Promise<DiagramRow[]> {
    this.assertMayWrite(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO knowledge.diagrams
           (tenant_id, organization_id, title, diagram_kind, applies_to, source,
            licence_note, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          ctx.tenantId, ctx.organizationId, input.title.trim(), input.diagramKind,
          input.appliesTo ?? null, input.source, input.licenceNote ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'knowledge.diagram.created',
        resourceType: 'diagram',
        detail: { title: input.title.trim(), source: input.source },
      });
    });
    return this.listDiagrams(ctx);
  }

  async listCourses(ctx: TenantContext): Promise<CourseRow[]> {
    this.assertMayReadLibrary(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT c.id, c.title, c.description, c.provider, c.duration_minutes,
                c.grants_certification, c.is_active,
                (SELECT count(*) FROM learning.certifications ce
                  WHERE ce.course_id = c.id) AS holders
           FROM learning.courses c
          WHERE c.tenant_id = $1 AND c.organization_id = $2
          ORDER BY c.is_active DESC, c.title`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        title: x.title as string,
        description: (x.description as string | null) ?? null,
        provider: (x.provider as string | null) ?? null,
        durationMinutes: x.duration_minutes === null ? null : Number(x.duration_minutes),
        grantsCertification: (x.grants_certification as string | null) ?? null,
        isActive: x.is_active as boolean,
        holders: Number(x.holders),
      }));
    });
  }

  async createCourse(
    ctx: TenantContext,
    input: {
      title: string; description?: string; provider?: string;
      durationMinutes?: number; grantsCertification?: string;
    },
  ): Promise<CourseRow[]> {
    this.assertMayWrite(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO learning.courses
           (tenant_id, organization_id, title, description, provider, duration_minutes,
            grants_certification, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          ctx.tenantId, ctx.organizationId, input.title.trim(), input.description ?? null,
          input.provider ?? null, input.durationMinutes ?? null,
          input.grantsCertification ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'learning.course.created',
        resourceType: 'course',
        detail: { title: input.title.trim() },
      });
    });
    return this.listCourses(ctx);
  }

  async listCertifications(ctx: TenantContext): Promise<CertificationRow[]> {
    this.assertMayReadLibrary(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT c.id, c.user_id, c.name, c.awarded_on, c.expires_on, c.reference,
                COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS holder_name,
                CASE WHEN c.expires_on IS NULL THEN NULL
                     ELSE (c.expires_on - current_date) END AS days_until_expiry
           FROM learning.certifications c
           JOIN identity.users u ON u.id = c.user_id
          WHERE c.tenant_id = $1 AND c.organization_id = $2
          ORDER BY c.expires_on NULLS LAST, holder_name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        userId: x.user_id as string,
        holderName: x.holder_name as string,
        name: x.name as string,
        awardedOn: String(x.awarded_on).slice(0, 10),
        expiresOn: x.expires_on ? String(x.expires_on).slice(0, 10) : null,
        daysUntilExpiry: x.days_until_expiry === null ? null : Number(x.days_until_expiry),
        reference: (x.reference as string | null) ?? null,
      }));
    });
  }

  async recordCertification(
    ctx: TenantContext,
    input: {
      userId: string; name: string; awardedOn: string;
      expiresOn?: string; reference?: string; courseId?: string;
    },
  ): Promise<CertificationRow[]> {
    this.assertMayWrite(ctx);
    await this.db.withTenant(ctx, async (client) => {
      // The holder must be a member of THIS workshop. Recording a
      // certification against somebody else's staff would be nonsense, and the
      // FK alone would allow it — `identity.users` is not organisation-scoped.
      const member = await client.query(
        `SELECT 1 FROM identity.memberships
          WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3
            AND status = 'active' LIMIT 1`,
        [ctx.tenantId, ctx.organizationId, input.userId],
      );
      if (!member.rowCount) {
        throw new ForbiddenException(
          'That person is not an active member of this workshop, so a certification cannot be recorded against them. ' +
            'Add them under Staff and Roles first.',
        );
      }

      await client.query(
        `INSERT INTO learning.certifications
           (tenant_id, organization_id, user_id, course_id, name, awarded_on,
            expires_on, reference, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$9)`,
        [
          ctx.tenantId, ctx.organizationId, input.userId, input.courseId ?? null,
          input.name.trim(), input.awardedOn, input.expiresOn ?? null,
          input.reference ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'learning.certification.recorded',
        resourceType: 'certification',
        resourceId: input.userId,
        detail: { name: input.name.trim(), expiresOn: input.expiresOn ?? null },
      });
    });
    return this.listCertifications(ctx);
  }
}
