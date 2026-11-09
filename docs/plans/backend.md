# Task 2.1: Backend GraphQL API

**Read:** Task 2.1 and Implementation Decisions in `docs/REQUIREMENTS.md`; approved schemas.

Also read [implementation notes](../backend-implementation.md) for deferred
critique items. Their absence is not a Task 1.1 failure. Do not add mutations, refresh infrastructure to Task 2.1; required task pagination remains in scope.

## Deliver

- Runnable Node.js/TypeScript Apollo Server GraphQL API, using PostgreSQL.
- Required task filters, cursor pagination, status/overdue/assignee aggregates, organization authorization.
- At least 80 lines of meaningful resolver logic.
- `docs/backend-design.md` finalized as a 200–300-word design-decision explanation (move longer working notes elsewhere or replace them).

## Bootstrap (before behavioral implementation)

- npm workspaces with independent backend/frontend packages, TypeScript configs, Vite/Vitest, `tsx` backend dev command.
- Local PostgreSQL.
- SQL schema and seeded demo users, memberships, projects and tasks. Keep test data separate from demo data.

## TDD slices

Progress: Task 2.1 read-only API is implemented. See HANDOFF.md for actual checks.
Later user instructions supersede older slices: startup always resets/reseeds
board tables; all maintained tests use mocks and database-specific tests are
removed. Live pages are approved; strict frozen cross-page results are not claimed.

1. Singleton Initialization: On backend initialization, the system must load environment variables and configure the database using the Singleton pattern, strictly managed via a dedicated init function.
2. Deterministic Data Seeding: Reset/reseed Task Board tables transactionally on every server startup before accepting requests, per latest user instruction. Seed exactly 3 organizations and 100 users; organization 1 has 60 members and 50 assigned tasks sharing one status. Preserve unrelated objects and the legacy migration ledger.
3. Identity Verification: The system must reject missing, unknown, or inactive demo IDs, resolving only seeded users for the development assessment. Production JWT requirements must be thoroughly documented without introducing environment-mode branches or runtime conditional tests.
4. Tenant Isolation (Gateway/Interceptors): Implement mandatory Sequelize tenant gateways/interceptors where missing context fails closed. Context will then contain user id, org id and user role. This will be used for any database query. Operations such as find-by-ID, nested reads, counts, and aggregates must never override the tenant scope. Testing must explicitly cover concurrent tenants, unsafe bypass options, and private scoped aggregate SQL.
5. Row-Level Security (RLS): Implement PostgreSQL Row Level Security (RLS) using organization_id to guarantee total data isolation at the database layer.
6. Membership Authorization: Enforce explicit membership checks: active organization members can read data; unknown users, inactive users, inactive memberships, and non-members are blocked from all access. Inactive historical actors must be preserved in the database but restricted from active reads, writes, or updates.
7. Multi-Criteria Filtering: Support sequential and combined filtering on tasks by status, assignee, priority, and due-date ranges. Filters must execute via parameterized SQL and actual membership checks; frontend filtering is strictly prohibited.
8. Consistent Cursor Pagination: Use stable creation-time/ID keysets with full timestamp precision. One repeatable-read transaction makes fields consistent within a request. Separate pages remain live, as approved; no frozen cross-request traversal is promised.
9. Timezone-Aware Summaries: Provide live summary metrics including task counts by status, overdue counts, counts per assignee, and counts per priority. These calculations must use PostgreSQL's transaction clock and organization-local dates while thoroughly testing date/time-zone boundaries.
10. Schema Validation: Validate the required GraphQL schema and resolvers. The system must fully typecheck, run all tests, build successfully, and document the results.
11. Isolated Testing Architecture: When writing tests, refrain from calling the database directly; mock all database layers and interfaces completely before execution.
12. Central Error Contract: Implement a central error contract that clearly separates HTTP request failures from GraphQL field-level errors.
13. HTTP Status Mapping: Invalid requests, unavailable identities, denied access, and authorization-time database failures must return appropriate, semantically correct HTTP status codes.
14. Atomic Transaction Rollbacks: Database execution errors must completely roll back the transaction. No partial data, side effects, or fragmented mutations are permitted to be preserved in the database.
15. Failure Obfuscation & Logging: Unexpected failures must mask raw SQL queries, credentials, and stack traces from the client. The cleanup phase must preserve primary failures, and startup/setup failures must exit the process unsuccessfully while emitting safe, sanitized messages.
16. Lightweight HTTP Adapter: Utilize a thin, native Node HTTP adapter to return clean JSON errors for malformed or oversized payloads without introducing external, heavy third-party dependencies.

## Constraints

- Resolver Focus: For this phase, focus exclusively on GraphQL Resolvers. However, the architecture must remain modular and extensible enough to support Mutations in the future without structural rewrites.
- Tenant Predicates: Centralize all tenant predicates within the mandatory gateway/interceptors; do not duplicate tenant filtering logic inside individual resolvers.
- Immutable Database Authority: Disable Sequelize's application-clock timestamp generation (createdAt/updatedAt). Database defaults and explicit database-time updates serve as the sole timestamp authority.
- Concurrent Keyset Pages: Live keyset pages must not freeze concurrent edits. Preserve full database timestamp precision and share exactly one read-only REPEATABLE READ transaction for list and summary fields in a single request. Test concurrent inserts and filter-changing edits explicitly.
- Environment Configuration: Bind assessment endpoints strictly to localhost under the assumption of a local development setup without production/development branching. Production JWT requirements must remain documented, and test-database guards remain mandatory.
- Role Enforcement: The roles owner, admin, member, and viewer must exist in the underlying data model, but permissions should only be enforced for currently implemented read operations.
- Feature Scope: Do not implement JWT/OAuth, full CRUD, drag-and-drop, or other unrequested features.
- Handoff Log: Update the final handoff documentation with verified passed items, preserving the full AI transcript separately.
