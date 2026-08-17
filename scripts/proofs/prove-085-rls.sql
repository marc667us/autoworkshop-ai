-- Does the backfill see rows as the NON-SUPERUSER app role? This is the
-- difference between "green locally" and "works on Render".
BEGIN;
SET ROLE autoworkshop_app;
SELECT current_user AS running_as, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser;

-- WITHOUT the admin context — the first version of the migration's position.
SELECT count(*) AS rows_visible_WITHOUT_admin_context
  FROM identity.memberships m
  JOIN identity.organizations o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
 WHERE o.org_type IN ('insurance_company','towing_company');

-- WITH it — where the corrected migration sets it.
SELECT set_config('app.current_role','admin',true);
SELECT count(*) AS rows_visible_WITH_admin_context
  FROM identity.memberships m
  JOIN identity.organizations o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
 WHERE o.org_type IN ('insurance_company','towing_company');
ROLLBACK;
