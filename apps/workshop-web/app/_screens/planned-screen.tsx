import Link from 'next/link';
import { PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { WORKSHOP_PLANNED } from './planned-content';

/**
 * A screen that cannot do its job yet, saying so usefully.
 *
 * ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
 *
 * Every unbuilt route rendered ONE generic page carrying a "Not built yet"
 * badge and a paragraph about navigation and routing working. That answered a
 * question about the BUILD and none of the questions the person clicking had.
 *
 * This says what the screen will do, and — the part that matters — WHAT TO DO
 * TODAY, with a link that genuinely works. A refusal that names no reachable
 * alternative is a wall, not a rule.
 *
 * ⚠️ IT STILL DOES NOT PRETEND. There is no fake invoice, no sample message, no
 * empty table implying data will appear. `05.txt` §2 prohibits disconnected mock
 * pages and this is not one: everything rendered is a description plus a route
 * that already exists.
 *
 * ⚠️ AND IT IS NOT A LICENCE TO STOP BUILDING. `audit-menu-coverage.mjs` counts
 * a route as BUILT only when it has its own `page.tsx`, so mounting these makes
 * the coverage number go UP without the feature existing. The count is honest
 * only if this file stays rare — see the note in that script.
 */
export function PlannedScreen({ route, title }: { route: string; title: string }) {
  const content = WORKSHOP_PLANNED[route];

  return (
    <>
      <PageHeader
        title={title}
        // Deliberately NOT "Not built yet". The visitor is told what the screen
        // is for; the sentence about what they can do instead does the work.
        description={content?.does ?? 'This screen is being built.'}
      />

      <div
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderLeft: `4px solid ${themeVar.statusAttention}`,
          borderRadius: primitive.radius.xl,
          background: themeVar.surfaceRaised,
          padding: primitive.space[6],
          display: 'flex',
          flexDirection: 'column',
          gap: primitive.space[3],
          maxWidth: '38rem',
        }}
      >
        <strong style={{ fontSize: primitive.fontSize.base }}>What you can do now</strong>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          {content?.now ??
            'Everything available today is in the menu — your assigned work, the job queues, and the screens where work is recorded.'}
        </p>
        {content?.href ? (
          <p style={{ margin: 0 }}>
            <Link href={content.href}>{content.hrefLabel ?? 'Go there'}</Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
