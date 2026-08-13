'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  addQuotationLineAction,
  recordQuotationDetailsAction,
  removeQuotationLineAction,
  submitQuotationAction,
  updateQuotationLineAction,
} from './quotation-actions';
import { LINE_KIND_LABEL, LINE_KIND_ORDER, formatMoney } from './quotation-labels';

/**
 * Pricing a draft quotation — `07.txt` §11's review, §4's document, §5's submission.
 *
 * ── THE UNPRICED LINES ARE THE POINT OF THIS SCREEN ────────────────────────
 *
 * `prepare()` generates labour lines at the workshop's rate and part lines at ZERO,
 * because there is no parts catalogue in this build and inventing a price would put a
 * fabricated figure in front of a customer. So the advisor's job here is to price
 * them, and the screen says which are outstanding BEFORE they press submit — the API
 * refuses them either way, but a refusal a person could have seen coming is a worse
 * experience than a warning.
 *
 * Each line is its own form: one big form would lose a half-typed price because an
 * unrelated field failed, and would make "remove line 3" and "price line 1" the same
 * submission.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT and not the rule layer. Renders only when the API
 * said `editable`; every rule is enforced in `QuotationService` (CLAUDE.md §8).
 */

interface Line {
  id: string;
  position: number;
  lineKind: string;
  lineKindLabel: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  lineTotal: number;
  isOptional: boolean;
}

