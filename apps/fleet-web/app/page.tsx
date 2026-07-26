import { StatusBadge } from '@autoworkshop/ui';

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>
        AutoWorkshop AI — Fleet
      </h1>
      <p style={{ color: '#4b5563', marginBottom: '1rem' }}>Fleet operators — vehicles, approvals, cost analytics</p>
      <StatusBadge kind="draft" label="Release 0.1 — foundation" />
    </main>
  );
}
