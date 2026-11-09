# Backend implementation notes

Task 2.1 implements every field in the approved query-only schema. No mutations,
JWT login, frontend refresh infrastructure or drag-and-drop were added.

- Tenant access: `database/tenant-gateway.ts` is the sole board SQL boundary. It
  accepts validated identity and a request transaction, with no caller-supplied
  Sequelize query options, raw SQL entrypoint or tenant override.
- RLS: setup creates a non-superuser, non-BYPASSRLS runtime login with SELECT-only
  domain grants. Fixed-search-path identity/directory functions provide narrow
  bootstrap access. Query context uses transaction-local tenant configuration.
- N+1: request-local loaders batch relationships and per-task history requests.
  Identical calls share promises; collection reads follow base task pagination.
  SQL runs serially within one connection; independent requests retain concurrency.
- Consistency: one read-only repeatable-read transaction covers identity, lists,
  nested fields and summaries. Failed database reads roll back. Live pages do not
  retain a cross-request snapshot; cursor timestamps preserve microseconds.
- Startup: user superseded earlier preservation rules with unconditional board
  reset/reseed on every server start. Setup uses an advisory lock and one reset/seed
  transaction. Administrative credentials are closed before runtime requests.
- Testing: user explicitly removed database-specific suites/scripts. Maintained
  Vitest tests mock database/gateway access; SQL engine behavior is not established
  by mocks. HTTP smoke checks exercise normal application operation separately.
- Deferred: mutation version protocols, rank generation/rebalancing, restricted
  workflow transitions, operation replay, extra indexes and history project keys
  remain outside the read-only API. No strict frozen traversal is claimed.

Task 2.2 is now implemented separately in apps/frontend. Workspace verification
includes both packages. Original AI transcripts remain separate deliverables.
