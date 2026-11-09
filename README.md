# Task Board

The read-only backend and React Kanban task board are implemented.

## Architecture

```text
React task board
       |
RootContext + focused contexts
       |
       | GraphQL over HTTP
       v
Apollo Server
       |
Validate user + organization membership
       |
Resolvers + request-local batching
       |
Tenant gateway / Sequelize
       |
       | Tenant-scoped reads
       v
PostgreSQL + Row-Level Security (RLS)
```

Each GraphQL request shares a read-only database snapshot. Filtering, pagination
and summaries run on the backend; UI state and styling stay in the frontend.
Identity headers are mocked for this assessment.

## Run

Use Node.js 22+, npm and locally installed PostgreSQL. Packages are npm workspaces
under `apps/backend` and `apps/frontend`.

Run these commands from the repository root in PowerShell. Start the PostgreSQL
Windows service first. Use a local PostgreSQL superuser (normally `postgres`) for
setup: startup creates the database if missing and provisions a restricted runtime
role. A normal application-only database login cannot perform this setup.

```powershell
node --version
npm.cmd --version
npm.cmd ci
# Only if .env does not exist:
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
notepad.exe .env
# Save your local PG_USERNAME and PG_PASSWORD before continuing.
npm.cmd run dev
```

No manual database creation or `psql` command is required. The PostgreSQL server
must be reachable at the `PG_HOST` and `PG_PORT` in `.env`. Use `npm.cmd` in
PowerShell to avoid execution-policy errors from the `npm.ps1` shim.

**Every server start resets and reseeds the Task Board tables**, per user instruction.
The reset and seed commit together before requests are accepted. Unrelated objects
block setup; the old `schema_migrations` ledger is preserved. `npm.cmd run setup`
also resets/seeds explicitly. Only this local startup uses administrative
credentials; resolvers use a separate restricted login with SELECT-only grants
and forced RLS. Do not point this project at a database containing valuable board data.

The endpoint is `http://127.0.0.1:4000/graphql`. If the port is occupied, set `PORT`
in `.env` or temporarily use `$env:PORT = '4001'` before starting. For development:
`npm.cmd run dev -w @taskboard/backend`. Editing backend code restarts the dev
server and therefore resets the sample board again.

Open the frontend at `http://127.0.0.1:5173`. Vite proxies `/graphql` to port 4000.
If using another backend port, set `VITE_GRAPHQL_ENDPOINT` in
`apps/frontend/.env.local`, for example `http://127.0.0.1:4001/graphql`, and restart
Vite. The board selects the first organization and active user, then loads project
metadata. Organization, user and project changes reset the displayed board.

Apply filters as a group; the backend performs filtering and aggregation. Each
column loads independently in pages of 25. Summary metrics and the status chart
cover all matching tasks, not just the loaded cards. Refresh reconciles live data.
The UI is read-only because the approved API has no mutations.

Shared frontend state is split into `OrganizationContext`, `WorkspaceContext` and
`TaskBoardContext`. `RootProvider` composes them; `RootContext` exposes their values
through `useRootContext` and re-exports the individual providers and hooks.
`App.tsx` only mounts the root provider and page. The UI uses a plain layout with
selectors, filters, summaries and task columns. CSS is split by component area.

For compiled execution, run `npm.cmd run build`, then `npm.cmd start`; in a second
terminal run `npm.cmd run preview -w @taskboard/frontend`.

The optional PowerShell wrappers run the same npm commands and locate the
repository root themselves. If Windows blocks `.ps1` files, these invocations
allow only the child PowerShell process to run the local wrapper; they do not
change your saved execution policy. Run one command at a time:

