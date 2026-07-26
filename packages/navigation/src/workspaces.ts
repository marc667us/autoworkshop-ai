/**
 * Per-workspace side-navigation trees.
 *
 * TRANSCRIBED, NOT DESIGNED. Every group and every item below comes from
 * `autoworkshop 01 (1).txt`:
 *   §33 Customer · §34 Workshop · §35 Supplier
 * Labels are the spec's labels. Order is the spec's order. If you think an
 * item is missing, check the spec before adding it — and if the spec really is
 * missing something, change the spec first. The owner rejected all scope cuts
 * (CLAUDE.md §4), so items are never dropped here for convenience.
 *
 * `href`s follow one rule: `/<group-id>/<item-id>`, with the group's first item
 * doubling as the group landing page. That keeps route files mechanically
 * derivable from this tree instead of hand-maintained in parallel.
 */

import type { NavGroup, Workspace } from './types';

/** Build an item whose href follows the `/group/item` convention. */
function item(
  groupId: string,
  id: string,
  label: string,
  extra: { permission?: string; counterKey?: string; warningKey?: string } = {},
): NavGroup['items'][number] {
  return { id, label, href: `/${groupId}/${id}`, ...extra };
}

/** Build a group, wiring each item's href to the group id. */
function group(
  id: string,
  label: string,
  icon: string,
  items: Array<[string, string] | [string, string, { permission?: string; counterKey?: string; warningKey?: string }]>,
  permission?: string,
): NavGroup {
  return {
    id,
    label,
    icon,
    permission,
    items: items.map(([itemId, itemLabel, extra]) => item(id, itemId, itemLabel, extra ?? {})),
  };
}

/* ------------------------------------------------------------------ *
 * §33 — CUSTOMER WORKSPACE
 * ------------------------------------------------------------------ */

const customerGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Dashboard'],
    ['my-tasks', 'My Tasks', { counterKey: 'customer.tasks.open' }],
    ['notifications', 'Notifications', { counterKey: 'customer.notifications.unread' }],
  ]),
  group('my-vehicles', 'My Vehicles', 'car', [
    ['garage', 'Vehicle Garage'],
    ['add-vehicle', 'Add Vehicle'],
    ['documents', 'Vehicle Documents'],
    ['maintenance-schedule', 'Maintenance Schedule'],
    ['service-history', 'Service History'],
  ]),
  group('service-and-repairs', 'Service and Repairs', 'wrench', [
    ['report-a-problem', 'Report a Problem'],
    ['service-requests', 'Service Requests'],
    ['appointments', 'Appointments'],
    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
    ['repair-tracking', 'Repair Tracking'],
    ['completed-repairs', 'Completed Repairs'],
  ]),
  group('parts-and-warranty', 'Parts and Warranty', 'cog', [
    ['installed-parts', 'Installed Parts'],
    ['product-recommendations', 'Product Recommendations'],
    ['warranty', 'Warranty'],
    ['warranty-claims', 'Warranty Claims'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'customer.messages.unread' }],
    ['voice-calls', 'Voice Calls'],
    ['video-consultations', 'Video Consultations'],
    ['shared-files', 'Shared Files'],
  ]),
  group('payments', 'Payments', 'card', [
    ['quotations', 'Quotations'],
    ['invoices', 'Invoices'],
    ['payments', 'Payments'],
    ['receipts', 'Receipts'],
  ]),
  group('support', 'Support', 'lifebuoy', [
    ['towing', 'Towing and Roadside Support'],
    ['knowledge', 'Knowledge and Maintenance Tips'],
    ['help-center', 'Help Center'],
    ['support-cases', 'Support Cases'],
  ]),
  group('settings', 'Settings', 'settings', [
    ['profile', 'Profile'],
    ['authorized-drivers', 'Authorized Drivers'],
    ['communication-preferences', 'Communication Preferences'],
    ['security', 'Security'],
  ]),
];

/* ------------------------------------------------------------------ *
 * §34 — WORKSHOP WORKSPACE
 * ------------------------------------------------------------------ */

const workshopGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Dashboard'],
    ['tasks', 'Tasks', { counterKey: 'workshop.tasks.open' }],
    ['approvals', 'Approvals', { counterKey: 'workshop.approvals.pending' }],
    ['calendar', 'Calendar'],
  ]),
  group('customer-reception', 'Customer Reception', 'users', [
    ['customers', 'Customers'],
    ['vehicles', 'Vehicles'],
    ['new-complaints', 'New Complaints', { counterKey: 'workshop.complaints.new' }],
    ['appointments', 'Appointments', { counterKey: 'workshop.appointments.today' }],
    ['vehicle-intake', 'Vehicle Intake'],
  ]),
  group('workshop-floor', 'Workshop Floor', 'factory', [
    // §21: "The Repair Staging item shall display the number of active jobs."
    ['repair-staging', 'Repair Staging', { counterKey: 'workshop.jobs.active' }],
    ['job-cards', 'Job Cards'],
    ['technicians', 'Technicians'],
    ['service-bays', 'Service Bays'],
    ['tools-and-equipment', 'Tools and Equipment'],
  ]),
  group('repair-services', 'Repair Services', 'wrench', [
    ['inspection', 'Inspection'],
    ['diagnosis', 'Diagnosis'],
    ['repair-plans', 'Repair Plans'],
    ['repairs-in-progress', 'Repairs in Progress'],
    ['testing', 'Testing'],
    ['quality-control', 'Quality Control'],
  ]),
  group('solution-and-approval', 'Solution and Approval', 'sparkles', [
    ['solution-studio', 'Solution Studio'],
    ['quotations', 'Quotations'],
    ['customer-proposals', 'Customer Proposals'],
    // §23: pending approvals carry an outstanding count.
    ['approvals', 'Approvals', { counterKey: 'workshop.proposals.pendingApproval' }],
    ['variations', 'Variations'],
  ]),
  group('parts-and-supply', 'Parts and Supply', 'box', [
    ['parts-depot', 'Parts Depot'],
    ['reservations', 'Reservations'],
    // §24: reorder alerts and quarantine carry warning badges.
    ['procurement', 'Procurement', { warningKey: 'workshop.parts.reorderAlerts' }],
    ['goods-receipt', 'Goods Receipt'],
    ['suppliers', 'Suppliers'],
    ['marketplace', 'Marketplace'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'workshop.messages.unread' }],
    ['calls', 'Calls'],
    ['video-consultations', 'Video Consultations'],
    ['specialist-support', 'Specialist Support'],
  ]),
  group('knowledge-and-staff', 'Knowledge and Staff', 'book', [
    ['repair-knowledge', 'Repair Knowledge'],
    ['training', 'Training'],
    ['technician-competencies', 'Technician Competencies'],
    ['certifications', 'Certifications'],
  ]),
  group('finance-and-warranty', 'Finance and Warranty', 'card', [
    // §29: "Sensitive financial menu items shall be restricted by permission."
    ['invoices', 'Invoices', { permission: 'finance.read' }],
    ['payments', 'Payments', { permission: 'finance.read' }],
    ['warranty-records', 'Warranty Records'],
    ['warranty-claims', 'Warranty Claims'],
  ]),
  group('reports', 'Reports', 'chart', [
    ['operations', 'Operations'],
    ['technicians', 'Technicians'],
    ['inventory', 'Inventory'],
    ['financial', 'Financial', { permission: 'finance.read' }],
    ['customer-service', 'Customer Service'],
  ]),
  group(
    'settings',
    'Settings',
    'settings',
    [
      ['workshop-profile', 'Workshop Profile'],
      ['branches', 'Branches'],
      ['staff-and-roles', 'Staff and Roles'],
      ['workflow-rules', 'Workflow Rules'],
      ['integrations', 'Integrations'],
    ],
    // Whole group is admin-only.
    'organization.admin',
  ),
];

/* ------------------------------------------------------------------ *
 * §35 — SUPPLIER WORKSPACE
 * ------------------------------------------------------------------ */

const supplierGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Dashboard'],
    ['tasks', 'Tasks', { counterKey: 'supplier.tasks.open' }],
    ['notifications', 'Notifications', { counterKey: 'supplier.notifications.unread' }],
  ]),
  group('business-profile', 'Business Profile', 'building', [
    ['supplier-profile', 'Supplier Profile'],
    ['verification', 'Verification'],
    ['branches', 'Branches'],
    ['staff', 'Staff'],
  ]),
  group('products', 'Products', 'box', [
    ['product-catalogue', 'Product Catalogue'],
    ['add-product', 'Add Product'],
    ['bulk-upload', 'Bulk Upload'],
    ['draft-products', 'Draft Products'],
    ['verification-tasks', 'Verification Tasks', { counterKey: 'supplier.verification.pending' }],
    ['suspended-products', 'Suspended Products', { warningKey: 'supplier.products.suspended' }],
  ]),
  group('inventory', 'Inventory', 'layers', [
    ['stock', 'Stock'],
    ['locations', 'Locations'],
    ['stock-adjustments', 'Stock Adjustments'],
    ['low-stock-alerts', 'Low-Stock Alerts', { warningKey: 'supplier.stock.low' }],
  ]),
  group('orders-and-delivery', 'Orders and Delivery', 'truck', [
    ['new-orders', 'New Orders', { counterKey: 'supplier.orders.new' }],
    ['confirmed-orders', 'Confirmed Orders'],
    ['dispatch', 'Dispatch'],
    ['deliveries', 'Deliveries'],
    ['returns', 'Returns'],
    ['warranty-cases', 'Warranty Cases'],
  ]),
  group('marketplace', 'Marketplace', 'store', [
    ['marketplace-profile', 'Marketplace Profile'],
    ['customer-inquiries', 'Customer Inquiries', { counterKey: 'supplier.inquiries.open' }],
    ['product-performance', 'Product Performance'],
    ['pricing', 'Pricing'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'supplier.messages.unread' }],
    ['workshop-conversations', 'Workshop Conversations'],
    ['support-cases', 'Support Cases'],
  ]),
  group('finance', 'Finance', 'card', [
    ['invoices', 'Invoices', { permission: 'finance.read' }],
    ['settlements', 'Settlements', { permission: 'finance.read' }],
    ['subscriptions', 'Subscriptions'],
    ['reports', 'Reports'],
  ]),
  group(
    'settings',
    'Settings',
    'settings',
    [
      ['users-and-roles', 'Users and Roles'],
      ['notification-preferences', 'Notification Preferences'],
      ['integrations', 'Integrations'],
      ['security', 'Security'],
    ],
    'organization.admin',
  ),
];

/* ------------------------------------------------------------------ *
 * §36 — FLEET WORKSPACE
 * ------------------------------------------------------------------ */

const fleetGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Dashboard'],
    ['tasks', 'Tasks', { counterKey: 'fleet.tasks.open' }],
    ['approvals', 'Approvals', { counterKey: 'fleet.approvals.pending' }],
  ]),
  group('fleet-assets', 'Fleet Assets', 'car', [
    ['vehicles', 'Vehicles'],
    ['drivers', 'Drivers'],
    ['vehicle-documents', 'Vehicle Documents'],
  ]),
  group('service-management', 'Service Management', 'wrench', [
    ['maintenance-plans', 'Maintenance Plans'],
    ['service-requests', 'Service Requests'],
    ['appointments', 'Appointments'],
    ['repairs-in-progress', 'Repairs in Progress'],
    ['completed-repairs', 'Completed Repairs'],
  ]),
  group('approvals', 'Approvals', 'sparkles', [
    ['quotations', 'Quotations'],
    ['pending-approvals', 'Pending Approvals', { counterKey: 'fleet.approvals.pending' }],
    ['approval-history', 'Approval History'],
  ]),
  group('workshops-and-parts', 'Workshops and Parts', 'box', [
    ['approved-workshops', 'Approved Workshops'],
    ['suppliers', 'Suppliers'],
    ['parts-installed', 'Parts Installed'],
    ['warranties', 'Warranties'],
  ]),
  group('cost-and-performance', 'Cost and Performance', 'chart', [
    ['downtime', 'Downtime'],
    ['vehicle-costs', 'Vehicle Costs'],
    ['invoices', 'Invoices', { permission: 'finance.read' }],
    ['reports', 'Reports'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'fleet.messages.unread' }],
    ['calls', 'Calls'],
    ['support', 'Support'],
  ]),
  group(
    'settings',
    'Settings',
    'settings',
    [
      ['organization', 'Organization'],
      ['users', 'Users'],
      ['approval-limits', 'Approval Limits'],
      ['service-policies', 'Service Policies'],
    ],
    'organization.admin',
  ),
];

/* ------------------------------------------------------------------ *
 * §37 — INSURANCE WORKSPACE
 * ------------------------------------------------------------------ */

const insuranceGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Dashboard'],
    ['tasks', 'Tasks', { counterKey: 'insurance.tasks.open' }],
    ['approvals', 'Approvals', { counterKey: 'insurance.approvals.pending' }],
  ]),
  group('claims', 'Claims', 'book', [
    ['new-claims', 'New Claims', { counterKey: 'insurance.claims.new' }],
    ['under-review', 'Claims Under Review'],
    ['assigned-to-me', 'Assigned to Me'],
    ['closed-claims', 'Closed Claims'],
  ]),
  group('assessment', 'Assessment', 'wrench', [
    ['damage-evidence', 'Damage Evidence'],
    ['inspection-requests', 'Inspection Requests'],
    ['assessors', 'Assessors'],
    ['repair-estimates', 'Repair Estimates'],
  ]),
  group('repair-authorization', 'Repair Authorization', 'sparkles', [
    ['pending-approvals', 'Pending Approvals', { counterKey: 'insurance.authorizations.pending' }],
    ['approved-repairs', 'Approved Repairs'],
    ['rejected-requests', 'Rejected Requests'],
    ['supplementary-requests', 'Supplementary Requests'],
  ]),
  group('workshops-and-products', 'Workshops and Products', 'box', [
    ['approved-workshops', 'Approved Workshops'],
    ['parts-review', 'Parts Review'],
    ['supplier-information', 'Supplier Information'],
  ]),
  group('finance-and-reports', 'Finance and Reports', 'card', [
    ['payments', 'Payments', { permission: 'finance.read' }],
    ['claim-costs', 'Claim Costs', { permission: 'finance.read' }],
    ['reports', 'Reports'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'insurance.messages.unread' }],
    ['calls', 'Calls'],
    ['disputes', 'Disputes', { warningKey: 'insurance.disputes.open' }],
  ]),
  group(
    'settings',
    'Settings',
    'settings',
    [
      ['users', 'Users'],
      ['approval-rules', 'Approval Rules'],
      ['claim-rules', 'Claim Rules'],
      ['integrations', 'Integrations'],
    ],
    'organization.admin',
  ),
];

/* ------------------------------------------------------------------ *
 * TOWING WORKSPACE — `autoworkshop 02.txt` §52
 *
 * NOTE THE DIFFERENT SOURCE. §52 gives towing a FLAT list of 10 entries, not
 * the grouped structure §33-37 use for the other workspaces. That is the spec's
 * shape, so it is preserved: one group holding the flat list, rather than
 * inventing groupings the spec never asked for. If grouping is wanted later it
 * is a spec change first.
 * ------------------------------------------------------------------ */

const towingGroups: NavGroup[] = [
  group('operations', 'Operations', 'truck', [
    ['dashboard', 'Dashboard'],
    ['new-requests', 'New Requests', { counterKey: 'towing.requests.new' }],
    ['dispatch-board', 'Dispatch Board', { counterKey: 'towing.dispatch.active' }],
    ['drivers', 'Drivers'],
    ['recovery-vehicles', 'Recovery Vehicles'],
    ['active-recoveries', 'Active Recoveries', { counterKey: 'towing.recoveries.active' }],
    ['completed-recoveries', 'Completed Recoveries'],
    ['invoices', 'Invoices', { permission: 'finance.read' }],
    ['incidents', 'Incidents', { warningKey: 'towing.incidents.open' }],
    ['settings', 'Settings', { permission: 'organization.admin' }],
  ]),
];

/* ------------------------------------------------------------------ *
 * PLATFORM ADMINISTRATION — `autoworkshop 02.txt` §58
 *
 * Also a flat list in the spec (25 entries). Split here into themed groups
 * because a 25-item flat side nav is precisely what §16 exists to prevent
 * ("rather than displayed as a long list of individual links"). Every LABEL is
 * the spec's; only the grouping is applied, and §32's own group titles are
 * reused so the naming stays the spec's too.
 *
 * The whole workspace is gated on `platform.admin` — §32: "visible only to
 * authorized administrative, security and operational users."
 * ------------------------------------------------------------------ */

