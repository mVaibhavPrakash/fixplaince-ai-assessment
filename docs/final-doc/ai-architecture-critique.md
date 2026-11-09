# AI Architecture Critique: Schema and Data Model

## Scope and assessment

Implementation status: Task 2.1 now handles the identified nested-data risks with
request-local batching and duplicate-call caching. RLS uses a restricted runtime
login and validated transaction context. The user selected live keysets and later
required startup reset/reseed and mocked tests only. Database-specific suites
were removed. Findings below remain the model critique, not current backend defects.

Reviewed [GraphQL definitions](../graphql/schema.graphql),
[PostgreSQL DDL](../database/schema.sql) and [model rationale](data-model.md).
This is a static design critique, separate from the candidate-authored evaluation.
No resolvers were inspected or 100× benchmark performed. Revised DDL passed
isolated PostgreSQL rank and tenant RLS checks. N+1 and
scaling observations identify structural exposure, not measured failures.
Backend-only work such as batching implementations, request deduplication,
permission middleware and transaction orchestration is outside this review.
No schema changes are made by this document.

The strongest existing features are organization-specific membership, composite
foreign keys, normalized task attributes and scoped pagination indexes. The main
unresolved structural issue is strict cross-page consistency. Task string ranks
and read-only tenant RLS are now defined. Index improvements depend on
actual access patterns; adding every suggested index would increase write cost.

## 1. GraphQL relationship fan-out and N+1 exposure

| Schema path                                                      | Structural exposure                                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `tasks.edges.node.assignee.user`, `createdBy`, `status`          | Each task introduces membership/user/status relationships, often repeating the same related records. |
| `Task.labels`                                                    | A many-to-many traversal through `task_labels`; expanding every task can multiply related rows.      |
| `Task.comments` / `activity`, then `author` / `actor`            | Per-task connections multiply the potential result volume even when each connection is paginated.    |
| `Organization.projects`, `members`, `Project.statuses`, `labels` | Plain lists have no pagination arguments, allowing large tenant-level expansions.                    |
| `TaskSummary.byAssignee`, `Organization.members`                 | Cardinality grows with membership; these lists are also unpaginated.                                 |

For N tasks, the first page can expose N separate related connections. That makes
N+1 possible, but the schema does not prove one SQL query per field. Existing
foreign keys and indexes support set-based retrieval. Denormalizing display names
or status names into tasks is unnecessary to address this exposure and would add
synchronization risk. Prefer bounded collection contracts where growth warrants
an approved schema change. Per-list limits alone do not bound the complete graph.

Final nested-data review: none of these relationships requires a schema change
to avoid N+1. Backend implementation can batch memberships/users, statuses and
labels for the loaded tasks, with request-scoped tenant-aware caches. Comments
and activity need per-parent pagination: one global LIMIT across many task IDs
would be incorrect. Their batch keys must distinguish task, cursor and page size.
Joining labels, comments and activity together can multiply rows and distort task
pagination or counts; paginate the base task relation before loading collections.
Unbounded collection size is a separate payload/cardinality concern, not itself
N+1. Verify query counts across different task-page sizes during backend work;
no resolver defect or new schema revision is established by this review.

## 2. Consistency, stale data and ordering

**No stored counter drift today.** Counts exist as GraphQL outputs, not database
counter columns. Therefore denormalized-counter inconsistency is not a current
schema defect. Future summary tables would introduce a second representation of
state. Overdue totals also change at organization-local midnight without any task
write, so write-driven counters alone would not keep them correct.

**Versioning is incomplete as a database guarantee.** `tasks.version > 0` does not
force increments, link activity to a task revision or prevent direct overwrites.
Comments, statuses, labels and settings have no revision fields. Consequently task
version alone cannot indicate that related names, completion state or settings
have changed. These are limits of the model's concurrency metadata, not a claim
that current writes are broken.

**Workflow states are defined; transitions are not.** The status foreign key ensures
a task's status belongs to its project, but permits any status-to-status change.
No transition policy is required in Task 1.1, so a transition table is a future
option only if restricted workflows are approved. Changing `is_done` reclassifies
all tasks using that status immediately; historical activity does not preserve
status-definition revisions. That is acceptable for current-state reporting but
insufficient for reconstructing past workflow meaning.

**String positioning now covers columns and tasks.** `task_statuses.position`
orders columns; `tasks.position` persists card order within a status. C collation
and scope-specific uniqueness are useful safeguards, but
the alphanumeric check admits noncanonical fractional ranks. Arbitrary strings
are not always guaranteed to have a valid intermediate string. Rank generation
rules and eventual rebalancing remain design contracts; duplicate ranks are
rejected, not automatically resolved.

**Strict cross-page consistency is unsupported.** Current task rows plus a version
number do not retain past values. A task can enter or leave a filter between pages;
a late-committing insert can appear behind an existing cursor. Immutable creation
ordering reduces movement but cannot supply a frozen traversal. If that guarantee
is mandatory, an approved snapshot or temporal-history model is needed. Activity
JSON is not currently a complete temporal row store. Creation timestamps and
activity rows are also not protected from direct modification by the DDL.

For the interactive board, live keyset pagination fits the user's stated
preference and avoids retaining a cross-request snapshot. It does not have a
measured universal performance advantage. Snapshot pagination preserves the same
logical result across pages and needs retained history, materialized results or
database snapshot lifecycle management. A short repeatable-read transaction for
one request is distinct from a snapshot retained across page requests.

