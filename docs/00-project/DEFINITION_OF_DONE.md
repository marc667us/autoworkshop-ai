# Definition of done

A task is **not** complete until every line below is true (`05.txt` §6).

## Functional
- [ ] The page renders, with loading, empty, error and permission-restricted states
- [ ] The API endpoint works and is documented
- [ ] Permissions are enforced **server-side**, not only in the UI
- [ ] The database migration runs forward, and its rollback is tested
- [ ] Responsive behaviour checked at mobile, tablet and desktop reference widths

## Quality
- [ ] Unit tests pass
- [ ] Workflow/integration tests pass
- [ ] Playwright journey passes
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] New shared components have Storybook stories
- [ ] Accessibility checks pass (axe-core)

## Safety
- [ ] Tenant isolation tests pass
- [ ] No agent gained access to a privileged credential
- [ ] Audit events are written for every state change
- [ ] **No paid dependency was introduced**

## Record
- [ ] Documentation updated
- [ ] `.claude/SESSION_HANDOVER.md` updated
- [ ] Committed with a conventional-commit message explaining *why*

## Release gates (`05.txt` §7)

A release must not reach production if: critical tests fail · role permissions can be bypassed · data can
cross tenant boundaries · core workflows are incomplete · mobile layouts are unusable · required approvals
are bypassed · MCP tools can access unrestricted data.
