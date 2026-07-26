import type { Metadata } from 'next';
import { WorkspaceShell, viewerGrants } from '@autoworkshop/next-shell';
import { themeBootScript } from '@autoworkshop/ui';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Workshop',
  description: 'Technicians and managers — job cards, staging board, diagnosis',
};

/**
 * All seven apps share one shell (`@autoworkshop/next-shell`). Only the
 * workspace id differs — the navigation itself comes from
 * `@autoworkshop/navigation`, transcribed from the approved spec.
 *
 * `grants` comes from `viewerGrants()` — the single source shared with this
 * workspace's catch-all route, so the navigation and the router always agree on
 * what the viewer may see. It is demo data until Phase 2 replaces that one
 * function with validated Keycloak claims; it is not a security control.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — prevents the
            flash of incorrect theme. Must be inline and synchronous. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body style={{ margin: 0, background: 'var(--aw-background-primary)', color: 'var(--aw-text-primary)' }}>
        <WorkspaceShell
          workspaceId="workshop"
          grants={viewerGrants('workshop')}
          organizationLabel="Demo Motors Ltd"
          branchLabel="Accra Main"
          userLabel="A. Technician"
          counters={{
            'workshop.tasks.open': 7,
            'workshop.approvals.pending': 3,
            'workshop.complaints.new': 4,
            'workshop.appointments.today': 6,
            'workshop.jobs.active': 12,
            'workshop.proposals.pendingApproval': 2,
            'workshop.messages.unread': 5,
          }}
          warnings={{ 'workshop.parts.reorderAlerts': 2 }}
          topNavActions={[
            { id: 'create', label: 'Create', icon: 'create' },
            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks', count: 10 },
            { id: 'messages', label: 'Messages and calls', icon: 'messages', count: 5 },
            { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 3 },
            { id: 'ai', label: 'AI assistant', icon: 'ai' },
            { id: 'help', label: 'Help and support', icon: 'help' },
          ]}
        >
          {children}
        </WorkspaceShell>
      </body>
    </html>
  );
}