With live rank ordering, a task already seen can move beyond the cursor and
appear again, or an unseen task can move behind it and be missed. React's
`key={task.id}` supplies component identity; it does not deduplicate an array.
Explicit ID-based merging prevents duplicate rendered cards, but cannot recover
missed rows or prove current column membership. Refetch/reconcile affected data
after changes; reset traversal when its tenant/project/filter/order context
changes. This is a backend/frontend implementation note, not a schema change.

## 3. 100× growth, concurrency and duplicate calls

Exact summaries still examine matching data; a small task page does not make its
full aggregation cheap. `byAssignee` grows with organization membership, while
activity can grow much faster than task count. Large descriptions, comment bodies,
preferences and activity JSON have no business-size constraints. Large history
volumes and repeated nested expansions increase storage, I/O and response volume.

Index count alone is not a bottleneck: six or seven indexes are not evidence of
poor performance at 100× scale. Evaluate index width, selectivity, write rate and
actual plans. Competing versioned edits serialize on the same task row regardless
of index count. Hypothetical globally updated counter rows could add contention.
Rank uniqueness concentrates conflicts when
many users insert into the same gap. These are workload risks, not evidence that
100× growth requires partitioning, caching or new infrastructure.

Duplicate reads do not corrupt the model. An update retried with its original
expected version cannot apply twice after the original or an intervening edit
increments the version. No extra idempotency model is needed to prevent duplicate
stale updates. A conflict does not reveal whether the original attempt succeeded;
exact response replay is a separate, unrequested requirement. Creates do not
inherently carry an existing task version, so duplicate-create semantics are a
separate future decision, not a current read-only schema defect. History project
keys are unrelated to retry protection.

## 4. Security boundaries in the model

Composite foreign keys prevent cross-tenant task/status, assignment and label
links. Membership roles correctly belong to an organization rather than the user.
However, foreign keys do not restrict SELECT access or map roles to database
permissions. Revised SQL enables and forces RLS on all ten tables. SELECT policies
use transaction-local `app.organization_id`; user visibility follows membership
in that tenant. Missing context exposes no rows. Ordinary roles have no write
policies. Runtime credentials must not have superuser/BYPASSRLS or administration
privileges. RLS trusts validated context; it does not authenticate headers or
independently validate active requesters. Initial identity validation and demo
discovery require a separately reviewed narrow bootstrap access path because
ordinary tenant reads fail closed without context.

Membership references allow inactive historical actors, as intended, but do not
require active assignees. The model permits an organization with no active owner;
whether at least one owner must be preserved needs a business rule. It contains
no project-specific membership, so project-private access is not represented and
should not be assumed. Such access is outside current requirements.

`organizations` exposes organization/user directory identifiers by design for
local selection. It now reuses the Organization type, with authorization on
settings, projects and roles. Public local selection is not production discovery. Arbitrary
activity JSON can also retain sensitive old values; neither its allowed fields nor
retention policy is structurally constrained. Database audit immutability is absent.

## 5. Index and normalization opportunities

| Candidate                                                                     | Benefit and qualification                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tasks `(organization_id, assignee_id, created_at, id)`                        | Supports ordered assignment pages across projects. Existing tenant/assignee index filters but does not provide that order. Could replace that narrower index after validation. |
| Tasks `(organization_id, assignee_id, due_date)`                              | Candidate for cross-project personal overdue queries. Does not alone resolve completion-state joins or creation ordering.                                                      |
| Tasks `(organization_id, project_id, status_id, assignee_id, created_at, id)` | Candidate only if combined status/assignee board filters dominate. Existing separate indexes do not guarantee efficient ordered execution for this combination.                |
| History `(organization_id, project_id, created_at, id)`                       | Requires adding project_id first; useful for project-wide history, not necessary for task-local history.                                                                       |

Current due-date indexes do not also provide creation ordering after a date range.
That can require sorting; choose ordering/index tradeoffs from representative plans.
Do not build a time-relative overdue partial index around the current clock: overdue
membership changes with time even when rows are untouched.

The normalized membership/status/label model avoids duplicated names and roles.
Duplicated organization/project keys are deliberate ownership constraints, not
uncontrolled denormalization. Adding `project_id` to comments/activity could avoid
project-discovery joins, provided a three-column task foreign key prevents drift.
Then the two-column task unique key could be removed after all references migrate.
Currently both keys support real foreign keys despite UUID uniqueness.

Avoid speculative counters, copied status completion flags and JSON search indexes.
Activity `changes` is only constrained to an object; old/new structure, event revision
and schema evolution are unspecified. Add structured metadata only for approved
history requirements. PostgreSQL enums are suitable for fixed roles/priorities,
while customizable statuses correctly remain rows.

## Review priorities

1. Decide whether live pagination is acceptable or approve a snapshot/history model.
2. Retain approved task/column ranks; decide rank-based cursor behavior when wired
   into the API. Current task cursors still use creation order.
3. Wire defined RLS policies to validated transaction-local context and a restricted
   runtime role during backend implementation.
4. Approve bounded collection changes and index candidates only against actual
   cardinalities and access patterns.
5. Treat history project keys as an optional query optimization. Version-checked
   updates already protect stale retries; do not introduce general idempotency
   infrastructure without an explicit additional requirement.

These are design decisions and conditional improvements, not authorization to
expand scope or evidence of implemented behavior. Performance conclusions require
representative PostgreSQL measurements; none are claimed here.