export function QuotationEditorForm(props: {
  quotationId: string;
  jobNumber: string;
  currency: string;
  lines: Line[];
  subtotal: number;
  discountAmount: number;
  discountReason: string | null;
  taxName: string;
  taxRatePercent: number;
  taxAmount: number;
  total: number;
  optionalTotal: number;
  validUntil: string | null;
  warrantyTerms: string | null;
  completionConditions: string | null;
  recommendedRepair: string | null;
  alternativeOptions: string | null;
}) {
  const { quotationId, currency, lines } = props;
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(
    key: string,
    action: (d: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action(data);
      if (outcome.error) {
        setError(outcome.error);
        return false;
      }
      setNotice(outcome.created ?? 'Saved');
      // `revalidatePath` marks the server cache stale; it does NOT repaint the page the
      // advisor is looking at. Without this a removed line stays on screen.
      router.refresh();
      return true;
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  // The submission gates, mirrored so they are visible before the button is pressed.
  const chargeable = lines.filter((l) => !l.isOptional);
  const unpriced = chargeable.filter((l) => l.unitPrice === 0 && l.lineKind !== 'other_charge');
  const blocked =
    chargeable.length === 0 || unpriced.length > 0 || props.discountAmount > props.subtotal;

  return (
    <div style={{ display: 'grid', gap: primitive.space[6] }}>
      {notice ? (
        <p role="status" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}

      {/* ── the lines ─────────────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Lines — priced from the approved repair plan</h2>
        {unpriced.length > 0 ? (
          <p role="status" style={{ ...hint, color: primitive.color.red[700] }}>
            {unpriced.length} line(s) are still priced at zero. Parts arrive unpriced
            because there is no catalogue yet — price them, mark them optional, or remove
            them before submitting.
          </p>
        ) : null}

        {lines.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            No lines. A quotation cannot be submitted without at least one chargeable line.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[3] }}>
            {lines.map((line) => (
              <li key={line.id}>
                <LineRow
                  quotationId={quotationId}
                  currency={currency}
                  line={line}
                  busy={busy}
                  run={run}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── §11's external services and §4's other charges ────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Add a line the plan did not produce</h2>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            data.set('quotationId', quotationId);
            if (await run('add', addQuotationLineAction, data)) form.reset();
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <div style={twoUp}>
            <Field label="Description" htmlFor="line-desc" required>
              <input id="line-desc" name="description" maxLength={500} placeholder="Wheel alignment, external" style={input} />
            </Field>
            <Field label="Kind" htmlFor="line-kind" required>
              <select id="line-kind" name="lineKind" defaultValue="external_service" style={input}>
                {LINE_KIND_ORDER.map((k) => (
                  <option key={k} value={k}>{LINE_KIND_LABEL[k]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="Quantity" htmlFor="line-qty" required>
              <input id="line-qty" name="quantity" inputMode="decimal" defaultValue="1" style={input} />
            </Field>
            <Field label={`Unit price (${currency})`} htmlFor="line-price" required>
              <input id="line-price" name="unitPrice" inputMode="decimal" defaultValue="0" style={input} />
            </Field>
          </div>
          <label style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
            <input type="checkbox" name="isOptional" />
            {/* §4's "alternative options where applicable" — excluded from the total,
                so the customer is not quoted for something they may decline. */}
            An optional extra — shown to the customer but not in the total
          </label>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'add')}>
            {busy === 'add' ? 'Adding…' : 'Add line'}
          </button>
        </form>
      </section>

      {/* ── §11's discount, §4's terms ────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Discount, validity, warranty and conditions</h2>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            data.set('quotationId', quotationId);
            await run('details', recordQuotationDetailsAction, data);
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <div style={twoUp}>
            <Field label={`Discount (${currency})`} htmlFor="q-discount">
              <input id="q-discount" name="discountAmount" inputMode="decimal"
                defaultValue={props.discountAmount === 0 ? '' : String(props.discountAmount)} style={input} />
            </Field>
            <Field label="Reason for the discount" htmlFor="q-discount-reason">
              <input id="q-discount-reason" name="discountReason" maxLength={2000}
                defaultValue={props.discountReason ?? ''} style={input} />
            </Field>
          </div>
          <Field label="Valid until" htmlFor="q-valid">
            <input id="q-valid" name="validUntil" type="date" defaultValue={props.validUntil ?? ''} style={input} />
          </Field>
          <Field label="Recommended repair (§4)" htmlFor="q-recommended">
            <textarea id="q-recommended" name="recommendedRepair" rows={2} maxLength={8000}
              defaultValue={props.recommendedRepair ?? ''} style={input} />
          </Field>
          <Field label="Alternative options (§4)" htmlFor="q-alternatives">
            <textarea id="q-alternatives" name="alternativeOptions" rows={2} maxLength={8000}
              defaultValue={props.alternativeOptions ?? ''} style={input} />
          </Field>
          <Field label="Expected completion conditions (§4)" htmlFor="q-conditions">
            <textarea id="q-conditions" name="completionConditions" rows={2} maxLength={8000}
              defaultValue={props.completionConditions ?? ''} style={input} />
          </Field>
          <Field label="Warranty (§4)" htmlFor="q-warranty">
            <textarea id="q-warranty" name="warrantyTerms" rows={2} maxLength={8000}
              defaultValue={props.warrantyTerms ?? ''} style={input} />
          </Field>
          <p style={hint}>
            {/* The clear-semantics, stated rather than discovered. */}
            Emptying a box clears it. A discount larger than the subtotal is refused — that
            would quote a negative price.
          </p>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'details')}>
            {busy === 'details' ? 'Saving…' : 'Save details'}
          </button>
        </form>
      </section>

      {/* ── the totals ────────────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Total</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: primitive.space[3], margin: 0 }}>
          <Amount label="Subtotal" value={formatMoney(props.subtotal, currency)} />
          {props.discountAmount > 0 ? (
            <Amount label="Discount" value={`- ${formatMoney(props.discountAmount, currency)}`} />
          ) : null}
          <Amount label={`${props.taxName} at ${props.taxRatePercent}%`} value={formatMoney(props.taxAmount, currency)} />
          <Amount label="Total" value={formatMoney(props.total, currency)} strong />
          {props.optionalTotal > 0 ? (
            <Amount label="Optional extras (not included)" value={formatMoney(props.optionalTotal, currency)} />
          ) : null}
        </dl>
      </section>

      {/* ── §5: submit ────────────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Submit for internal approval</h2>
        {blocked ? (
          // Says WHICH rule and what to do, rather than disabling a button silently.
          <p style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
            {chargeable.length === 0
              ? 'Every line is marked optional, so nothing is being quoted for the repair itself. Add a chargeable line.'
              : unpriced.length > 0
                ? `${unpriced.length} line(s) are still priced at zero and would quote the customer nothing for them.`
                : 'The discount is larger than the subtotal, which would quote a negative price.'}
          </p>
        ) : null}
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData();
            data.set('quotationId', quotationId);
            await run('submit', submitQuotationAction, data);
          }}
        >
          <button
            type="submit"
            disabled={busy !== null || blocked}
            aria-label={`Submit the quotation for job card ${props.jobNumber} for internal approval`}
            style={primary(busy === 'submit', blocked)}
          >
            {busy === 'submit' ? 'Submitting…' : 'Submit for approval'}
          </button>
        </form>
      </section>
    </div>
  );
}

function LineRow({
  quotationId,
  currency,
  line,
  busy,
  run,
}: {
  quotationId: string;
  currency: string;
  line: Line;
  busy: string | null;
  run: (
    key: string,
    action: (d: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ) => Promise<boolean>;
}) {
  const unpriced = line.unitPrice === 0 && !line.isOptional && line.lineKind !== 'other_charge';
  return (
    <div style={row}>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          data.set('quotationId', quotationId);
          data.set('lineId', line.id);
          await run(`save-${line.id}`, updateQuotationLineAction, data);
        }}
        style={{ display: 'grid', gap: primitive.space[2], flex: 1, minWidth: 0 }}
      >
        <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'baseline' }}>
          <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textSecondary }}>
            {line.position}.
          </span>
          <input
            name="description"
            defaultValue={line.description}
            maxLength={500}
            aria-label={`Description of line ${line.position}`}
            style={{ ...input, flex: 1, minWidth: 0 }}
          />
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {line.lineKindLabel}
          </span>
        </div>

        <div style={twoUp}>
          <input name="quantity" defaultValue={String(line.quantity)} inputMode="decimal"
            aria-label={`Quantity on line ${line.position}`} style={input} />
          <input name="unitPrice" defaultValue={line.unitPrice.toFixed(2)} inputMode="decimal"
            aria-label={`Unit price on line ${line.position}`} style={input} />
        </div>

        <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textPrimary }}>
            {/* The DATABASE computed this — it cannot disagree with the quantity and
                price beside it. */}
            {formatMoney(line.lineTotal, currency)}
          </span>
          <label style={{ display: 'flex', gap: primitive.space[1], alignItems: 'center', fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
            <input type="checkbox" name="isOptional" defaultChecked={line.isOptional} />
            Optional
          </label>
          {unpriced ? (
            // Not colour alone (§66) — the words carry it.
            <span style={{ fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
              Not priced yet
            </span>
          ) : null}
          <button type="submit" disabled={busy !== null} aria-label={`Save line ${line.position}`} style={secondary}>
            {busy === `save-${line.id}` ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData();
          data.set('quotationId', quotationId);
          data.set('lineId', line.id);
          await run(`rm-${line.id}`, removeQuotationLineAction, data);
        }}
      >
        {/* The escape hatch — `update` can correct a line but cannot remove a duplicate,
            and a second attempt cannot start while this one is open. */}
        <button
          type="submit"
          disabled={busy !== null}
          aria-label={`Remove line ${line.position}, ${line.description}`}
          style={danger(busy === `rm-${line.id}`)}
        >
          Remove
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
      {/* A REAL <label>, never `visuallyHidden` — that class is `position: absolute` and
          escapes any ancestor that is not positioned. */}
      <label htmlFor={htmlFor} style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary }}>
        {label}{required ? ' *' : ''}
      </label>
      {children}
    </div>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd style={{ margin: 0, color: themeVar.textPrimary, fontFamily: primitive.fontFamily.mono, fontWeight: strong ? 700 : 400 }}>
        {value}
      </dd>
    </div>
  );
}

