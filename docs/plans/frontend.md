# Task 2.2: React Task Board

**Read:** Task 2.2 in `docs/REQUIREMENTS.md`.

## Deliver

- React TypeScript hooks component consuming the real GraphQL API.
- Kanban-by-status.
- Total tasks, overdue count, priority distribution, and at least one chart.
- Loading/error/empty states.
- Final 200–300-word state-management/component-design explanation in `docs/frontend-design.md`.

## TDD slices

Progress: Task 2.2 is implemented as a read-only Kanban board. Focused mocked UI
and transport tests plus live frontend-client/API checks cover the main flows.
See HANDOFF.md for exact verification. No mutation UI was added because the
approved API is query-only; the batching note below applies to future writes.

1. Loading and error states from mocked API responses.
2. Empty state.
3. Task rendering from GraphQL data.
4. Required statistics and chart.
5. Filter/pagination interactions appropriate to chosen view.
6. Verify actual backend integration, typecheck, tests and build.
7. For a particular task, all updates should be batched as a single JSON request then sent to the GraphQL server.

## Notes

- Kanban selected; statuses define columns, each with its own cursor.
- Summary data must not be inferred from only one page of tasks.
- Explicitly reconcile priority distribution data with backend API contract.
- On initial UI load, fetch the available organizations and their associated users from the backend. Populate the organization and user dropdowns, selecting the first organization and its first associated user by default.
- Use `organizations { id name members { user { id displayName } } }` for local selectors.
  Task/summary assignees use `{ isActive user { id displayName isActive } }` so
  organization-specific inactivity is distinct from global account state.
- When the selected organization changes, update the user dropdown to display only users belonging to that organization and select the first available user.
- Include the currently selected organization ID and user ID in every API request to maintain the appropriate organization and user context.
- Do not implement drag-and-drop solely because it appears in the Part 3 scenario.
- Update handoff and preserve full AI transcript.
