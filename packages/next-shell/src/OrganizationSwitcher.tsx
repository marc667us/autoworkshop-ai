'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The organization switcher — `01 (1).txt` §5, T-0016.
 *
 * A NATIVE `<select>` INSIDE A FORM, deliberately, rather than a custom
 * dropdown panel. It is keyboard accessible, screen-reader correct and usable
 * on a phone with no work, it needs no focus-trap or outside-click handling,
 * and it keeps working if JavaScript fails — the form posts to a server action
 * either way. A hand-rolled listbox would be more code to get less.
 *
 * IT SUBMITS ON CHANGE, and that is a considered trade rather than an
 * oversight. A separate "Apply" button would be one more thing to forget after
 * choosing, and the action is instantly reversible: pick the other option back.
 * The `<noscript>` submit button covers the case where the change handler
 * cannot run.
 *
 * ⚠️ NOT AN AUTHORIZATION CONTROL. The list only contains organizations the
 * API already reported as the viewer's own memberships, and the API re-validates
 * the choice against those memberships anyway — a request naming an organization
 * the user does not hold is REFUSED, not silently downgraded. Rendering fewer
 * options here is a convenience; it protects nothing on its own (CLAUDE.md §8).
 */

export interface OrganizationOption {
  id: string;
  name: string;
}

export function OrganizationSwitcher({
  organizations,
  activeId,
  action,
}: {
  organizations: readonly OrganizationOption[];
  activeId: string;
  /** Server action: stores the selection and revalidates. */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);

  // One organization is not a choice. Rendering a select with a single option
  // invites the user to interact with something that cannot change — and every
  // viewer was in exactly this state until a second membership existed.
  if (organizations.length < 2) return null;

  return (
    <form ref={formRef} action={action} style={{ display: 'inline-flex' }}>
      {/* Labelled for assistive technology without spending top-bar width on a
          visible label — the selected organisation name is the visible text. */}
      <label htmlFor="aw-org-switcher" style={SR_ONLY}>
        Active organization
      </label>
      <select
        id="aw-org-switcher"
        name="organizationId"
        defaultValue={activeId}
        onChange={() => formRef.current?.requestSubmit()}
        style={{
          padding: `${primitive.space[1]} ${primitive.space[2]}`,
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          background: themeVar.backgroundSecondary,
          color: themeVar.textPrimary,
          fontSize: primitive.fontSize.sm,
          fontFamily: 'inherit',
          maxWidth: '14rem',
        }}
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" style={{ marginLeft: primitive.space[1] }}>
          Switch
        </button>
      </noscript>
    </form>
  );
}

/** Visually hidden, still announced. Not `display:none`, which removes it. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
