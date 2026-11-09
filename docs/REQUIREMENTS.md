## Part 1 - Recursive AI Logic & System Design

### Authentication and Authorization

- **Authentication is not a priority.** The backend will receive the `userId` and `tenantId` (organization ID) in header with each API request.
- The backend must verify that the user exists and belongs to the specified organization before allowing access to its resources.
- **Authorization must be properly implemented and enforced on the backend**, using organization membership and role-based access control (`owner`, `admin`, `member`, `viewer`).
- Every database query must be scoped to the authorized organization to prevent cross-tenant data access.
- Never rely on frontend validation alone for authorization.
- Add a code comment explaining that the current identity mechanism is intended only for this assessment. In production, user identity should be established through a securely validated authentication mechanism, such as JWT-based authentication, rather than trusting client-provided user IDs.
- Include tests for valid membership, unauthorized access, role-based permissions, and cross-tenant isolation.

### Task 1.1 - Data model design

Design GraphQL schema and PostgreSQL data model using ORM supporting:

- Multiple organizations, each with projects and team members.
- Organization-level roles: owner, admin, member, viewer.
- One member can be part of multiple organization but members roles should be on individual organization level.
- Projects and tasks with assignees, priorities, statuses, labels and due dates.
- Task comments and activity history (who changed what, when).
- Workspace-level settings and customizable task statuses per project.
- Indexes should be properly implemented.
- Data consistency is the top priority(maybe using versioning).
- Schema should PostgreSQL data model should be extensible enough to handle any mutation logic in future.

**Deliverable:** GraphQL type definitions + SQL/ORM schema definitions.

## Part 2 - Full-Stack Implementation

### Task 2.1 - Backend GraphQL API

Implement a Node.js GraphQL API with:

- Task given in `plans/backend.md`.
- Task filtering: status, assignee, priority, due-date range.
- Cursor-based pagination.
- Summary/aggregation query: counts by status, overdue count, counts per assignee.
- Authorization: users can only see tasks in organizations they belong to.

**Deliverables:** GraphQL schema; resolvers with **at least 80 lines of meaningful logic**; **200–300-word** design-decision explanation.

### Task 2.2 - Frontend Task Board

Implement a React TypeScript hooks component that:

- Follows tasks in `plans/frontend.md`.
- Consumes the Task 2.1 GraphQL API.
- Displays either Kanban columns by status.
- Displays total tasks, overdue count, and priority distribution.
- Includes at least one chart, ideally tasks counts as per status.
- Handles loading, error and empty states.

**Deliverables:** React TypeScript component; **200–300-word** explanation of state management and component architecture.

## Implementation Decisions — Not Assessment Requirements

- **Repository:** npm workspaces with separate `apps/backend` and `apps/frontend` packages and root-level orchestration.
- **Language:** TypeScript throughout.
- **Backend:** Node.js, Apollo Server, GraphQL, PostgreSQL with **Sequelize ORM**, `tsx` for development, Vite for builds, and Vitest for testing.
- **Frontend:** React, Vite, Vitest, React Testing Library, and a chart library as needed.
- **Local database:** Locally installed PostgreSQL, without Docker. Use PowerShell scripts for setup, startup, and verification, with transactional reset/reseed on every server startup per later user instruction.
- **Authentication:** This assessment assumes development and simulates identity using seeded users and request headers. Per subsequent user instruction, do not add development/production runtime branches or their tests. This is not secure authentication; document that actual production must establish identity through validated JWTs while retaining database authorization. Test-database isolation guards remain independent and mandatory.
- **Authorization:** Verify user existence, organization membership, and role-based permissions using PostgreSQL. Scope all tenant-specific operations to the authorized organization.
- **Development method:** Small, bounded increments with strict TDD for executable behavior, dependency injection for testability, and honest verification.
- **Scope:** No production login, additional CRUD, drag-and-drop implementation, messaging, caching, or distributed infrastructure unless explicitly required.

## Submission checklist

- [ ] GraphQL and SQL schemas
- [ ] 2–3-page technical data-model documentation
- [ ] AI architecture critique
- [ ] Candidate-authored 500–750-word analysis
- [ ] Node GraphQL API + ≥80 meaningful resolver lines
- [ ] Backend 200–300-word explanation
- [ ] React TypeScript task view + chart + states
- [ ] Frontend 200–300-word explanation
- [ ] 2–3-page performance RFC
- [ ] README, package.json, runnable code
- [ ] Complete unedited AI transcripts + prompting commentary
- [ ] Single repository or ZIP
