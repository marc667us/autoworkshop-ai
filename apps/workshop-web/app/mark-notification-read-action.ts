'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';

/**
 * Mark one notification read — the counterpart to `NotificationsInbox`.
 *
 * A per-app delegate on purpose, exactly like `signOutAction`: the API call
 * carries THIS app's session cookie, and the workspace id is the only genuinely
 * per-app value. The screen itself is shared.
 *
 * ⚠️ NO OWNERSHIP CHECK HERE, and none is needed. The UPDATE policy on
 * `comms.notifications` restricts this to `recipient_id = current_user_id()`,
 * so somebody else's id updates zero rows. A second check here would duplicate
 * the rule that actually enforces it, and the two would drift.
 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiPost('workshop', `/notifications/${id}/read`, {});
  // The list is `force-dynamic`, but revalidating is what makes the row
  // re-render as read on THIS response rather than the next navigation.
  revalidatePath('/communication/notifications');
}
