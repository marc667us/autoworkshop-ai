import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * DIAGNOSTIC TREES — slice 16, `/technical-tools/diagnostic-trees`.
 *
 * ── 🔴 WHY THIS COULD NOT BE A RE-MOUNT ───────────────────────────────────
 *
 * Seven §49 routes were correctly solved by re-mounting a screen that already
 * existed under another name. This one could not be, and the difference is real
 * rather than cosmetic:
 *
 *   `knowledge.procedures` is a LINEAR step list — do this, then this.
 *   A diagnostic tree BRANCHES — "is there voltage at the connector?" and the
 *   next question depends on the answer.
 *
 * Mounting the procedures library under this name would have RENAMED a thing
 * rather than built one, and a technician following it would have got a
 * checklist where they expected a decision. So migration 057 builds the
 * artefact: nodes with a parent and the ANSWER that leads to them.
 *
 * ⚠️ RENDERED AS NESTED LISTS, NOT A DRAWN GRAPH. A canvas tree needs layout,
 * panning and collision handling to be readable, and a technician on a phone at
 * the bay is better served by indented text they can scroll. The structure is
 * the value; the drawing is not.
 */

interface TreeSummary {
  id: string;
  title: string;
  appliesTo: string | null;
  faultCode: string | null;
  isPublished: boolean;
  nodeCount: number;
}

interface TreeNode {
  id: string;
  answer: string | null;
  nodeKind: string;
  text: string;
  children: TreeNode[];
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <li style={{ margin: '0.35rem 0' }}>
      {node.answer !== null && (
        // The answer that GETS you here. Without it the nesting is decoration.
        <span
          style={{
            display: 'inline-block',
            marginRight: '0.5rem',
            fontSize: '0.75rem',
            padding: '0.05rem 0.4rem',
            borderRadius: primitive.radius.sm,
            border: `1px solid ${themeVar.borderDefault}`,
          }}
        >
          {node.answer}
        </span>
      )}
      <span style={{ fontWeight: node.nodeKind === 'outcome' ? 600 : 400 }}>
        {node.nodeKind === 'outcome' ? '→ ' : ''}
        {node.text}
      </span>
      {node.children.length > 0 && (
        <ul style={{ listStyle: 'none', paddingLeft: '1.1rem', margin: 0,
                     borderLeft: `1px solid ${themeVar.borderDefault}` }}>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export async function DiagnosticTreesScreen({ treeId }: { treeId?: string }) {
  const trees = await apiGet<TreeSummary[]>('workshop', '/learning/diagnostic-trees');

  const header = (
    <PageHeader
      title="Diagnostic Trees"
      description="Branching fault-finding guides: a question, and a different next question depending on the answer. Unlike a repair procedure, the path through depends on what you find."
    />
  );

  if (!trees.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={trees.reason} workspaceId="workshop" />
      </>
    );
  }

  if (trees.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No diagnostic trees yet"
          description="A tree is worth writing for the faults that come back — the ones where a new technician takes an hour to reach a conclusion an experienced one reaches in five minutes. Until one is written, the fault-code index and the repair procedures are the closest thing."
        />
      </>
    );
  }

  const opened = treeId ?? trees.data.find((t) => t.isPublished)?.id ?? trees.data[0]!.id;
  const detail = await apiGet<TreeNode | null>(
    'workshop',
    `/learning/diagnostic-trees/${encodeURIComponent(opened)}`,
  );

  return (
    <>
      {header}
      <DataTable
        caption={`${trees.data.length} trees`}
        rows={trees.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Tree', cell: (r) => r.title },
          { key: 'applies', header: 'Applies to', cell: (r) => r.appliesTo ?? 'any vehicle' },
          { key: 'code', header: 'Fault code', nowrap: true, cell: (r) => r.faultCode ?? '—' },
          { key: 'nodes', header: 'Steps', numeric: true, nowrap: true, cell: (r) => r.nodeCount },
          {
            key: 'state',
            header: '',
            cell: (r) =>
              r.isPublished ? (
                <StatusBadge kind="complete" label="Published" />
              ) : (
                <StatusBadge kind="draft" label="Draft" />
              ),
          },
        ]}
      />

      {detail.ok && detail.data ? (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem' }}>
            {trees.data.find((t) => t.id === opened)?.title ?? 'Tree'}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <Node node={detail.data} depth={0} />
          </ul>
        </div>
      ) : (
        // A tree row with no root is a tree somebody started and did not
        // finish. Saying so beats rendering an empty box.
        <p style={{ marginTop: '1.5rem', color: themeVar.textSecondary }}>
          That tree has no steps recorded yet.
        </p>
      )}
    </>
  );
}
