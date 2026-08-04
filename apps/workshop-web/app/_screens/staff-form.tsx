'use client';

import * as React from 'react';
import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { addStaffAction, withdrawStaffAction } from './staff-actions';
import { WORKSHOP_ROLES } from './staff-roles';


export function AddStaffForm() {
  const [role, setRole] = React.useState('technician');
  const hint = WORKSHOP_ROLES.find((r) => r.value === role)?.hint;

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

      <FormShell action={addStaffAction} successPrefix="">
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
            options={WORKSHOP_ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Field>

        {/* A form without one of these shipped in this repo once. */}
        <SubmitButton>Add to this workshop</SubmitButton>
      </FormShell>
    </div>
  );
}

/**
 * Remove someone's access.
 *
 * A form rather than a bare button so it posts through the same server action
 * path as everything else, and so it works with JavaScript disabled.
 */
export function WithdrawStaffButton({
  membershipId,
  name,
}: {
  membershipId: string;
  name: string;
}) {
  return (
    <FormShell action={withdrawStaffAction} successPrefix="">
      <input type="hidden" name="membershipId" value={membershipId} />
      <button
        type="submit"
        // `confirm` because this is destructive from the user's point of view
        // and instant. The row survives in the database, but their access does
        // not, and there is no undo screen.
        onClick={(e) => {
          if (!window.confirm(`Remove ${name}'s access to this workshop?`)) e.preventDefault();
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
