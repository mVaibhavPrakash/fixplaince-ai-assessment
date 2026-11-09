# Task Board: Technical Data Model

## Scope and model rationale

This design accompanies [PostgreSQL DDL](../database/schema.sql) and the
[GraphQL contract](../graphql/schema.graphql). It targets a shared-database,
shared-schema task board. The DDL defines constraints and indexes; backend
read-only behavior is implemented through the tenant gateway and GraphQL API.

| Entities                          | Relationship and rationale                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users, organizations, memberships | A user joins many organizations through `organization_members`. Its composite primary key prevents duplicate membership; role and active state belong to that organization. |
| Organizations and projects        | Each project belongs to one organization. Workspace time zone and JSON preferences live on the organization.                                                                |
| Projects, statuses and labels     | Each project defines its own workflow and labels. A status carries completion state and a fractional string position.                                                       |
| Tasks and memberships             | Tasks have one status, optional assignee, priority, due date and creator. Assignee and creator reference membership in the task's organization.                             |
| Tasks and labels                  | `task_labels` represents the many-to-many relationship and prevents duplicate links. Composite foreign keys require the same organization and project.                      |
| Tasks, comments and activity      | Comments preserve discussion; activity records the actor, time and old/new values for one logical event. Membership references preserve historical attribution.             |

UUIDs provide identifiers, while composite foreign keys enforce ownership.
Organization roles are `owner`, `admin`, `member` and `viewer`; the same user can
have different roles in different organizations. Inactive users/memberships remain
stored so historical authors are not lost. Foreign keys do not enforce active state;
new assignments and actions require backend validation.

Structured fields stay relational. JSON is limited to preferences and activity
changes. Due dates use calendar dates; timestamps use `timestamptz` with database
defaults. Settings writes must validate time-zone names. Comments/activity currently
derive project ownership through tasks. Adding `project_id` to those tables remains
a proposal; their existing references require the two-column task unique key,
while task labels require the three-column key.

## Common query patterns

The following are parameterized SQL patterns, not implemented endpoints. `$1` is
the database-validated organization, never an unchecked client tenant. Cross-project
queries stay inside that organization; the current GraphQL task query requires a
project and would need separate approval to expose organization-wide search.

**Overdue tasks assigned to me across projects.** Bind `$2` to the authorized user
and `$3` to a bounded page size. A task is overdue when its due date precedes the
organization-local date and its status is not done. Null due dates are excluded.

```sql
SELECT t.id, t.project_id, t.title, t.due_date, t.created_at
FROM tasks t
JOIN organizations o ON o.id = t.organization_id
JOIN task_statuses s ON s.organization_id = t.organization_id
  AND s.project_id = t.project_id AND s.id = t.status_id
WHERE t.organization_id = $1 AND t.assignee_id = $2
  AND NOT s.is_done
  AND t.due_date < (transaction_timestamp() AT TIME ZONE o.time_zone)::date
ORDER BY t.created_at, t.id
LIMIT $3;
```

**All tasks assigned to a user.** Validate the target belongs to the selected
organization, then traverse bounded pages rather than returning an unlimited list:

```sql
SELECT id, project_id, title, created_at
FROM tasks
WHERE organization_id = $1 AND assignee_id = $2
ORDER BY created_at, id
LIMIT $3;
```

For subsequent pages, add `AND (created_at, id) > ($4::timestamptz, $5::uuid)`.
For board reads, additionally require `project_id` and combine requested status,
assignee, priority and inclusive due-date predicates using bound parameters.
Unassigned tasks use `assignee_id IS NULL`; reject contradictory filter inputs.

Task detail uses organization plus task ID. Comments/activity use organization plus
task ID, ordered by creation timestamp and ID. Summary queries reuse the full
filtered task relation, without pagination, grouping by status, assignee and
priority. Preserve the unassigned bucket and include zero-count statuses through
an outer join where needed. Overdue totals use the same date/completion rule.

## Indexing and performance

Existing B-tree indexes begin with tenant/project scope and then creation timestamp
and ID for board traversal. Status, assignee and priority variants place their
filter before the ordering columns. Due-date indexes support range filtering;
history indexes support task-scoped ordered reads. Unique constraints also create
indexes, so avoid adding duplicates.

The tenant/assignee index supports organization-wide assignment lookup, but does
not supply creation ordering. If this pattern becomes frequent, measure an index
on `(organization_id, assignee_id, created_at, id)`. The overdue query may benefit
from a tenant/assignee/due-date index, depending on selectivity. These are candidates,
not indexes currently present. A combined filter may still need sorting or inspect
many rows; separate indexes do not guarantee every combination is efficient.

