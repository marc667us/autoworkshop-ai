import type { Meta, StoryObj } from '@storybook/react';
import { Dialog } from '@autoworkshop/ui';

/**
 * Modal dialog (`01 (1).txt` §69, §70).
 *
 * Focus is trapped while open and returned to the opener on close. The trap
 * lives in `useFocusTrap`, which deliberately holds `onClose` in a ref: every
 * caller passes an inline arrow, so depending on its identity tore the trap
 * down and rebuilt it on each parent render — and teardown restores focus to
 * the opener, so focus jumped out of an open dialog mid-typing. A hook whose
 * correctness depends on callers remembering to `useCallback` will be used
 * wrongly, so the fix belongs in the hook.
 */
const meta = {
  title: 'Shell/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  open: true,
  onClose: () => {},
  onConfirm: () => {},
};

export const Default: Story = {
  args: {
    ...base,
    title: 'Approve additional work?',
    description: 'The technician found a worn brake disc that was not in the original estimate.',
    confirmLabel: 'Approve GHS 480.00',
    cancelLabel: 'Not now',
  },
};

/**
 * Destructive actions get the danger tone AND a verb in the button, never a
 * bare "OK" — the button label must state what is about to happen.
 */
export const Destructive: Story = {
  args: {
    ...base,
    tone: 'danger',
    title: 'Delete this job card?',
    description: 'Job card JC-2291 and its 12 reserved parts will be released. This cannot be undone.',
    confirmLabel: 'Delete job card',
    cancelLabel: 'Keep it',
  },
};

/** While busy the dialog stays open and the confirm control is unavailable. */
export const Busy: Story = {
  args: {
    ...base,
    busy: true,
    title: 'Submitting warranty claim',
    description: 'Sending to the manufacturer portal.',
    confirmLabel: 'Submit claim',
  },
};

/**
 * The error sits inside the dialog next to the control that failed, rather than
 * as a toast that disappears before it can be read or acted on.
 */
export const WithError: Story = {
  args: {
    ...base,
    title: 'Submit warranty claim',
    description: 'Claim WC-118 for vehicle GR-4471-22.',
    confirmLabel: 'Retry submission',
    error: 'The manufacturer portal rejected the claim: policy number not recognised.',
  },
};

/** Long body content scrolls inside the dialog; the header and footer stay put. */
export const LongContent: Story = {
  args: {
    ...base,
    title: 'Terms of the repair authorisation',
    confirmLabel: 'I authorise the repair',
    children: (
      <div>
        {Array.from({ length: 14 }, (_, i) => (
          <p key={i}>
            Clause {i + 1}. The workshop will carry out only the work itemised in the accompanying
            estimate, and will seek fresh authorisation before exceeding it.
          </p>
        ))}
      </div>
    ),
  },
};

export const Mobile: Story = {
  args: {
    ...base,
    title: 'Approve additional work?',
    description: 'A worn brake disc was found during inspection.',
    confirmLabel: 'Approve GHS 480.00',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
