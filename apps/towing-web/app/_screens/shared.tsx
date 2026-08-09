import { StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Shared vocabulary for the towing workspace's ten screens.
 *
 * ⚠️ ONE PLACE, because a status colour that means "urgent" on the dispatch
 * board and "fine" on the incident log is worse than no colour at all. The maps
 * below are the only translation from a domain status to a badge kind in this
 * app; a screen that invents its own is a defect.
 */

type BadgeKind = 'draft' | 'active' | 'complete' | 'attention' | 'blocked';

export const REQUEST_BADGE: Record<string, BadgeKind> = {
  new: 'attention',
  triaged: 'active',
  dispatched: 'complete',
  cancelled: 'blocked',
};

export const RECOVERY_BADGE: Record<string, BadgeKind> = {
  dispatched: 'attention',
  en_route: 'active',
  on_scene: 'active',
  towing: 'active',
  completed: 'complete',
  cancelled: 'blocked',
};

export const AVAILABILITY_BADGE: Record<string, BadgeKind> = {
  available: 'complete',
  on_job: 'active',
  off_duty: 'draft',
  maintenance: 'attention',
  inactive: 'blocked',
  retired: 'blocked',
};

export const INCIDENT_BADGE: Record<string, BadgeKind> = {
  open: 'attention',
  investigating: 'active',
  resolved: 'complete',
};

export const INVOICE_BADGE: Record<string, BadgeKind> = {
  draft: 'draft',
  issued: 'active',
  paid: 'complete',
  void: 'blocked',
};

/** `en_route` reads as a database column, not as English. */
export function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function Badge({ map, value }: { map: Record<string, BadgeKind>; value: string }) {
  return <StatusBadge kind={map[value] ?? 'draft'} label={humanise(value)} />;
}

/**
 * A date a dispatcher can act on.
 *
 * ⚠️ `undefined` LOCALE, deliberately — the server and the browser must not
 * disagree about the format, and passing an explicit locale here is how a
 * hydration mismatch gets introduced. Fixed parts, no locale guessing.
 */
export function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Money as it arrived from the API — a STRING.
 *
 * 🔴 NEVER `Number(...)` A NUMERIC. node-pg returns NUMERIC as a string on
 * purpose: it does not fit a double without loss, and this repository already
 * has a rule that a customer must not be charged 4.999999 hours. Formatting
 * happens here by padding the string, never by parsing it.
 */
export function money(amount: string | null, currency = 'GHS'): string {
  if (amount === null) return '—';
  return `${currency} ${amount}`;
}

export const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  emergency: { color: themeVar.textPrimary, fontWeight: 700 },
  high: { color: themeVar.textPrimary, fontWeight: 600 },
  normal: { color: themeVar.textSecondary },
  low: { color: themeVar.textSecondary },
};

export const card: React.CSSProperties = {
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.lg,
  padding: primitive.space[4],
  background: themeVar.surfaceRaised,
};

export const grid: React.CSSProperties = {
  display: 'grid',
  gap: primitive.space[4],
};
