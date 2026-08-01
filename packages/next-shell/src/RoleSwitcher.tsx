'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The ROLE switcher — owner request 2026-07-31: one login that can act as every
 * role it holds, without signing out.
 *
 * Deliberately the same shape as `OrganizationSwitcher`: a native `<select>` in
 * a form posting to a server action. Keyboard accessible, screen-reader
 * correct, usable on a phone, no focus trap or outside-click handling, and it
 * still works with JavaScript off — the `<noscript>` button submits. A
 * hand-rolled listbox would be more code to get less.
 *
 * ⚠️ NOT AN AUTHORIZATION CONTROL, AND THIS IS THE IMPORTANT PART. The list
 * contains only roles the API already reported as the viewer's own memberships,
 * and `resolveTenantContext` re-validates the choice against those memberships
 * regardless — a request naming a role the user does not hold is REFUSED, never
 * silently downgraded to one they do. Rendering fewer options here is a
 * convenience; it protects nothing on its own (CLAUDE.md §8, and `05.txt`'s
 * "hidden is not secure").
 *
 * ⚠️ CHANGING ROLE CHANGES THE NAVIGATION, not just the page. The action
 * revalidates the whole layout for that reason — a partial revalidation would
 * leave the shell showing the old role's menu around the new role's content,
 * which is exactly the nav/router divergence `packages/navigation` exists to
 * prevent.
 */

export interface RoleOption {
  /** The `role_name` as stored in `identity.memberships`. */
  name: string;
  /** Human label — `workshop_supervisor` reads badly in a top bar. */
  label: string;
}

export function RoleSwitcher({
  roles,
  activeRole,
  action,
}: {
  roles: readonly RoleOption[];
  activeRole: string;
  /** Server action: stores the selection and revalidates the layout. */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);

  // One role is not a choice. Rendering a select that cannot change invites the
  // user to interact with something inert — and every viewer holding a single
  // membership is in exactly that state, which is most of them.
  if (roles.length < 2) return null;

  return (
    <form ref={formRef} action={action} style={{ display: 'inline-flex' }}>
      <label htmlFor="aw-role-switcher" style={SR_ONLY}>
        Acting as role
      </label>
      <select
        id="aw-role-switcher"
        name="roleName"
        /**
         * ⚠️ `key` FORCES A FRESH MOUNT WHEN THE RESOLVED ROLE CHANGES, and
         * without it this control DISPLAYS THE WRONG ROLE until a hard reload.
         *
         * Measured in a browser 2026-08-01: choose "Technician", the action
         * stores it, the layout revalidates, and the navigation correctly
         * becomes the technician tree — while this select still read
         * "Acting as Platform administrator". `defaultValue` initialises an
         * UNCONTROLLED input at mount; React does not re-apply it to an
         * existing DOM node, so a re-render restores nothing and the user's own
         * selection is discarded on reconciliation. A reload built the DOM
         * fresh and showed the right value, which is what made it look like it
         * worked.
         *
         * A control that names one role while the navigation shows another is
         * the same nav/router divergence `packages/navigation` exists to
         * prevent, wearing the badge of the thing that is supposed to fix it.
         */
        key={activeRole}
        defaultValue={activeRole}
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
        {roles.map((r) => (
          <option key={r.name} value={r.name}>
            {/* The prefix matters: a bare "Technician" next to an organisation
                name reads as a second organisation. */}
            Acting as {r.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" style={{ marginLeft: primitive.space[1] }}>
          Switch role
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
