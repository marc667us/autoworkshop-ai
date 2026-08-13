import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { ListingForm, PublicationControl } from './directory-controls';

/**
 * The workshop's public directory listing — Slice C.
 *
 * ⚠️ THE DIRECTORY IS A COPY, NEVER A VIEW OVER THE WORKSHOP PROFILE. Migration
 * 021's header explains why at length: publication must be an explicit ACT that
 * copies CONSENTED fields into a public table, not a predicate that exempts rows
 * from tenant isolation. So the profile's values appear here only as SUGGESTIONS
 * for a listing that does not exist yet, and editing the profile later changes
 * nothing the public sees.
 *
 * ⚠️ THE WORKSHOP PUBLISHES ITSELF, unlike parts. A directory entry is the
 * workshop's own description of itself — trading name, town, a phone number it
 * chooses to publish. Requiring an administrator to approve that would make the
 * directory unfillable. An administrator can still withdraw an abusive listing.
 */

export const dynamic = 'force-dynamic';

interface Listing {
  tradingName: string | null;
  city: string | null;
  country: string | null;
  publicPhone: string | null;
  services: string[];
  specialisms: string[];
  isPublished: boolean;
}

interface DirectoryResponse {
  listing: Listing | null;
  suggested: {
    tradingName: string | null;
    city: string | null;
    country: string | null;
    publicPhone: string | null;
  };
  mayEdit: boolean;
}

export function DirectoryScreen() {
  return (
    <>
      <PageHeader
        title="Public directory listing"
        description="How your workshop appears to customers searching for a garage. Free to list, and you decide what is shown."
      />
      <Suspense fallback={<LoadingState label="Loading your listing…" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const res = await apiGet<DirectoryResponse>('workshop', '/directory/listing');
  if (!res.ok) return <ApiFailure reason={res.reason} workspaceId="workshop" />;

  const { listing, suggested, mayEdit } = res.data;
  const exists = listing !== null;
  const published = listing?.isPublished ?? false;

  return (
    <section
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        padding: primitive.space[4],
        background: themeVar.backgroundSecondary,
      }}
    >
      <header style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg }}>Directory status</h2>
        {/* The single most important fact on this page: is the workshop
            visible to the public right now, or not. */}
        <StatusBadge
          kind={published ? 'complete' : 'draft'}
          label={published ? 'Listed publicly' : exists ? 'Saved, not published' : 'Not listed'}
        />
      </header>

      <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        {published
          ? 'Customers searching the directory can find this workshop and the details below.'
          : 'This workshop does not appear in the public directory. Nothing below is visible to anyone outside your organisation.'}
      </p>

      <ListingForm
        mayEdit={mayEdit}
        usingSuggestions={!exists}
        values={{
          tradingName: listing?.tradingName ?? suggested.tradingName ?? '',
          city: listing?.city ?? suggested.city ?? '',
          country: listing?.country ?? suggested.country ?? '',
          publicPhone: listing?.publicPhone ?? suggested.publicPhone ?? '',
          services: (listing?.services ?? []).join(', '),
          specialisms: (listing?.specialisms ?? []).join(', '),
        }}
      />

      <PublicationControl published={published} exists={exists} mayEdit={mayEdit} />
    </section>
  );
}
