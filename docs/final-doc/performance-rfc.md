# RFC: Keeping the Task Board Fast as Usage Grows

**Status:** Draft for engineering and product review  
**Date:** 2026-11-09  
**Audience:** Engineering team and product manager

## Why we need this

The board works with our sample data, but we have not established how it behaves
with larger projects or many people using it at once. Loading a board involves
more than fetching a page of tasks: we also load project metadata, populate
selectors and calculate counts. Pagination limits the task payload, but it does
not make those other operations cheap.

Our seed contains 120 tasks across three organizations, with 60 tasks in the
largest project. This is enough to exercise filtering and pagination; it tells us
little about capacity. We do not yet have a representative load test or recorded
latency percentiles. The risks below are therefore areas to investigate, rather
than confirmed performance problems:

- Exact summaries process all matching tasks, even when the board displays only
  the first page. The current summary query also calculates assignee counts when
  the board does not request them.
- Nested comments and activity can make a small task page expensive if batching
  or per-task limits are lost during future changes.
- Organization and member lists are currently unpaginated.
- Concurrent requests can exhaust the connection pool before individual queries
  look particularly slow.

This proposal is to measure those costs and improve the existing PostgreSQL read
path first. It does not propose a new cache service or changes to task ordering.

## What good looks like

We will start with a disposable dataset containing 12,000 tasks: 100 times the
current fixture. Half should belong to one project so the test does not hide
expensive queries behind evenly distributed data. Include 10,000 users, 300
organizations and 120,000 comment/activity records. Those additional volumes are
test assumptions, not forecasts. Include tied timestamps and inactive users who
appear in history.

Run a mixed workload of 20 GraphQL operations per second for 30 minutes, followed
by a ten-minute burst at 40 operations per second. Use 100 simulated sessions,
with think time adjusted to reach the intended rate. Allocate 40% of operations
to board/filter reads, 40% to next pages, 10% to nested history and 10% to workspace
or selector reads. Run both a hot-project case and traffic spread across tenants.

The following are proposed targets for product and engineering to agree on;
**they are not measured results**. Start on a documented 4-vCPU, 8-GB RAM host
with SSD storage and a desktop browser on the same local network. Record software
versions and measure cold startup separately.

| Measure                                              | Proposed target                                             |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Initial board or filter request, including summary   | p95 under 500 ms; p99 under 1.2 seconds                     |
| Next column page, including summary                  | p95 under 350 ms; p99 under 900 ms                          |
| First usable board, including discovery and metadata | p95 under 1.5 seconds                                       |
| Database connection wait                             | p95 under 100 ms                                            |
| Unexpected server errors at sustained load           | Below 0.5%                                                  |
| Nested reads, with the same fields and column count  | Moving from 25 to 100 tasks adds no more than two SQL calls |

Correctness is a release condition: no cross-tenant data, counts that match the
request's database snapshot, and no duplicate task IDs in the rendered board.
During the burst, queues must remain bounded and recover afterward. A separate
100,000-task-project run can help find the next limit, but should not be reported
as the 100× acceptance test.

## Options

### 1. Improve the existing PostgreSQL queries

Keep request-local batching, keyset pagination and the read-only transaction
shared by each GraphQL request. Measure slow operations, reduce unnecessary query
work and add indexes where query plans show a benefit.

This fits the current application and preserves exact summaries without another
service to operate. It also keeps authorization in the existing tenant gateway
and RLS policies. The limitation is that exact aggregation still gets more
expensive as the matching dataset grows. Query tuning will not remove that cost
entirely.

### 2. Cache responses or maintain summary counters

A shared cache could avoid repeated reads of popular boards. Precomputed counters
could make summary reads much cheaper. Both become attractive when many requests
ask for the same data.

The difficulty is keeping the answers correct. Cached responses depend on tenant,
access scope, project and filters. Overdue counts can change at local midnight
without a task being updated. A cached summary could disagree with a fresh task
page. Counters need every relevant write to update them reliably, and the current
API does not implement those writes. Frequently updated project counters could
also become contention points.

This option adds operating and consistency costs before we know whether they are
necessary. It would also require product agreement on how much stale data users
can tolerate.

## Recommendation and implementation

Choose option 1. A 12,000-task dataset is a reason to measure our queries, not by
itself a reason to introduce distributed caching. Revisit option 2 if measured
results show that aggregation remains the bottleneck after query improvements.

Work in four small steps:

1. **Capture a baseline.** Backend engineering records operation latency, SQL time
   and call count, connection wait, response size and transaction duration.
   Frontend engineering measures the time from selecting a project or filter to
   seeing a usable board. Use operation names and tenant-size ranges in telemetry;
   exclude task content and identity headers. The PM confirms the workload and
   response-time targets.
2. **Remove unnecessary work.** Inspect representative query plans, especially
   summaries with status, assignee and due-date filters. Compare narrower summary
   projections and grouping strategies. If unused assignee aggregation is costly,
   calculate only the requested dimensions. Keep task pagination ahead of nested
   collection loading and retain batching and per-task history limits.
3. **Tune access paths and payloads.** Evaluate indexes against those plans rather
   than treating the number of indexes as a problem. Record storage and write
   costs alongside read gains. Measure selector payloads too. If they dominate
   board loading, propose additive paginated fields using the existing domain
   types; keep old fields working rather than silently truncating their results.
4. **Check concurrency limits.** Size connection pools across all server instances
   against one database budget, leaving administrative headroom. Preserve the
   serialized SQL queue within each request's transaction. Splitting sibling
   fields across connections would lose their shared snapshot.

Compare each change with the baseline before keeping it. Existing mocked tests
should cover batching, filters and authorization behavior. Run the capacity
exercise through the API against a disposable database; this does not require
adding a database-specific unit-test suite.

Live pagination remains the contract. Each response is consistent within its own
snapshot, while later pages can reflect newer changes. Frontend task-ID merging
prevents duplicate cards; it does not turn separate requests into a frozen view.
The current creation-time cursor ordering stays unchanged in this work.

## Shipping safely

There is a prerequisite for any rollout with retained user data: startup currently
resets and reseeds the assessment database. A separate reviewed change must move
that reset to an explicit development command and make serving startup
non-destructive. Real-user deployment also needs verified authentication in place
of the assessment's identity headers. Neither change is implemented by this RFC.

First compare baseline and candidate results in the disposable environment.
Engineering reviews query plans and correctness; product reviews loading behavior
and freshness. Any new index needs a migration and lock-impact review. If created
concurrently, it must run outside the transaction-wrapped initial schema script.

Keep the old query path available behind a rollout switch. Enable the candidate
for internal tenants, then 5%, 25% and 100% of eligible traffic. Hold each stage
for at least one representative business day and enough requests to assess tail
latency. Preserve GraphQL fields, cursor format and precision, filters and RLS so
existing clients continue working.

Disable the candidate immediately for an isolation or count discrepancy. Roll
back if p95 latency is more than 20% worse than baseline for 15 minutes, or errors
or connection waits exceed their targets for that period. Switch back to the old
query path first; review index removal separately to avoid adding lock pressure
during an incident.

Engineering and product approve the full rollout when the agreed targets pass.
If they do not, record what limited performance and decide the next change from
that evidence.
