# Backend Architectural Design & System Constraints

## Core Architectural Decisions

- **Strict Layered Separation**: The backend cleanly separates transport layers, GraphQL field resolution, domain board behavior, and PostgreSQL access. Resolvers map directly to the approved schema without embedding any raw SQL.
- **Centralized Data Access via Gateway**: A mandatory Sequelize gateway acts as the single source of truth for database interactions. It encapsulates all tenant predicates, bound filters, keyset reads, history queries, and aggregates.
- **Decoupled & Testable Dependency Injection**: Database dependencies are dynamically injected. This allows unit tests to thoroughly exercise system behavior without the overhead of opening active network connections.
- **Clean Code Management**: The GraphQL schema and the database schema are isolated in independent directories, simplifying ongoing code management and team collaboration.
- **Rigorous TDD Implementation**: The entire system was developed using a Test-Driven Development (TDD) approach. Test coverage includes comprehensive validation for both happy-path scenarios and complex edge-case failures.

## Security, Isolation, and Multi-Tenancy

- **Identity Verification**: Every incoming request validates the provided user and organization against active database memberships. Header identity simulates local assessment users for now; production environments will require verified identity, such as validated JWTs, while preserving this exact authorization model.
- **Granular Role Access**: All four core organization roles are granted read access, though no mutation APIs are currently exposed.
- **Hardened Database Privileges**: A non-privileged runtime login enforces strict SELECT grants and Row-Level Security (RLS). Two highly specific, fixed-search-path security definer functions handle identity validation and local organization selection without exposing unrestricted table reads.

## Performance Optimization & Data Fetching

- **Transactional Consistency**: A single, read-only REPEATABLE READ transaction serves all fields within a given request.
- **Efficient Batch Loading**: SQL queries are queued on a shared connection, utilizing request-local batch loaders to resolve related users, memberships, statuses, labels, and histories. Duplicate calls share active promises to eliminate redundant processing.
- **Smart N+1 Prevention**: History batching explicitly preserves each parent's cursor and limit. This prevents traditional N+1 read issues and avoids the performance penalties of joined collection multiplication.

## Pagination & Aggregates

- **Deterministic Sorting**: Pagination orders records strictly by creation timestamp and ID, preserving microsecond precision at the database level. Cursors are bound to the tenant, project, filters, and specific relations.
- **Isolated Request Processing**: Separate requests remain entirely live, returning manual string ranks independently.
- **Accurate Reporting**: Summaries utilize the complete filtered relation and organization-local dates, derived directly from PostgreSQL's transaction clock.

## Resiliency & State Management

- **Graceful Failure Handling**: Unexpected system errors explicitly hide underlying SQL syntax, database credentials, and execution stacks, while failed reads trigger an immediate rollback.
- **Verification Strategy**: Continuous verification relies on mocked unit tests, strict typechecking, and automated builds. Manual HTTP smoke checks are used for integration validation rather than heavy, database-specific suites.
- **Data Seeding**: At the explicit request of the user, the application startup transactionally resets and seeds sample data before listening for traffic.

## System Constraints & Development Assumptions

- **Header-Based Identity Validation**: Full authentication/authorization is intentionally omitted from the current scope. The backend extracts the user_id and organization_id directly from the request headers. However, the database acts as the ultimate source of truth; if these identifiers do not exist in the database, validation will fail. In a production environment, this flow should be secured via JWT tokens.
- **Read-Only Extensibility**: Write operations are not implemented in this version. However, the codebase is structurally extensible enough to easily accommodate mutations and write paths in future iterations.
- **Localized Database Environment**: While a standard production deployment would utilize Docker for PostgreSQL orchestration, a local PostgreSQL server setup was chosen for this assessment to eliminate unnecessary environment complexity.
- **Transient Development State**: To guarantee a clean state and prevent data corruption during assessment testing, the database tables are completely dropped, recreated, and re-seeded with fresh sample data on every single server restart. This behavior is strictly for development convenience and must be disabled in production.

**Note on Documentation**: The architectural decisions, design patterns, and system constraints detailed below were conceptualized and written entirely by me based on my implementation. A generative AI tool was subsequently used strictly to refine the phrasing and enhance readability, ensuring the original technical intent remains completely unchanged.