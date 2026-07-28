import { describe, it, expect } from 'vitest';
import { hasWorkspaceAccess } from './WorkspaceGate';
import type { ViewerDescription } from './viewer-contract';

/**
 * T-0005 finding 4. The gate exists because route-tree filtering inside
 * `renderModulePage` protected the admin workspace only for as long as every
 * route went through the catch-all — and Next resolves a concrete
 * `page.tsx` ahead of `[...slug]`. These tests pin the FAIL-CLOSED shape, which
 * is the property that a later refactor is most likely to invert by accident.
 */
const viewer = (permissions: string[]): ViewerDescription =>
  ({
    userId: 'u1',
    displayName: 'A. User',
    tenantId: 't1',
    organizationId: 'o1',
    branchId: null,
    activeRole: 'technician',
    permissions,
    memberships: [],
  }) as unknown as ViewerDescription;

describe('hasWorkspaceAccess', () => {
  it('allows a viewer holding the required grant', () => {
    expect(hasWorkspaceAccess(viewer(['platform.admin']), 'platform.admin')).toBe(true);
  });

  it('DENIES a signed-out viewer', () => {
    expect(hasWorkspaceAccess(null, 'platform.admin')).toBe(false);
  });

  it('DENIES a signed-in viewer who holds other grants but not this one', () => {
    // The realistic case: a workshop owner with plenty of authority in their own
    // workspace and none at all in platform administration.
    expect(hasWorkspaceAccess(viewer(['organization.admin', 'finance.read']), 'platform.admin')).toBe(
      false,
    );
  });

  it('DENIES a viewer with an empty grant list rather than treating it as unset', () => {
    expect(hasWorkspaceAccess(viewer([]), 'platform.admin')).toBe(false);
  });

  it('does not accept a prefix or a near-miss as the grant', () => {
    // Substring matching here would be an authorization bypass, and it is the
    // most plausible way someone "simplifies" this function later.
    expect(hasWorkspaceAccess(viewer(['platform.admin.readonly']), 'platform.admin')).toBe(false);
    expect(hasWorkspaceAccess(viewer(['admin']), 'platform.admin')).toBe(false);
    expect(hasWorkspaceAccess(viewer(['platform.administration']), 'platform.admin')).toBe(false);
  });
});
