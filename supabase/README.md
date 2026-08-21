# Marginalia Supabase

Remote project: `dipstslcooovpyclouai` (`Marginalia`, `ap-southeast-1`).

The SQL files in `migrations/` use the exact migration versions assigned by Supabase when the
changes were applied through the authenticated Supabase connection. Do not place secret or
service-role keys in this directory. The browser receives only `VITE_SUPABASE_URL` and a
publishable key.

The pinned CLI package could not finish installing its Windows binary in the current execution
environment. Until that environment issue is resolved, create future migrations remotely first
and copy back the exact version returned by `list_migrations`; do not invent migration versions.