Use representative `EXPLAIN (ANALYZE, BUFFERS)` results to assess rows scanned,
sorts and I/O. Measure list and aggregation latency separately: exact summaries
can cost more than one page. Batch nested membership/status/label reads within
the authorized request to avoid N+1 queries. Select necessary columns, enforce
page sizes of 1–100 and fetch one extra row for `hasNextPage`. More indexes add
write amplification and storage; monitor table statistics and vacuum behavior.
No benchmark or latency guarantee has been established.

## Tenant isolation and authorization

Each request must validate the supplied user against PostgreSQL, require active
organization membership, and load that membership's role. A mandatory Sequelize
gateway should inject tenant predicates into direct reads, nested reads, counts
and aggregates, failing closed when context is missing. Raw SQL must use the same
validated context and explicit tenant predicates. Foreign keys prevent cross-tenant
links but cannot prevent an unscoped SELECT.

All active roles may read the task board. Future writes require an explicit
permission matrix; viewer writes must be rejected. Header identity is local
assessment impersonation, not secure authentication. Production must establish
verified identity, such as validated JWTs, while retaining database authorization.
The DDL enables and forces RLS on all ten tables. SELECT policies use transaction-local
`app.organization_id`; users are visible through membership in that tenant. Missing
context exposes no rows. Ordinary roles have no write policies. The backend must
set validated context using SET LOCAL, use a non-superuser/non-BYPASSRLS runtime
role and provide a narrow identity/demo bootstrap path. These are implemented by
runtime role provisioning, fixed-search-path definer functions and request context.

## Data consistency and ordering

Future updates must atomically match `(organization_id, id, version)`, increment
`version` and set `updated_at` from the database. If two requests submit version 5,
one can commit version 6; the stale conditional update affects zero rows and must
return a conflict rather than overwrite it. Zero rows can also mean an unavailable
task; avoid leaking another tenant's existence. Task changes, label changes and
activity insertion must commit or roll back together. The version column alone
does not enforce this protocol. Disable Sequelize-generated timestamps and preserve
creation timestamps and IDs on edits. Activity immutability is also a backend
contract, not a current database permission guarantee.

Status and task positions use base-62 string ranks with C collation. Status ranks
are unique per project; task ranks are unique within a project's status column.
A canonical fractional-indexing algorithm normally inserts between
neighbors without renumbering them. Concurrent collisions require rollback and
regeneration from fresh neighbors; rank growth can eventually require a coordinated
project-local rebalance. The character check does not validate canonical ranks.
Task position is exposed in GraphQL. Creation-ordered pagination remains distinct
from rank ordering; rank-based cursor semantics require an explicit API decision.

Task cursors use immutable `(created_at, id)`, retain PostgreSQL timestamp precision
and bind to tenant, project, filters and ordering. This avoids offset shifts and
movement caused solely by detail edits. One read-only repeatable-read
transaction makes lists and summaries agree within a request. Separate requests
remain live: filter changes, deletion or late commits can alter traversal. String
ranks do not solve this. Guaranteed frozen cross-page results would require an
approved snapshot/history design. The user selected live pagination instead.

## Migration and verification strategy

For this local assessment, the user's latest instruction requires transactional
board reset/reseed on every server startup. The setup lock serializes concurrent
initializers; requests begin only after commit. Unrelated objects block reset.
This supersedes the earlier preserve-initialized-data decision. The following
migration approach describes future evolution beyond that reset-based assessment.

Evolve through expand/backfill/validate/contract: add compatible fields, backfill
in bounded batches, deploy compatible readers/writers, validate constraints, then
remove obsolete structures. Review lock impact and use concurrent index creation
where appropriate; it requires execution outside a transaction block. Treat enum
and type changes explicitly. Rehearse on isolated PostgreSQL, verify backup/restore,
and prefer a corrective forward migration when rollback would discard data.

At explicit user request, database-specific tests and scripts were removed.
Maintained Vitest tests mock database/gateway dependencies and cover resolver
fields, batching, authorization, filters, cursors and transaction orchestration.
Manual HTTP checks exercised the normal backend, including concurrent tenants.
These checks are not a database stress benchmark or proof of arbitrary concurrent
edit behavior. Read-only requests share a database snapshot; pages remain live.
This document is the technical model description; the AI critique and candidate's
own evaluation remain separate deliverables.
