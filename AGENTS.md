# Codex Instructions

## Goal and Scope

- Build a **multi-tenant project management platform** inspired by Jira and Kanban, focused specifically on the **Task Board** rather than a complete project management application.
- Follow `docs/REQUIREMENTS.md` strictly. Do not introduce features, infrastructure, or complexity beyond the requirements and documented implementation decisions.
- Work incrementally using the active plan in `docs/plans/`. Complete one bounded task at a time; do not proceed to the next increment without instruction.
- Treat approved GraphQL and PostgreSQL schemas as the source of truth. Report inconsistencies before making structural changes.

## Technology Stack

- **Language:** TypeScript throughout.
- **Monorepo:** npm workspaces with independent frontend and backend packages.
- **Backend:** Node.js, Apollo Server, Sequelize ORM, PostgreSQL, Vite, Vitest, and `tsx` for development.
- **Frontend:** React, Vite, Vitest, and TypeScript.
- **Database:** Locally installed PostgreSQL without Docker.
- Prefer simple, maintainable, secure, and scalable solutions. Avoid unnecessary dependencies, abstractions, and infrastructure.

## Authentication and Authorization

- Authentication is intentionally mocked for this project. The backend receives the user ID and organization/tenant ID through request headers.
- Validate the supplied user and organization against PostgreSQL. **Never trust client-provided identity or tenant information without database validation.**
- Enforce organization membership, role-based access control (`owner`, `admin`, `member`, `viewer`), and tenant isolation on the backend.
- Scope all tenant-specific database operations to the authorized organization.
- Document that header-based identity is for local project use only and is **not secure authentication**. Production should use a verified authentication mechanism, such as JWT, while continuing to enforce authorization.
- Test invalid users, unauthorized organizations, role restrictions, and cross-tenant access.

## Code Quality and Architecture

- Environment variables should be managed in a separate config file.
- Config file should be singleton.
- Config file should be initialized during application start.
- **Constants and Types:** Organize reusable constants, enums, types, and interfaces in dedicated files. Keep module-specific types local when appropriate. Avoid magic values and duplicated definitions.
- **SOLID:** Apply SOLID principles pragmatically, prioritizing single responsibility, clear interfaces, and dependency inversion.
- **Composition over Inheritance:** Prefer small, composable modules and functions over class hierarchies.
- **Separation of Concerns:** Keep GraphQL resolvers, business logic, database operations, and React UI responsibilities separate.
- **Dependency Injection:** Pass dependencies explicitly so database operations, external services, and API clients can be mocked in unit tests.
- **Error Handling:** Handle expected failures explicitly without exposing internal implementation details.
- **Simplicity:** Do not create abstractions, interfaces, or layers without a concrete use case.

## Strict Test-Driven Development

Follow **RED -> GREEN -> REFACTOR** for all executable functionality:

1. Write focused tests before implementation.
2. Execute the tests and confirm they fail for the expected reason.
3. Implement only the minimum functionality needed to pass.
4. Refactor without changing behavior.
5. Rerun the relevant tests.

Additional rules:

- Use Vitest for frontend and backend testing.
- Unit tests must be isolated from external dependencies through mocks, fakes, or dependency injection.
- Use integration tests when real PostgreSQL behavior, database constraints, or tenant isolation must be verified.
- Test authorization, filtering, pagination, aggregation, loading, error, and empty states as applicable.
- Run targeted tests during development and relevant regression tests, type checks, and builds before completing an increment.
- Never claim tests passed unless they were actually executed successfully.
- For documentation, schema design, and RFC tasks, validate against requirements instead of creating meaningless tests.

## Workflow and Token Efficiency

1. Read `docs/HANDOFF.md`, the relevant section of `docs/REQUIREMENTS.md`, the active plan, and only necessary source files.
2. Implement only the current task. Avoid unrelated refactoring and repository-wide exploration.
3. Keep changes small, focused, and easy to review.
4. Avoid repeating requirements, generating unnecessary documentation, or providing lengthy explanations.
5. At the end of each increment, update `docs/HANDOFF.md` (maximum 300 words) with:
    - Completed work
    - Important decisions
    - Verification results
    - Blockers
    - Next action
6. Replace outdated handoff information rather than appending historical logs.
7. Keep final responses concise: changed files, tests executed, blockers, and next step.

## Implementation Integrity

- Preserve the **complete, unedited transcripts of all AI interactions**, including prompts, iterations, and refinements.
- Do not treat `HANDOFF.md` or AI-generated summaries as substitutes for original transcripts.
- Keep the AI architecture critique separate from the candidate's own 500–750-word evaluation.
- Do not fabricate personal judgments, implementation results, benchmarks, or test outcomes.
- Respect the implementation's required deliverables, word counts, and documentation lengths.
- Clearly distinguish implemented functionality, design decisions, assumptions, and proposed future improvements.
