# Supabase database setup

Apply migrations in `migrations/` to the Supabase project before deploying the updated frontend.

The migration adds:

- RLS policies for profiles, tasks, task logs and daily completions;
- transactional RPCs for task creation, status changes and deletion;
- the employee profile trigger, which always assigns the `employee` role;
- `task_daily_completions` for independent daily task history.

Before applying to an existing production database, export a backup and review the policies against the intended employee visibility rules. The frontend expects the RPC names defined in `0001_employee_task_security_and_daily.sql`.