const adminGroups: NavGroup[] = [
  group('home', 'Home', 'home', [['operations-dashboard', 'Operations Dashboard']], 'platform.admin'),
  group(
    'directory',
    'Directory',
    'users',
    [
      ['users', 'Users'],
      ['organizations', 'Organizations'],
      ['workshops', 'Workshops'],
      ['technicians', 'Technicians'],
      ['suppliers', 'Suppliers'],
      ['fleet-organizations', 'Fleet Organizations'],
      ['insurance-organizations', 'Insurance Organizations'],
      ['towing-providers', 'Towing Providers'],
      ['training-institutions', 'Training Institutions'],
    ],
    'platform.admin',
  ),
  group(
    'catalogue-and-content',
    'Catalogue and Content',
    'box',
    [
      ['products', 'Products'],
      ['content-moderation', 'Content Moderation'],
    ],
    'platform.admin',
  ),
  group(
    'governance',
    'Governance',
    'settings',
    [
      ['roles-and-permissions', 'Role and Permission Management'],
      ['subscription-plans', 'Subscription Plans'],
      ['feature-flags', 'Feature Flags'],
      ['system-configuration', 'System Configuration'],
      ['integrations', 'Integrations'],
    ],
    'platform.admin',
  ),
  group(
    'security-and-operations',
    'Security and Operations',
    'lifebuoy',
    [
      ['audit', 'Audit'],
      ['security', 'Security'],
      ['incidents', 'Incidents', { warningKey: 'admin.incidents.active' }],
      ['backups', 'Backups'],
      ['disaster-recovery', 'Disaster Recovery'],
    ],
    'platform.admin',
  ),
  group(
    'ai-and-mcp',
    'AI and MCP',
    'sparkles',
    [
      ['mcp-servers', 'MCP Servers'],
      ['ai-agents', 'AI Agents'],
    ],
    'platform.admin',
  ),
  group('reports', 'Reports', 'chart', [['reports', 'Reports']], 'platform.admin'),
];

/* ------------------------------------------------------------------ */

/**
 * `satisfies` rather than a `Record<string, Workspace>` annotation: the
 * annotation would widen the key type to `string`, making every literal lookup
 * (`workspaces.customer`) possibly-undefined and forcing `!` at each call site.
 * `satisfies` still type-checks each entry against `Workspace` while keeping
 * the literal keys, so known workspaces resolve to a definite value.
 */
export const workspaces = {
  customer: {
    id: 'customer',
    label: 'Customer',
    audience: 'Vehicle owners — garage, complaints, proposals, payments',
    groups: customerGroups,
  },
  workshop: {
    id: 'workshop',
    label: 'Workshop',
    audience: 'Technicians and managers — job cards, staging board, diagnosis',
    groups: workshopGroups,
  },
  supplier: {
    id: 'supplier',
    label: 'Supplier',
    audience: 'Parts suppliers — catalogue, stock, orders, marketplace',
    groups: supplierGroups,
  },
  fleet: {
    id: 'fleet',
    label: 'Fleet',
    audience: 'Fleet operators — vehicles, drivers, maintenance plans, approvals',
    groups: fleetGroups,
  },
  insurance: {
    id: 'insurance',
    label: 'Insurance',
    audience: 'Insurers — claims, assessment, repair authorization',
    groups: insuranceGroups,
  },
  towing: {
    id: 'towing',
    label: 'Towing',
    audience: 'Towing providers — dispatch board, recoveries, drivers',
    groups: towingGroups,
  },
  admin: {
    id: 'admin',
    label: 'Platform Administration',
    audience: 'Platform administrators — organizations, security, incidents, MCP, agents',
    groups: adminGroups,
  },
} satisfies Record<string, Workspace>;

/**
 * Workspaces whose navigation is not transcribed yet.
 *
 * Empty as of 2026-07-26 — all seven workspaces are now transcribed:
 *   `01 (1).txt` §33 customer · §34 workshop · §35 supplier · §36 fleet · §37 insurance
 *   `02.txt`     §52 towing   · §58 platform administration
 *
 * Kept (rather than deleted) as the declared place for a workspace that exists
 * as an app but has no navigation yet, so such a gap is visible instead of
 * silently rendering an empty sidebar.
 */
export const pendingWorkspaces: readonly string[] = [];

/**
 * Look a workspace up by id. Returns `undefined` for the §36-39 workspaces
 * that are not transcribed yet — callers must handle that rather than assume.
 */
export function getWorkspace(id: string): Workspace | undefined {
  return (workspaces as Record<string, Workspace>)[id];
}
