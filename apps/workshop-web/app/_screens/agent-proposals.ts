import type { AgentProposal, ActionClass, ProposalSource } from '@autoworkshop/ui';

/**
 * THE WIRE SHAPE OF `GET /agents/proposals`, AND THE MAPPING ONTO THE PANEL.
 *
 * ── WHY THIS IS A SEPARATE, PURE MODULE ────────────────────────────────────
 *
 * It imports nothing from `next/*` and reads nothing from a session, so vitest
 * can exercise it directly (`agent-proposals.spec.ts`). Every judgement worth
 * testing in this feature is here: which mechanism produced an answer, which
 * server status a card should show, and what a lead candidate looks like when
 * the payload is not what we expected. Those judgements inside an async server
 * component would be untestable without a Next runtime, and would therefore not
 * be tested at all.
 *
 * ── ⚠️ THE TYPES ARE RESTATED, NOT IMPORTED ────────────────────────────────
 *
 * `apps/api/src/agents/agent-proposal.service.ts` exports `ProposalRow`, and
 * importing it here would be the honest thing if these two ever shared a
 * compilation unit. They do not: this app's `tsconfig` does not include the
 * API, the API is a Nest server bundle, and every other screen in this app
 * restates its endpoint's shape for the same reason. The drift risk is real and
 * accepted; `agent-proposals.spec.ts` reads the API's own source and fails if
 * the field names move, which is the same guard `staff-roles.spec.ts` uses.
 */

/** `agents.proposals.agent_name` — the three agents that write proposals today. */
export const LEAD_DISCOVERY = 'lead-discovery';
export const SUPPLIER_DISCOVERY = 'supplier-discovery';
export const SERVICE_REQUEST_TRIAGE = 'service-request-triage';

/**
 * A row as the API returns it.
 *
 * `status` is a plain `string`, matching `ProposalRow` — the API widens it on
 * purpose, and narrowing it here to a union would make an unrecognised value a
 * TYPE error at a place that cannot fail: it is a rendering decision, and the
 * right answer to an unknown status is to show it, not to crash the screen.
 */
export interface ApiProposal {
  id: string;
  agentName: string;
  actionClass: ActionClass;
  action: string;
  dataUsed: string[];
  sources: unknown;
  payload: unknown;
  confidence: number | null;
  /** 🔴 `rules` means NO MODEL RAN — see `AgentProposal.source` in the ui package. */
  source: 'model' | 'rules';
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  approvalRequired: boolean;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** A lead candidate inside a `lead-discovery` proposal's payload. */
export interface LeadCandidate {
  organisationName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  location?: string;
  rationale?: string;
  sourceUrl: string;
}

/** A supplier candidate inside a `supplier-discovery` proposal's payload. */
export interface SupplierCandidate {
  name: string;
  country?: string;
  city?: string;
  website?: string;
  contactEmail?: string;
  sourceUrl: string;
}

/** A part candidate inside a `supplier-discovery` proposal's payload. */
export interface PartCandidate {
  name: string;
  partNumber?: string;
  category?: string;
  priceMinor?: number;
  currency?: string;
  supplierName?: string;
  sourceUrl: string;
}

/**
 * The panel's status union, from the server's free-text status.
 *
 * ⚠️ AN UNRECOGNISED STATUS FALLS BACK TO `proposed`, WHICH IS THE QUIET
 * OPTION, NOT THE FLATTERING ONE. `proposed` renders no decision buttons and
 * makes no claim about the outcome. The alternatives were worse in both
 * directions: `complete` would announce a result nobody produced, and `failed`
 * would report an error that has not happened. A status this code does not know
 * is a deployment skew, not a business event.
 */
function statusOf(row: ApiProposal): AgentProposal['status'] {
  switch (row.status) {
    case 'proposed':
    case 'awaiting-approval':
    case 'approved':
    case 'applied':
    case 'rejected':
      return row.status;
    default:
      return 'proposed';
  }
}

/** `sources` arrives as unparsed jsonb. Keep only entries a link can be made from. */
function sourcesOf(raw: unknown): ProposalSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (typeof s !== 'object' || s === null) return [];
    const { label, href } = s as { label?: unknown; href?: unknown };
    if (typeof label !== 'string' || label === '') return [];
    return [{ label, ...(typeof href === 'string' && href !== '' ? { href } : {}) }];
  });
}

/**
 * The API row as the assistant panel renders it.
 *
 * ⚠️ `source` IS CARRIED THROUGH, and that is the whole reason this function is
 * not a spread. The panel discloses "produced by fixed keyword rules" when the
 * model was unreachable; dropping the field here would silently upgrade a
 * keyword match to a machine judgement in the reader's mind, with nothing on
 * screen to correct them.
 *
 * ⚠️ `approverRole` IS NOT SET, deliberately. The API does not say who must
 * approve — `approvalRequiredFor()` derives only WHETHER — and inventing
 * "an owner" here would put a rule on screen that nothing enforces. Absent is
 * honest; guessed is not.
 */
