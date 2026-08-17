'use client';

import * as React from 'react';
import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import type { ActionResult } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import type { OrgRoleOption } from './org-staff-screen';

/**
 * The appointment form, shared by the insurance and towing packs.
 *
 * ⚠️ THE ACTION IS PASSED IN, NOT CHOSEN HERE. Each pack supplies its own
 * `'use server'` entry point with the workspace id already bound server-side.
 * A workspace chosen in client code would be attacker-controlled, and the
 * workspace decides which API credential and cookie scope the request uses.
 */
export function AddOrgMemberForm({
  action,
  roles,
  organisationNoun,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  roles: readonly OrgRoleOption[];
  organisationNoun: string;
}) {
  // The FIRST option is the default, and each pack lists its operational role
  // first — appointing another administrator is the rarer, weightier act and
  // should be a deliberate choice rather than the value already in the box.
  const [role, setRole] = React.useState(roles[0]?.value ?? '');
  const hint = roles.find((r) => r.value === role)?.hint;

  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.xl,
        padding: primitive.space[6],
        background: themeVar.surfaceRaised,
      }}
    >
      <h2 style={{ margin: `0 0 ${primitive.space[2]}`, fontSize: primitive.fontSize.lg }}>
        Add a colleague
      </h2>
      <p
        style={{
          margin: `0 0 ${primitive.space[4]}`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/*
          Stated up front rather than discovered through a failure. There is no
          invitation flow yet (T-0028), and a form that looks like it will send
          an invite and instead refuses an unknown address is worse than one
          that says so first.
        */}
        They need an account already. Ask them to sign up, then add them here with
        the same email address.
      </p>

      <FormShell action={action} successPrefix="">
        <Field label="Their email address" htmlFor="userEmail">
          <TextInput
            id="userEmail"
            name="userEmail"
            type="email"
            required
            autoComplete="off"
            placeholder="colleague@example.com"
          />
        </Field>

        <Field label="What they may do" htmlFor="roleName" hint={hint}>
          <Select
            id="roleName"
            name="roleName"
            value={role}
            onChange={(e) => setRole(e.currentTarget.value)}
            options={roles.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Field>

        {/* A form without one of these shipped in this repo once, and the live
            suite has a check for it. */}
        <SubmitButton>Add to this {organisationNoun}</SubmitButton>
      </FormShell>
    </div>
  );
}

/**
 * Remove someone's access.
 *
 * A form rather than a bare button so it posts through the same server-action
 * path as everything else, and so it works with JavaScript disabled.
 */
export function WithdrawOrgMemberButton({
  action,
  membershipId,
  name,
  organisationNoun,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  membershipId: string;
  name: string;
  organisationNoun: string;
}) {
  return (
    <FormShell action={action} successPrefix="">
      <input type="hidden" name="membershipId" value={membershipId} />
      <button
        type="submit"
        // `confirm` because this is destructive from the user's point of view
        // and instant. The row survives in the database, but their access does
        // not, and there is no undo screen.
        onClick={(e) => {
          if (!window.confirm(`Remove ${name}'s access to this ${organisationNoun}?`)) {
            e.preventDefault();
          }
        }}
        style={{
          padding: `${primitive.space[2]} ${primitive.space[4]}`,
          fontSize: primitive.fontSize.sm,
          fontFamily: 'inherit',
          color: themeVar.statusDanger,
          background: 'transparent',
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          cursor: 'pointer',
        }}
      >
        Remove
      </button>
    </FormShell>
  );
}
