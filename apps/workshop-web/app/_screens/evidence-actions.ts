'use server';

import { revalidatePath } from 'next/cache';
import { apiDelete, apiGet, apiPost } from '@autoworkshop/next-shell';

/**
 * Attachment write actions — slice 1 of `COMPLETION_PLAN.md`.
 *
 * IN THEIR OWN `'use server'` MODULE, for the reason `register-actions.ts`
 * gives: an action defined inside a component file is one refactor away from
 * landing in a file that gains `'use client'`, at which point the session token
 * below would be handled in the browser.
 *
 * ⚠️ THESE ARE NOT THE AUTHORIZATION POINT. A server action is a public HTTP
 * endpoint that Next exposes one-per-action and anyone may call directly.
 * `MediaService.assertOwnerReachable` resolves the owning record under the
 * caller's own RLS context, so a caller who reaches these without passing a
 * screen's gate is still refused by the API (CLAUDE.md §8 — hidden is not
 * secure).
 */

export interface EvidenceAsset {
  id: string;
  ownerType: string;
  ownerId: string;
  originalName: string | null;
  contentType: string;
  byteSize: number | null;
  status: 'pending' | 'stored' | 'quarantined';
  scanStatus: 'skipped' | 'pending' | 'clean' | 'infected';
  caption: string | null;
  uploadedByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
  url: string | null;
}

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
      // The API's own sentence, because these describe the FILE ("that file is
      // 92MB", "image/tiff is not a file type this workshop stores") and are
      // the only failures the person can actually act on.
      return message ?? 'That file was not accepted.';
    case 'forbidden':
      return 'Your account may not attach files to this record.';
    case 'notFound':
      return 'That record no longer exists.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again to attach a file.';
    default:
      return 'The attachment service did not respond. Nothing was uploaded.';
  }
}

/** Step 1 — ask the API for somewhere to put the file. */
export async function requestUploadUrl(input: {
  ownerType: string;
  ownerId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}): Promise<
  | { ok: true; assetId: string; uploadUrl: string }
  | { ok: false; error: string }
> {
  const result = await apiPost<{ assetId: string; uploadUrl: string }>(
    'workshop',
    '/media/upload-url',
    input,
  );
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message) };
  return { ok: true, assetId: result.data.assetId, uploadUrl: result.data.uploadUrl };
}

/**
 * Step 3 — the browser reports the PUT landed.
 *
 * ⚠️ TAKES NO STORAGE KEY, and that is the security property. If the client
 * could name the object it had written, it could confirm an asset against any
 * key in the bucket — including another tenant's, because object storage has no
 * row-level security. The server looks the key up from the id it minted.
 */
export async function confirmUpload(
  assetId: string,
  byteSize: number,
  revalidate?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiPost<unknown>('workshop', `/media/${assetId}/confirm`, { byteSize });
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message) };
  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}

export async function listEvidence(
  ownerType: string,
  ownerId: string,
): Promise<{ ok: true; assets: EvidenceAsset[] } | { ok: false; error: string }> {
  const result = await apiGet<EvidenceAsset[]>(
    'workshop',
    `/media?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
  );
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message) };
  return { ok: true, assets: result.data };
}

/**
 * Detach a file. The ASSET survives — only the link is removed, so who uploaded
 * what stays answerable. `media.assets` carries no DELETE grant at all.
 */
export async function detachEvidence(
  assetId: string,
  ownerType: string,
  ownerId: string,
  revalidate?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiDelete<unknown>(
    'workshop',
    `/media/${assetId}/link?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
  );
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message) };
  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
