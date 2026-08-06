import { Injectable } from '@nestjs/common';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * LEARNING MATERIALS AND DIAGNOSTIC TREES — slice 16.
 *
 * The last four technician routes that could honestly be built.
 *
 * ── 🔴 THIS PLATFORM RECORDS TRAINING; IT DOES NOT HOST IT ────────────────
 *
 * See migration 057's header for the decision and why. The consequence for
 * every method here: a material carries a LINK, and the screens say so. A page
 * that implied the video lived here would be a promise the product cannot keep,
 * and ADR-012 forbids the storage bill that keeping it would create.
 *
 * ── 🔴 A DIAGNOSTIC TREE BRANCHES; A PROCEDURE DOES NOT ───────────────────
 *
 * `knowledge.procedures` is a linear step list. A tree has a question, answers,
 * and a different next question per answer. `tree()` returns the whole thing
 * in one read and assembles the nesting in TypeScript, because a tree here is
 * tens of nodes and a recursive CTE would be a lot of SQL to save one round
 * trip nobody is waiting on.
 */

export interface MaterialRow {
  id: string;
  materialKind: string;
  title: string;
  description: string | null;
  externalUrl: string | null;
  durationMinutes: number | null;
  courseTitle: string | null;
  provider: string | null;
  completedOn: string | null;
  scorePercent: number | null;
}

export interface TreeSummary {
  id: string;
  title: string;
  appliesTo: string | null;
  faultCode: string | null;
  isPublished: boolean;
  nodeCount: number;
}

export interface TreeNode {
  id: string;
  answer: string | null;
  nodeKind: string;
  text: string;
  children: TreeNode[];
}

@Injectable()
export class LearningService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Materials of one kind, each carrying whether THIS viewer has completed it.
   *
   * ⚠️ THE COMPLETION IS THE VIEWER'S OWN. A technician opening Assessments
   * wants to know what THEY still owe; joining every completion would answer a
   * manager's question on a technician's screen.
   */
  async listMaterials(ctx: TenantContext, kind: string): Promise<MaterialRow[]> {
    assertWorkshopStaff(ctx, 'The workshop training library');
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT m.id, m.material_kind, m.title, m.description, m.external_url,
                m.duration_minutes, c.title AS course_title, c.provider,
                comp.completed_on, comp.score_percent
           FROM learning.course_materials m
           LEFT JOIN learning.courses c ON c.id = m.course_id
                AND c.tenant_id = m.tenant_id AND c.organization_id = m.organization_id
           LEFT JOIN learning.completions comp ON comp.material_id = m.id
                AND comp.user_id = $4
                AND comp.tenant_id = m.tenant_id AND comp.organization_id = m.organization_id
          WHERE m.tenant_id = $1 AND m.organization_id = $2
            AND m.material_kind = $3 AND m.is_active
          ORDER BY (comp.completed_on IS NULL) DESC, m.title`,
        [ctx.tenantId, ctx.organizationId, kind, ctx.userId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        materialKind: x.material_kind as string,
        title: x.title as string,
        description: (x.description as string | null) ?? null,
        externalUrl: (x.external_url as string | null) ?? null,
        durationMinutes: x.duration_minutes === null ? null : Number(x.duration_minutes),
        courseTitle: (x.course_title as string | null) ?? null,
        provider: (x.provider as string | null) ?? null,
        completedOn: x.completed_on ? String(x.completed_on).slice(0, 10) : null,
        scorePercent: x.score_percent === null ? null : Number(x.score_percent),
      }));
    });
  }

  async listTrees(ctx: TenantContext): Promise<TreeSummary[]> {
    assertWorkshopStaff(ctx, 'The workshop diagnostic trees');
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT t.id, t.title, t.applies_to, t.fault_code, t.is_published,
                (SELECT count(*) FROM knowledge.diagnostic_tree_nodes n
                  WHERE n.tree_id = t.id
                    AND n.tenant_id = t.tenant_id
                    AND n.organization_id = t.organization_id) AS node_count
           FROM knowledge.diagnostic_trees t
          WHERE t.tenant_id = $1 AND t.organization_id = $2
          ORDER BY t.is_published DESC, t.title`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        title: x.title as string,
        appliesTo: (x.applies_to as string | null) ?? null,
        faultCode: (x.fault_code as string | null) ?? null,
        isPublished: x.is_published as boolean,
        nodeCount: Number(x.node_count),
      }));
    });
  }

  /** One tree, nested. Returns null when the tree has no root to start from. */
  async tree(ctx: TenantContext, treeId: string): Promise<TreeNode | null> {
    assertWorkshopStaff(ctx, 'This diagnostic tree');
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, parent_id, answer, node_kind, text
           FROM knowledge.diagnostic_tree_nodes
          WHERE tree_id = $3 AND tenant_id = $1 AND organization_id = $2
          ORDER BY position, text`,
        [ctx.tenantId, ctx.organizationId, treeId],
      );

      const byId = new Map<string, TreeNode>();
      for (const x of r.rows) {
        byId.set(x.id as string, {
          id: x.id as string,
          answer: (x.answer as string | null) ?? null,
          nodeKind: x.node_kind as string,
          text: x.text as string,
          children: [],
        });
      }
      let root: TreeNode | null = null;
      for (const x of r.rows) {
        const node = byId.get(x.id as string)!;
        const parentId = x.parent_id as string | null;
        if (parentId === null) {
          // Migration 057 has a unique index guaranteeing ONE root per tree, so
          // this cannot silently pick between two.
          root = node;
        } else {
          byId.get(parentId)?.children.push(node);
        }
      }
      return root;
    });
  }
}