const panel = {
  padding: primitive.space[4],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  position: 'relative' as const,
};
const heading = { margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.base, color: themeVar.textPrimary };
const hint = { margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary };
const row = {
  display: 'flex',
  gap: primitive.space[3],
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap' as const,
  padding: primitive.space[3],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.surfaceRaised,
  position: 'relative' as const,
};
const twoUp = {
  display: 'grid',
  // `minmax(min(14rem, 100%), 1fr)` — a grid track's default minimum is its CONTENT, so
  // a long value would push the track wider than its share and scroll the page sideways.
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
  gap: primitive.space[2],
  minWidth: 0,
};
const input = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box' as const,
  padding: primitive.space[2],
  fontSize: primitive.fontSize.sm,
  fontFamily: 'inherit',
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
};
function primary(busy: boolean, blocked = false) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy || blocked ? primitive.color.grey[400] : primitive.color.blue[600],
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : blocked ? ('not-allowed' as const) : ('pointer' as const),
    justifySelf: 'start' as const,
  };
}
const secondary = {
  padding: primitive.space[1],
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  fontFamily: 'inherit',
  color: primitive.color.blue[600],
  background: 'transparent',
  border: `1px solid ${primitive.color.blue[600]}`,
  borderRadius: primitive.radius.md,
  cursor: 'pointer' as const,
};
function danger(busy: boolean) {
  return {
    padding: primitive.space[1],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.red[700],
    background: 'transparent',
    border: `1px solid ${primitive.color.red[700]}`,
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : ('pointer' as const),
  };
}
