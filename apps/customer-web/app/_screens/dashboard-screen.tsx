import Link from 'next/link';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The customer's dashboard — `01 (1).txt` §18, the default landing page.
 *
 * ⚠️ EVERY FIGURE HERE IS REAL. The workshop dashboard still shows demo tiles
 * and says so on screen; this one does not have that licence, because it is the
 * first thing a CUSTOMER sees and an invented number about their own vehicle is
 * not a placeholder, it is misinformation. `05.txt` §2 prohibits "disconnected
 * mock pages" and this is where that rule earns its keep.
 *
 * So the page shows only what the platform can currently answer truthfully:
 * the vehicles registered to them, and whether any insurance has lapsed. Service
 * history, appointments and maintenance schedules are genuinely not built —
 * they arrive with Phase 5's job cards — and the page says that plainly instead
 * of rendering a convincing empty chart.
 *
 * The insurance panel is the one piece of ANALYSIS rather than display, and it
 * is the reason this screen is worth building now: a lapsed policy is the fact a
 * vehicle owner most needs surfacing, it is computable from data already held,
 * and nothing else in the product tells them.
 */

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
  insuranceExpiresOn: string | null;
  currentMileageKm: number | null;
}

/** Whole days from today (UTC) until the date; negative once it has passed. */
function daysUntil(iso: string): number {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  const now = new Date();
  // Date-only on both sides, so a policy does not read as expired for part of
  // the day depending on the server's timezone.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.backgroundSecondary,
        marginBottom: primitive.space[4],
      }}
    >
      <h2 style={{ margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export async function CustomerDashboardScreen() {
  const vehicles = await apiGet<Vehicle[]>('customer', '/vehicles');

  if (!vehicles.ok) {
    const { title, description } = describeApiFailure(vehicles.reason);
    return (
      <>
        <PageHeader title="Dashboard" description="Your vehicles and anything needing attention." />
        <ErrorState title={title} message={description} />
      </>
    );
  }

  const all = vehicles.data;

  // Only vehicles with a RECORDED expiry can be assessed. A vehicle with no
  // insurance date is not "expired" — it is unknown, and saying otherwise would
  // send someone to renew a policy that is perfectly valid.
  const dated = all
    .filter((v) => v.insuranceExpiresOn)
    .map((v) => ({ v, days: daysUntil(v.insuranceExpiresOn as string) }));
  const lapsed = dated.filter((d) => d.days < 0);
  const soon = dated.filter((d) => d.days >= 0 && d.days <= 30);
  const unknown = all.filter((v) => !v.insuranceExpiresOn);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your vehicles and anything needing attention."
      />

      <Card title={`Your vehicles (${all.length})`}>
        {all.length === 0 ? (
          <EmptyState
            title="No vehicles yet"
            description="Add one from Add Vehicle, or a workshop will register it for you when you first book in."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
            {all.map((v) => (
              <li key={v.id} style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textPrimary }}>
                  {v.registrationNumber}
                </span>
                <span style={{ color: themeVar.textSecondary }}>
                  {v.make}
                  {v.model ? ` ${v.model}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginBottom: 0, marginTop: primitive.space[3] }}>
          {/* `next/link`, not `<a>`: an internal navigation should be client-side,
              and the project lints for it. */}
          <Link href="/my-vehicles/garage">Open your garage</Link>
        </p>
      </Card>

      <Card title="Insurance">
        {dated.length === 0 && unknown.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            Nothing to check yet — add a vehicle first.
          </p>
        ) : (
          <>
            {lapsed.length > 0 && (
              // `role="alert"` because this is the one thing on the page a
              // person may need to act on today.
              <p role="alert" style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
                <StatusBadge kind="blocked" label="Expired" />{' '}
                {lapsed.map((d) => d.v.registrationNumber).join(', ')} — insurance has lapsed.
              </p>
            )}
            {soon.length > 0 && (
              <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
                <StatusBadge kind="attention" label="Due soon" />{' '}
                {soon
                  .map((d) => `${d.v.registrationNumber} (${d.days === 0 ? 'today' : `${d.days} days`})`)
                  .join(', ')}
              </p>
            )}
            {lapsed.length === 0 && soon.length === 0 && dated.length > 0 && (
              <p style={{ margin: 0, color: themeVar.textSecondary }}>
                <StatusBadge kind="complete" label="In date" /> No policy expires in the next 30 days.
              </p>
            )}
            {unknown.length > 0 && (
              <p style={{ margin: `${primitive.space[3]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                {/* Stated, not silently ignored: a customer seeing "in date"
                    while two vehicles were never assessed would be misled by
                    omission. */}
                No expiry recorded for {unknown.map((v) => v.registrationNumber).join(', ')}, so
                they have not been checked.
              </p>
            )}
          </>
        )}
      </Card>

      <Card title="Not built yet">
        {/* Honest rather than decorative. `05.txt` §2 forbids mock pages, and a
            customer who is shown an empty "recent services" panel reasonably
            concludes the workshop has no record of their repairs. */}
        <p style={{ margin: 0, color: themeVar.textSecondary }}>
          Service history, appointments and maintenance reminders are not available yet — they
          arrive with the repair modules. Nothing is missing from your record; those screens simply
          do not exist in this build.
        </p>
      </Card>
    </>
  );
}
