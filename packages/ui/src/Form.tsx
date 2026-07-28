'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Form controls — shared by every app that writes.
 *
 * MOVED HERE FROM `workshop-web/app/_screens` when customer-web needed the same
 * controls (Directive §3: extend, never duplicate). Two copies of a submit
 * handler is how one of them quietly stops preserving typed values, or stops
 * calling `checkValidity`, and nothing says so.
 *
 * ⚠️ WHY THIS IS HAND-ROLLED STATE AND NOT `useFormState`. This workspace runs
 * **React 18.3.1** (checked, not assumed — `apps/workshop-web/node_modules/react`)
 * while Next is 15.1.3. `useFormState` / `useActionState` are React 19 APIs; on
 * 18.3 they are not part of the stable `react-dom` surface, so a form built on
 * them typechecks against the wrong assumption and fails at runtime.
 *
 * A server action can still be CALLED as a plain async function from a client
 * component, which is all this needs. That has a second benefit worth having on
 * purpose: the inputs stay UNCONTROLLED and the page never re-renders from the
 * server on failure, so whatever the user typed is simply still there —
 * `01 (1).txt` §3553, "Forms shall preserve entered information after
 * recoverable errors", satisfied by construction rather than by re-populating
 * `defaultValue`s and hoping none were missed.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  color: themeVar.textPrimary,
  marginBottom: primitive.space[1],
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: primitive.space[3],
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  // Inputs do not inherit the page font by default; without this the form
  // renders in the browser's default serif and looks like a different app.
  fontFamily: 'inherit',
};

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  return (
    <div style={{ marginBottom: primitive.space[4] }}>
      {/* A real <label for>, not a styled div: it is what lets a screen reader
          announce the field, and what makes the label a click target. */}
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {hint ? (
        <p
          id={hintId}
          style={{
            margin: `0 0 ${primitive.space[2]} 0`,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
          }}
        >
          {hint}
        </p>
      ) : null}
      {/* `aria-describedby` wires the hint to the control so it is read out with
          the field rather than orphaned above it. */}
      {React.isValidElement(children) && hintId
        ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
            'aria-describedby': hintId,
          })
        : children}
    </div>
  );
}

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput(props, ref) {
  return <input ref={ref} {...props} style={{ ...controlStyle, ...props.style }} />;
});

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select {...props} style={{ ...controlStyle, ...props.style }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatusShim();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: `${primitive.space[3]} ${primitive.space[6]}`,
        fontSize: primitive.fontSize.base,
        fontWeight: 600,
        fontFamily: 'inherit',
        color: primitive.color.grey[0],
        background: pending ? primitive.color.grey[400] : primitive.color.blue[600],
        border: 'none',
        borderRadius: primitive.radius.md,
        cursor: pending ? 'progress' : 'pointer',
      }}
    >
      {/* The label changes rather than only the colour: §66 forbids colour as
          the only signal, and a disabled button with identical text reads as a
          broken button rather than a busy one. */}
      {pending ? 'Saving…' : children}
    </button>
  );
}

/** Shared pending flag, so `SubmitButton` needs no props from its parent. */
const PendingContext = React.createContext(false);
function useFormStatusShim() {
  return { pending: React.useContext(PendingContext) };
}

export interface ActionResult {
  error?: string;
  created?: string;
}

/**
 * Wraps a form, calls the server action, and renders the outcome.
 *
 * The action is invoked directly rather than through the form's `action`
 * attribute, so its RETURN VALUE is available here — that is what carries the
 * API's rejection message back to the person who can fix it.
 */
export function FormShell({
  action,
  children,
  successPrefix,
  successHref,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  successPrefix: string;
  successHref?: { href: string; label: string };
}) {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // `noValidate` below turns off the browser's AUTOMATIC blocking so this
    // handler owns submission — but it also turned off the native `required`
    // and `type="email"` checks, and an invalid address was then accepted all
    // the way into the database (Codex review of this slice, P2). Asking for
    // validity explicitly restores the immediate, per-field browser message
    // without giving up control of the submit.
    //
    // ⚠️ THIS IS NOT THE VALIDATION. It is feedback. The rules live in the
    // domain services, where an MCP tool calling the same service gets them too;
    // anything relying on this is relying on the client (CLAUDE.md §8).
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setPending(true);
    setResult(null);
    try {
      const outcome = await action(new FormData(event.currentTarget));
      setResult(outcome);
      // Cleared only on SUCCESS, so a rejected submission keeps every value.
      if (outcome.created) formRef.current?.reset();
    } catch {
      // The action itself failing (a network drop mid-call) must not leave the
      // button stuck on "Saving…" with no explanation.
      setResult({ error: 'The request could not be completed. Nothing has been saved.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        style={{
          maxWidth: '42rem',
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[6],
          background: themeVar.backgroundSecondary,
        }}
      >
        {/* `role="status"` / `role="alert"` so the outcome is ANNOUNCED. A
            visually-obvious banner that a screen reader never mentions leaves a
            blind user unsure whether the button worked. */}
        {result?.created ? (
          <p
            role="status"
            style={{
              margin: `0 0 ${primitive.space[4]} 0`,
              padding: primitive.space[3],
              borderRadius: primitive.radius.md,
              background: primitive.color.green[50],
              color: primitive.color.green[700],
              border: `1px solid ${primitive.color.green[500]}`,
            }}
          >
            {successPrefix} <strong>{result.created}</strong>.{' '}
            {successHref ? <a href={successHref.href}>{successHref.label}</a> : null}
          </p>
        ) : null}

        {result?.error ? (
          <p
            role="alert"
            style={{
              margin: `0 0 ${primitive.space[4]} 0`,
              padding: primitive.space[3],
              borderRadius: primitive.radius.md,
              background: primitive.color.red[50],
              color: primitive.color.red[700],
              border: `1px solid ${primitive.color.red[500]}`,
            }}
          >
            {result.error}
          </p>
        ) : null}

        {children}
      </form>
    </PendingContext.Provider>
  );
}
