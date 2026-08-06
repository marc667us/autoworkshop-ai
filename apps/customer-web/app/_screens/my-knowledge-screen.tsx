import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * ADVICE FROM YOUR WORKSHOP — slice 13.
 *
 * 🔴 `is_published` IS NOT ENOUGH; `is_shared` IS THE FLAG THAT MATTERS.
 * `KnowledgeService.listArticles` is staff-gated and returns the workshop's own
 * library — articles published to TECHNICIANS, written in their language, some
 * of which are internal diagnostic notes. `is_shared` is the workshop saying
 * "this one is for customers". Showing a published-but-not-shared article would
 * leak the workshop's internal notes under a friendly heading.
 *
 * ⚠️ NO SEARCH BOX. There is no ranking here and typically a handful of
 * articles; a search field over five items that returns nothing for most words
 * is worse than a list. Add one when there is a corpus to search.
 */

interface HelpArticleRow {
  id: string;
  title: string;
  body: string;
  category: string;
}

export async function MyKnowledgeScreen({
  title,
  description,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const articles = await apiGet<HelpArticleRow[]>('customer', '/my/knowledge');

  const header = <PageHeader title={title} description={description} />;

  if (!articles.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={articles.reason} workspaceId="customer" />
      </>
    );
  }

  if (articles.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={emptyTitle} description={emptyBody} />
      </>
    );
  }

  return (
    <>
      {header}
      <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
        {articles.data.map((a) => (
          <article
            key={a.id}
            style={{
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.md,
              padding: '1rem 1.25rem',
            }}
          >
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem' }}>{a.title}</h2>
            <p
              style={{
                margin: '0 0 0.75rem',
                fontSize: '0.8rem',
                color: themeVar.textSecondary,
                textTransform: 'capitalize',
              }}
            >
              {a.category.replace(/_/g, ' ')}
            </p>
            {/* Plain text, deliberately: the body is whatever the workshop
                typed, and rendering it as HTML would make an article an XSS
                vector written by whoever can edit the library. */}
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', maxWidth: '70ch' }}>{a.body}</p>
          </article>
        ))}
      </div>
    </>
  );
}
