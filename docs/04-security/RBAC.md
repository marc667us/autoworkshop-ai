# Role-based access control

## Model

RBAC combined with attribute-based checks (`1.txt` §12): role-based access · attribute-based access ·
resource ownership · tenant membership · job participation · data classification · approval authority.

## Identity

Keycloak is the identity provider (ADR-005 — mandatory, no alternative auth product). Authorization Code
Flow with PKCE for browser and mobile clients. Short-lived access tokens, rotating refresh tokens, refresh
token reuse detection, session inactivity and absolute limits, device/session visibility, administrative
revocation.

## Per-request evaluation

1. Who is requesting access
2. Which organization they belong to
3. Which role is active
4. Which resource is being accessed
5. Whether the user is assigned to the job
6. Whether approval authority is sufficient
7. Whether the record contains restricted information
8. Whether the operation is allowed **at the current workflow stage**

Point 8 matters: a valid permission is still refused if the workflow state forbids the action — for
example, starting a repair on a job whose proposal is not approved.

## Agent identity

An agent's identity **never replaces the user's identity** (`0.txt` §16). Each MCP request carries or
resolves: user identity · agent identity · tenant · organization · active role · requested capability ·
approval context · correlation id. Where an agent acts for a user, per-user authorization applies; where a
system agent performs a system function, workload identity applies.

## Server-side enforcement

Authorization is enforced server-side, always. UI hiding is a usability affordance, never a control.
