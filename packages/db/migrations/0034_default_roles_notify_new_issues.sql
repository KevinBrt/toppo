-- The default roles of the team are told of new issues; requesters, who see only their own, are not.
-- Must match DEFAULT_ROLES in packages/core/src/permissions/default-roles.ts (checked by tests).
UPDATE "roles" SET "notify_new_issues" = true
WHERE "id" IN ('01a1569b-9800-7e64-8269-eb18fddc30ee', '01a1569b-9801-747e-91c9-d058653f2a8e');