```powershell
# Optional explicit reset/seed; normal server startup already performs this.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
# Start backend and frontend; stop with Ctrl+C.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
# Run after stopping the development servers.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

On its first run without `.env`, `setup.ps1` creates the template and stops so you
can fill in credentials. Rerun it after saving the file. All wrappers require
`npm.cmd ci` to have completed first.

`PG_USERNAME`/`PG_PASSWORD` provision the local schema and runtime role. The optional
`PG_RUNTIME_USERNAME` defaults to `taskboard_runtime`; `PG_RUNTIME_PASSWORD` defaults
to the local administrative password when omitted. Supply a distinct runtime
password if desired. Never use the administrative login in resolver data access.
`PG_TEST_DATABASE` remains a distinct `_test` name for configuration isolation guards;
maintained tests are mocked and never connect to PostgreSQL.

## Query

Send POST JSON with `Content-Type: application/json`. Headerless local discovery:

```graphql
{
    organizations {
        id
        name
        members {
            user {
                id
                displayName
            }
        }
    }
}
```

The list reuses `Organization`, `OrganizationMember` and `User` for all records,
including seeds. Settings, projects and roles require authorization for that
organization. Then include `x-user-id` and `x-tenant-id` on tenant requests. Example seeded IDs:
user `10000000-0000-0000-0000-000000000001`, organization
`20000000-0000-0000-0000-000000000001`, project
`30000000-0000-0000-0000-000000000001`.

```graphql
query Board($projectId: ID!, $after: String, $filter: TaskFilter) {
    tasks(projectId: $projectId, filter: $filter, first: 25, after: $after) {
        edges {
            cursor
            node {
                id
                title
                priority
                position
                version
                dueDate
                assignee {
                    isActive
                    user {
                        id
                        displayName
                        isActive
                    }
                }
                status {
                    id
                    name
                    position
                    isDone
                }
                labels {
                    id
                    name
                }
            }
        }
        pageInfo {
            endCursor
            hasNextPage
        }
    }
    taskSummary(projectId: $projectId, filter: $filter) {
        total
        overdue
        byStatus {
            status {
                id
                name
            }
            count
        }
        byAssignee {
            assignee {
                user {
                    id
                    displayName
                }
            }
            count
        }
        byPriority {
            priority
            count
        }
    }
}
```

Filters combine status, assignee, priority, unassigned state and inclusive due-date
bounds. Pages are 1–100, default 25. Cursors preserve timestamp microseconds and
are bound to tenant/project/filter/relation. Lists use `(created_at, id)`; task
`position` exposes the stored manual rank separately. Each request shares one
read-only repeatable-read snapshot; separate pages are live. Reset pagination
when filters change. Frontend ID-based merging and refreshes handle live changes;
React keys alone do not deduplicate records. Strict frozen cross-page results are
not promised. Nested comments/activity have independent pagination.

Active owners, admins, members and viewers may read. Invalid/inactive identities
receive 401, denied membership 403, and authorization-time database failures 503.
Malformed requests return 400, oversized bodies 413. Expected field errors use
GraphQL errors; internal details are masked. The runtime has no write policies or
mutation API. Client header identity is impersonation for local development, not
secure authentication. Production must use verified identity such as validated
JWTs and retain database membership, roles and tenant isolation.

## Verification and documents

```powershell
npm.cmd run check
```

Tests inject mocked database/gateway dependencies; database-specific suites and
scripts were removed on request. Normal HTTP startup/operation smoke checks were
performed separately, including concurrent tenant requests. No performance
benchmark, database concurrency stress test or production readiness is claimed.
Workspace verification includes ESLint, backend and frontend mocked tests,
typechecks and builds. ESLint covers TypeScript/TSX source and enforces the
configured brace and statement-spacing rules; generated build output is ignored.
Frontend checks cover loading/error recovery, empty states, server
filters, summaries/chart, page merging and stale tenant responses. A live smoke
check used the actual frontend client through Vite's proxy against the backend.

See [schema](graphql/schema.graphql), [SQL](database/schema.sql),
[model](docs/data-model.md), [backend design](docs/backend-design.md),
[frontend design](docs/frontend-design.md),
[implementation notes](docs/backend-implementation.md),
[AI critique](docs/ai-architecture-critique.md) and [handoff](docs/HANDOFF.md).
Preserve complete original AI transcripts separately; these documents do not
replace them.
