-- The default POSTGRES_USER (edurnity) is a superuser and therefore always
-- bypasses row-level security, which would make our RLS policies a no-op.
-- The app connects as this separate, non-superuser role instead, so RLS is
-- actually enforced at runtime. Migrations/schema DDL still run as the
-- superuser (it owns the tables); this role is granted DML only.
create role edurnity_app login password 'edurnity_app' nosuperuser noinherit;
