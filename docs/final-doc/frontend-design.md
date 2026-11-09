# Frontend Architecture & State Management

## Component Hierarchy & Context Architecture

- **Domain-Driven Contexts**: The application relies on isolated, domain-specific React Contexts to manage state cleanly. OrganizationContext handles directory management along with user and organization selection. WorkspaceContext manages project metadata, active selections, and refresh states. TaskBoardContext governs applied filters, summary data, task pagination, and cursors.
- **Unified Composition Layer**: A unified RootProvider composes these individual providers into a single structural layer. Correspondingly, RootContext exposes their combined values and clean-exports the individual contexts, providers, and custom hooks.
- **Granular Component Subscriptions**: Components strictly subscribe only to the specific domain context they require. When a component needs to coordinate actions across multiple domains, it leverages the unified useRootContext hook.
- **Clean Entry Point**: `App.tsx` serves strictly as a lightweight entry point, mounting only the RootProvider and the primary page layout. Identity selectors, project pickers, headings, feedback blocks, and the core board content are isolated into independent, self-contained components.
- **Modular Styling**: Styling is written in plain, modular CSS. The codebase splits styles into explicit files for global controls, structural layout, filters, summaries, and board-specific components. The UI maintains a clean, utility-first aesthetic using neutral colors and standard controls, completely omitting decorative branding or complex navigation.
- **Modular Component Design**: Instead of relying on a few large, monolithic structures, the code is systematically broken down into highly granular, lightweight components. This modular approach ensures individual elements remain highly reusable, isolated, and easy to maintain over time.

## Data Fetching, Multi-Tenancy, and State Lifecycle

- **Context-Aware Request Pipeline**: The strongly-typed fetch client utilizes standard organization, member, and user types for initial data discovery. All subsequent API requests automatically append the currently selected organization and user headers.
- **Automated State Reset Strategy**: Context providers explicitly listen to identity and project shifts. A change in user identity automatically resets the workspace state, while switching projects resets the active board state to prevent data cross-contamination.
- **Race Condition Mitigation**: The transport layer leverages native AbortSignal controllers and unique request keys to automatically discard stale, out-of-order network responses.
- **Pagination and List Merging**: The pagination engine intelligently merges incoming task IDs and versions while maintaining independent, per-column pagination cursors. Independent columns remain fully live, though an explicit manual refresh is required to pull in items modified or added concurrently by other users.

## Filter Mechanics & Server-Driven Aggregations

- **Atomic Filter Application**: Filter modifications are treated as local drafts, remaining completely isolated within the component state until the user explicitly applies them as a single, atomic update.
- **Server-Side Aggregations**: Filtering and metrics calculations are offloaded entirely to the backend. The initial batch of column pages and the comprehensive board summary are retrieved within a single, optimized GraphQL operation. Subsequent page fetches return updated global summaries to ensure the UI stays synchronized.
- **High-Fidelity Metrics**: The status charts and overview metrics reflect complete server-side aggregates rather than relying on client-side math or loaded card counts.
- **Sequential Pagination**: The UI restricts pagination to loading one additional page at a time. This constraint prevents race conditions and avoids out-of-order summary response updates.

## Testing and Scope Boundaries

- **Focused Testing Strategy**: The frontend test suite relies on targeted, mocked component and transport layer tests. These tests thoroughly validate user workflows, state life cycles, and shared root/domain contexts.
- **Strict Scope Boundaries**: To minimize overhead and remain focused on the assessment requirements, the system completely omits mutation controls, database-specific test environments, or heavy third-party state management libraries (like Redux or Zustand).

**Note on Documentation**: The architectural decisions, design patterns, state management detailed above were conceptualized and written entirely by me based on my implementation. A generative AI tool was subsequently used strictly to refine the phrasing and enhance readability, ensuring the original technical intent remains completely unchanged.