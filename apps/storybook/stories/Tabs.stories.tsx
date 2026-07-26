import type { Meta, StoryObj } from '@storybook/react';
import { Tabs } from '@autoworkshop/ui';

/**
 * Tabbed sections (`01 (1).txt` §69).
 *
 * The tablist implements the ARIA authoring-practice keyboard contract:
 * arrow keys move between tabs, Home/End jump to the ends, and the tablist is
 * ONE tab stop. That last part is the one that gets skipped — a `role="tablist"`
 * whose tabs are each independently tabbable is a promise the component does
 * not keep, and it is exactly the defect found in `ThemeToggle` on 2026-07-26.
 */
const meta = {
  title: 'Shell/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const jobCardTabs = [
  { id: 'overview', label: 'Overview', content: <p>Vehicle, customer and complaint summary.</p> },
  { id: 'diagnosis', label: 'Diagnosis', count: 3, content: <p>Three fault codes recorded.</p> },
  { id: 'parts', label: 'Parts', count: 12, content: <p>Twelve parts reserved from stock.</p> },
  { id: 'invoice', label: 'Invoice', disabled: true, content: <p>Available once work is signed off.</p> },
];

export const Default: Story = {
  args: { items: jobCardTabs, defaultValue: 'overview', ariaLabel: 'Job card sections' },
};

/** Counts sit beside the label so a technician sees workload without opening each tab. */
export const WithCounts: Story = {
  args: { items: jobCardTabs, defaultValue: 'parts', ariaLabel: 'Job card sections' },
};

/**
 * A disabled tab stays visible and stays announced — it explains that the step
 * exists and is not yet reachable, which a hidden tab cannot do.
 */
export const WithDisabledTab: Story = {
  args: { items: jobCardTabs, defaultValue: 'diagnosis', ariaLabel: 'Job card sections' },
};

/** Many tabs scroll horizontally rather than wrapping into a second row. */
export const Overflowing: Story = {
  args: {
    ariaLabel: 'Vehicle record sections',
    defaultValue: 'identity',
    items: [
      { id: 'identity', label: 'Identity', content: <p>VIN, plate, make, model.</p> },
      { id: 'service', label: 'Service history', content: <p>Past visits.</p> },
      { id: 'mot', label: 'MOT & roadworthiness', content: <p>Certificates.</p> },
      { id: 'insurance', label: 'Insurance', content: <p>Policy and claims.</p> },
      { id: 'telematics', label: 'Telematics', content: <p>OBD readings.</p> },
      { id: 'documents', label: 'Documents', content: <p>Uploads.</p> },
      { id: 'ownership', label: 'Ownership', content: <p>Transfer history.</p> },
    ],
  },
};

/** 360 px — the narrowest supported viewport (`01 (1).txt` §68). */
export const Mobile: Story = {
  args: { items: jobCardTabs, defaultValue: 'overview', ariaLabel: 'Job card sections' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