export function toPanelProposal(row: ApiProposal): AgentProposal {
  return {
    id: row.id,
    action: row.action,
    dataUsed: row.dataUsed ?? [],
    actionClass: row.actionClass,
    approvalRequired: row.approvalRequired,
    sources: sourcesOf(row.sources),
    ...(row.confidence === null ? {} : { confidence: row.confidence }),
    source: row.source,
    status: statusOf(row),
    ...(row.decisionNote ? { result: row.decisionNote } : {}),
  };
}

/**
 * The lead candidates a proposal is proposing.
 *
 * ⚠️ EVERY FIELD IS RE-CHECKED EVEN THOUGH THE AGENT ALREADY FILTERED. The
 * payload is `jsonb` written by a language model's output; it is the least
 * trustworthy shape in this application. An entry with no organisation name and
 * no source is one the API's own `applyApprovedLeads` skips at INSERT time
 * (`if (!lead.organisationName || !lead.sourceUrl) continue`), so showing it
 * here would promise the reviewer a record that will never be written — and
 * "Apply" would then report fewer leads created than were on screen, with no
 * explanation.
 */
export function leadsIn(payload: unknown): LeadCandidate[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const raw = (payload as { leads?: unknown }).leads;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    if (typeof l !== 'object' || l === null) return [];
    const c = l as Record<string, unknown>;
    if (typeof c.organisationName !== 'string' || c.organisationName.trim() === '') return [];
    if (typeof c.sourceUrl !== 'string' || c.sourceUrl.trim() === '') return [];
    return [
      {
        organisationName: c.organisationName,
        sourceUrl: c.sourceUrl,
        ...str(c, 'contactName'),
        ...str(c, 'contactEmail'),
        ...str(c, 'contactPhone'),
        ...str(c, 'website'),
        ...str(c, 'location'),
        ...str(c, 'rationale'),
      },
    ];
  });
}

/** Supplier candidates in a `supplier-discovery` payload. Same distrust as `leadsIn`. */
export function suppliersIn(payload: unknown): SupplierCandidate[] {
  return arrayIn(payload, 'suppliers', 'name').map((c) => ({
    name: c.name as string,
    sourceUrl: c.sourceUrl as string,
    ...str(c, 'country'),
    ...str(c, 'city'),
    ...str(c, 'website'),
    ...str(c, 'contactEmail'),
  }));
}

/** Part candidates in a `supplier-discovery` payload. */
export function partsIn(payload: unknown): PartCandidate[] {
  return arrayIn(payload, 'parts', 'name').map((c) => ({
    name: c.name as string,
    sourceUrl: c.sourceUrl as string,
    ...str(c, 'partNumber'),
    ...str(c, 'category'),
    ...str(c, 'supplierName'),
    ...str(c, 'currency'),
    ...(typeof c.priceMinor === 'number' && Number.isFinite(c.priceMinor)
      ? { priceMinor: c.priceMinor }
      : {}),
  }));
}

/** Entries of `payload[key]` that carry a non-empty `nameField` and `sourceUrl`. */
function arrayIn(
  payload: unknown,
  key: string,
  nameField: string,
): Record<string, unknown>[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const raw = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    if (typeof c !== 'object' || c === null) return [];
    const o = c as Record<string, unknown>;
    const name = o[nameField];
    if (typeof name !== 'string' || name.trim() === '') return [];
    if (typeof o.sourceUrl !== 'string' || o.sourceUrl.trim() === '') return [];
    return [o];
  });
}

/**
 * `{ key: value }` when the value is a non-empty string, `{}` otherwise.
 *
 * ⚠️ IT ALSO REJECTS `""`, and that is the point rather than a nicety. The
 * screens below render a field only when it is present, so an empty string
 * would draw a label with nothing beside it — "Email:" followed by a gap reads
 * as a broken screen, where an absent row reads as "not known".
 *
 * (`exactOptionalPropertyTypes` is NOT set in this workspace — checked in
 * `tsconfig.base.json`, not assumed — so `undefined` would typecheck here. The
 * reason for omitting is the rendering above, not the compiler.)
 */
function str<K extends string>(o: Record<string, unknown>, key: K): { [P in K]?: string } {
  const v = o[key];
  return typeof v === 'string' && v.trim() !== '' ? ({ [key]: v } as { [P in K]?: string }) : {};
}

/**
 * A proposal is still open — nobody has decided it.
 *
 * Used to order the leads screen and to pick what the side panel shows. The
 * server's `status` is the authority; this only names the set.
 */
export function isOpen(row: ApiProposal): boolean {
  return row.status === 'proposed' || row.status === 'awaiting-approval';
}
