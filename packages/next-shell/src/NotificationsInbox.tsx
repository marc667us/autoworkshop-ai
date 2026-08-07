import { PageHeader, EmptyState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { apiGet } from './api';
import { ApiFailure } from './ApiFailure';
import type { WorkspaceId } from '@autoworkshop/navigation';

/**
 * THE IN-APP NOTIFICATION INBOX — owner request, 2026-08-07: "give every user a
 * notification inbox to receive notices in app".
 *
 * ── 🔴 WHY THIS MATTERS MORE THAN THE EMAIL HALF ──────────────────────────
 *
 * Migration 060 writes every notification on TWO channels, `in_app` and
 * `email`, and the email half is currently stuck behind a DNS record that only
 * the owner can add. The in-app half has NO such dependency: those rows are
 * delivered the moment they are written. Until this screen existed they were
 * written and READ BY NOBODY — a feature complete in the database and
 * unreachable from the product, which is this repository's most repeated
 * defect.
 *
 * So this screen is what makes notifications work AT ALL today, with no mail
 * provider, no domain verification and no owner action.
 *
 * ── ONE COMPONENT, EVERY WORKSPACE ────────────────────────────────────────
 *
 * Mounted by customer-web and workshop-web against the same API. A second
 * implementation per app is how two screens start disagreeing about what a
 * notification is — the reasoning that produced the shared marketplace landing.
 *
 * ── ⚠️ NO ROLE CHECK HERE, DELIBERATELY ───────────────────────────────────
 *
 * `GET /notifications` is pinned by RLS to `recipient_id = current_user_id()`,
 * so this shows the signed-in person their own mail and there is no role that
 * could see anybody else's. A role gate would add nothing and imply the rows
 * belong to an organisation, which is exactly the confusion that produced the
 * ungated-read defects elsewhere in this codebase.
 */

interface NotificationRow {
  id: string;
  event_key: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  read_at: string | null;
  created_at: string;
  resource_type: string | null;
  resource_id: string | null;
}

/** Turns `service_request.created` into "Service request created". */
function humanise(eventKey: string): string {
  const words = eventKey.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function when(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export interface NotificationsInboxProps {
  /** Which app is mounting this — decides which session the API call uses. */
  workspace: WorkspaceId | string;
  /**
   * Marks one notification read. A SERVER ACTION supplied by the app, exactly
   * as `signOutAction` is: the action must live in the app that owns the
   * session cookie, while the screen itself stays shared.
   */
  markReadAction: (formData: FormData) => void | Promise<void>;
  /**
   * False when the mounting screen already renders its own PageHeader. Both
   * existing `/home/notifications` screens do — this is MERGED INTO them rather
   * than shipped as a second "Notifications" entry, because the nav already had
   * one and a duplicate is how two screens start disagreeing about one subject.
   */
  withHeader?: boolean;
}

export async function NotificationsInbox({
  workspace,
  markReadAction,
  withHeader = true,
}: NotificationsInboxProps) {
  const result = await apiGet<NotificationRow[]>(workspace, '/notifications?limit=100');

  if (!result.ok) {
    // 🔴 A TRANSPORT FAILURE IS NOT AN EMPTY INBOX. Rendering "no notifications"
    // when the API could not be reached tells the reader something false about
    // their own account — the failure shape this repository has recorded four
    // times. `ApiFailure` names what actually went wrong.
    return (
      <>
        {withHeader ? (
          <PageHeader title="Notifications" description="Everything the workshop has told you." />
        ) : null}
        <ApiFailure reason={result.reason} workspaceId={workspace} />
      </>
    );
  }

  const rows = result.data;
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <>
      {withHeader ? (
        <PageHeader
          title="Notifications"
          description={
            unread > 0 ? `${unread} unread of ${rows.length}` : 'Everything the workshop has told you.'
          }
        />
      ) : null}

      {rows.length === 0 ? (
        // Embedded, silence is correct: the screen below still lists what needs
        // attention, and an empty-state here would contradict it.
        withHeader ? (
          <EmptyState
            title="Nothing yet"
            description="When a service request is filed, accepted or declined, it appears here."
          />
        ) : null
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[3] }}>
          {rows.map((n) => (
            <div
              key={n.id}
              style={{
                background: themeVar.surfaceRaised,
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: 12,
                padding: primitive.space[4],
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: primitive.space[4],
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: n.read_at ? 500 : 700,
                      color: themeVar.textPrimary,
                    }}
                  >
                    {/* Unread is carried by WEIGHT and a marker, never by colour
                        alone — colour alone fails for anyone who cannot
                        distinguish it, and this repo already fixed one AA
                        contrast defect this week. */}
                    {n.read_at ? '' : '● '}
                    {n.subject}
                  </p>
                  <p
                    style={{
                      margin: `${primitive.space[1]} 0 0`,
                      color: themeVar.textSecondary,
                      fontSize: 13,
                    }}
                  >
                    {humanise(n.event_key)} · {when(n.created_at)}
                  </p>
                  <p
                    style={{
                      margin: `${primitive.space[2]} 0 0`,
                      color: themeVar.textPrimary,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {n.body}
                  </p>
                </div>

                {n.read_at ? null : (
                  // A plain form POST, so marking read works with no client
                  // JavaScript at all. The action revalidates and the row
                  // re-renders as read.
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: `1px solid ${themeVar.borderDefault}`,
                        background: 'transparent',
                        color: themeVar.textPrimary,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 13,
                      }}
                    >
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
