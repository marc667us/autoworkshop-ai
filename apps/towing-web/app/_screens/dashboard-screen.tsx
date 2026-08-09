import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { card, grid } from './shared';

export const dynamic = 'force-dynamic';

interface Counts {
  new_requests: number;
  triaged_requests: number;
  active_recoveries: number;
  completed_recoveries: number;
  drivers_available: number;
  vehicles_available: number;
  open_incidents: number;
  draft_invoices: number;
}

/**
 * `/operations/dashboard` — what the towing desk needs to know on arrival.
 *
 * ⚠️ EVERY TILE IS A LINK. A number a dispatcher cannot act on is decoration;
 * "4 new requests" must be one click from the four requests. This repository
 * has a recorded lesson about counting things a user cannot reach.
 */
export function DashboardScreen() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Roadside work at a glance. Every figure links to the list behind it."
      />
      <Suspense fallback={<LoadingState label="Loading today’s figures…" />}>
        <Tiles />
      </Suspense>
    </>
  );
}

const TILES: Array<{ key: keyof Counts; label: string; href: string; hint: string }> = [
  { key: 'new_requests', label: 'New requests', href: '/operations/new-requests', hint: 'waiting to be triaged' },
  { key: 'triaged_requests', label: 'Ready to dispatch', href: '/operations/dispatch-board', hint: 'triaged, no truck yet' },
  { key: 'active_recoveries', label: 'Active recoveries', href: '/operations/active-recoveries', hint: 'trucks currently out' },
  { key: 'drivers_available', label: 'Drivers available', href: '/operations/drivers', hint: 'not on a job' },
  { key: 'vehicles_available', label: 'Trucks available', href: '/operations/recovery-vehicles', hint: 'ready to dispatch' },
  { key: 'open_incidents', label: 'Open incidents', href: '/operations/incidents', hint: 'not yet resolved' },
  { key: 'draft_invoices', label: 'Unissued invoices', href: '/operations/invoices', hint: 'completed but not billed' },
  { key: 'completed_recoveries', label: 'Completed', href: '/operations/completed-recoveries', hint: 'all time' },
];

async function Tiles() {
  const result = await apiGet<Counts>('towing', '/towing/dashboard');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;
  const counts = result.data;

  return (
    <div
      style={{
        ...grid,
        // `auto-fit` + `minmax` rather than a fixed column count: the same
        // markup has to work on a phone in a recovery truck and on a desk
        // monitor, and T-0044 is an open defect about sideways scroll at 768px.
        gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
      }}
    >
      {TILES.map((t) => {
        const value = counts[t.key] ?? 0;
        return (
          <Link
            key={t.key}
            href={t.href}
            style={{
              ...card,
              textDecoration: 'none',
              display: 'block',
              // The zero state is deliberately NOT hidden. "0 open incidents"
              // is information; an absent tile is ambiguous between "none" and
              // "not loaded".
              opacity: value === 0 ? 0.72 : 1,
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: primitive.fontSize['2xl'],
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: themeVar.textPrimary,
              }}
            >
              {value}
            </span>
            <span style={{ display: 'block', color: themeVar.textPrimary, fontWeight: 600 }}>
              {t.label}
            </span>
            <span
              style={{
                display: 'block',
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              {t.hint}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
