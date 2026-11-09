-- Versioned sample fixture. Executed only by the transactional setup runner.
-- Fixed identifiers make completeness checks deterministic; timestamps use the DB.
INSERT INTO users (id, display_name, is_active)
SELECT ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'Demo User ' || n, n <> 100
FROM generate_series(1, 100) n;

INSERT INTO organizations (id, name, time_zone)
SELECT ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'Demo Organization ' || n,
       (ARRAY['Asia/Kolkata', 'UTC', 'America/New_York'])[n]
FROM generate_series(1, 3) n;

-- 60 members in organization 1, 40 in 2, 20 in 3. Users 41–60 overlap.
INSERT INTO organization_members (organization_id, user_id, role, is_active)
SELECT o.id, u.id,
       CASE WHEN user_number = (ARRAY[1,41,81])[org_number] THEN 'owner'
            WHEN user_number % 10 = 2 THEN 'admin'
            WHEN user_number % 10 = 3 THEN 'viewer' ELSE 'member' END::organization_role,
       NOT (org_number = 2 AND user_number = 80)
FROM organizations o CROSS JOIN users u
CROSS JOIN LATERAL (SELECT right(o.id::text, 12)::int AS org_number,
                          right(u.id::text, 12)::int AS user_number) numbers
WHERE (org_number = 1 AND user_number <= 60)
   OR (org_number = 2 AND user_number BETWEEN 41 AND 80)
   OR (org_number = 3 AND user_number BETWEEN 81 AND 100);

INSERT INTO projects (id, organization_id, name, description)
SELECT ('30000000-0000-0000-0000-' || right(id::text, 12))::uuid,
       id, 'Board ' || right(id::text, 12)::int, 'Seeded assessment project'
FROM organizations;

INSERT INTO task_statuses (id, organization_id, project_id, name, position, is_done)
SELECT ('40000000-0000-0000-' || lpad(right(p.id::text, 12)::int::text, 4, '0')
        || '-' || lpad(n::text, 12, '0'))::uuid,
       p.organization_id, p.id,
       (ARRAY['Backlog', 'In progress', 'Done'])[n] || ' ' || right(p.id::text, 12)::int,
       'a' || (n - 1), n = 3
FROM projects p CROSS JOIN generate_series(1, 3) n;

INSERT INTO labels (id, organization_id, project_id, name)
SELECT ('50000000-0000-0000-0000-' || right(id::text, 12))::uuid,
       organization_id, id, 'Assessment'
FROM projects;

INSERT INTO tasks (id, organization_id, project_id, title, description, assignee_id,
                   priority, status_id, position, due_date, created_by)
SELECT ('60000000-0000-0000-' || lpad(right(m.organization_id::text, 12)::int::text, 4, '0')
        || '-' || right(m.user_id::text, 12))::uuid,
       m.organization_id, p.id, 'Task for user ' || right(m.user_id::text, 12)::int,
       'Deterministic pagination fixture', m.user_id,
       (ARRAY['LOW', 'MEDIUM', 'HIGH', 'URGENT'])[(ordinal::int % 4) + 1]::task_priority,
       s.id, 'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', ordinal::int, 1),
       (transaction_timestamp() AT TIME ZONE o.time_zone)::date + ((ordinal::int % 9) - 4),
       (SELECT user_id FROM organization_members owner_member
        WHERE owner_member.organization_id = m.organization_id AND role = 'owner')
FROM (SELECT *, row_number() OVER (PARTITION BY organization_id ORDER BY user_id) AS ordinal
      FROM organization_members) m
JOIN organizations o ON o.id = m.organization_id
JOIN projects p ON p.organization_id = m.organization_id
JOIN task_statuses s ON s.organization_id = m.organization_id AND s.project_id = p.id
  AND right(s.id::text, 12)::int = CASE
      WHEN right(m.organization_id::text, 12)::int = 1 AND ordinal <= 50 THEN 1
      ELSE 2 + (ordinal::int % 2) END;

INSERT INTO task_labels (organization_id, project_id, task_id, label_id)
SELECT t.organization_id, t.project_id, t.id, l.id FROM tasks t
JOIN labels l ON l.organization_id = t.organization_id AND l.project_id = t.project_id;

INSERT INTO task_comments (id, organization_id, task_id, author_id, body)
SELECT id, organization_id, id, created_by, 'Sample discussion' FROM tasks;

INSERT INTO task_activity (id, organization_id, task_id, actor_id, action, changes)
SELECT id, organization_id, id, created_by, 'CREATED',
       jsonb_build_object('title', jsonb_build_object('old', NULL, 'new', title)) FROM tasks;
