-- Task 1.1 design artifact. Apply to an empty database; never drops existing data.
-- Identity headers are local development impersonation, not secure authentication.
-- The backend must validate the user, active membership and organization role
-- before setting transaction-local app.organization_id on its connection.
-- RLS consumes that trusted context; a custom setting is not authentication.
BEGIN;

CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE activity_action AS ENUM ('CREATED', 'UPDATED', 'COMMENTED');

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL CHECK (btrim(display_name) <> ''),
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    -- Validate against PostgreSQL pg_timezone_names when configuring settings.
    time_zone text NOT NULL DEFAULT 'UTC',
    preferences jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE TABLE organization_members (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role organization_role NOT NULL DEFAULT 'member',
    is_active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON organization_members (user_id, organization_id);

CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (btrim(name) <> ''),
    description text,
    UNIQUE (organization_id, id)
);

CREATE TABLE task_statuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL CHECK (btrim(name) <> ''),
    -- Fractional string rank; C collation matches ASCII ordering in the rank generator.
    -- Future writes must use a canonical base-62 fractional-indexing algorithm,
    -- not arbitrary string concatenation. Insert/move normally updates one row.
    -- On concurrent rank collision, roll back and regenerate from fresh neighbors.
    -- Rank growth may eventually require a transactional project-local rebalance.
    position text COLLATE "C" NOT NULL CHECK (position ~ '^[0-9A-Za-z]+$'),
    is_done boolean NOT NULL DEFAULT false,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id),
    UNIQUE (organization_id, project_id, name),
    UNIQUE (organization_id, project_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE labels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL CHECK (btrim(name) <> ''),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id),
    UNIQUE (organization_id, project_id, name)
);

CREATE TABLE tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL CHECK (btrim(title) <> ''),
    description text,
    assignee_id uuid,
    priority task_priority NOT NULL DEFAULT 'MEDIUM',
    status_id uuid NOT NULL,
    -- Lexicographic fractional rank within a status column; same rules as status position.
    position text COLLATE "C" NOT NULL CHECK (position ~ '^[0-9A-Za-z]+$'),
    due_date date,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    FOREIGN KEY (organization_id, project_id, status_id)
        REFERENCES task_statuses(organization_id, project_id, id),
    FOREIGN KEY (organization_id, assignee_id)
        REFERENCES organization_members(organization_id, user_id),
    FOREIGN KEY (organization_id, created_by)
        REFERENCES organization_members(organization_id, user_id),
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, project_id, id),
    UNIQUE (organization_id, project_id, status_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
-- The position uniqueness index also supports ORDER BY position within a column.
-- Stable keyset ordering: WHERE (created_at, id) > (:timestamp, :id)
-- ORDER BY created_at, id LIMIT :pageSizePlusOne. Never sort pages by updated_at.
CREATE INDEX tasks_page_idx ON tasks (organization_id, project_id, created_at, id);
CREATE INDEX tasks_status_page_idx ON tasks (organization_id, project_id, status_id, created_at, id);
CREATE INDEX tasks_assignee_page_idx ON tasks (organization_id, project_id, assignee_id, created_at, id);
CREATE INDEX tasks_priority_page_idx ON tasks (organization_id, project_id, priority, created_at, id);
CREATE INDEX tasks_due_date_idx ON tasks (organization_id, project_id, due_date);
CREATE INDEX tasks_assignee_fk_idx ON tasks (organization_id, assignee_id);
CREATE INDEX tasks_creator_fk_idx ON tasks (organization_id, created_by);

CREATE TABLE task_labels (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    task_id uuid NOT NULL,
    label_id uuid NOT NULL,
    PRIMARY KEY (organization_id, task_id, label_id),
    FOREIGN KEY (organization_id, project_id, task_id)
        REFERENCES tasks(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, label_id)
        REFERENCES labels(organization_id, project_id, id)
);
CREATE INDEX task_labels_label_idx ON task_labels (organization_id, project_id, label_id);

CREATE TABLE task_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    task_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL CHECK (btrim(body) <> ''),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    FOREIGN KEY (organization_id, task_id) REFERENCES tasks(organization_id, id),
    FOREIGN KEY (organization_id, author_id) REFERENCES organization_members(organization_id, user_id)
);
CREATE INDEX task_comments_page_idx ON task_comments (organization_id, task_id, created_at, id);
CREATE INDEX task_comments_author_idx ON task_comments (organization_id, author_id);

CREATE TABLE task_activity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    task_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    action activity_action NOT NULL,
    changes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(changes) = 'object'),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    FOREIGN KEY (organization_id, task_id) REFERENCES tasks(organization_id, id),
    FOREIGN KEY (organization_id, actor_id) REFERENCES organization_members(organization_id, user_id)
);
CREATE INDEX task_activity_page_idx ON task_activity (organization_id, task_id, created_at, id);
CREATE INDEX task_activity_actor_idx ON task_activity (organization_id, actor_id);

-- Future update contract (parameters supplied by the authorized backend):
-- UPDATE tasks SET title = :title, version = version + 1,
--     updated_at = clock_timestamp()
-- WHERE organization_id = :authorizedOrg AND id = :taskId AND version = :expectedVersion
-- RETURNING *;
-- Zero rows means a conflict or unavailable task. Do not blindly retry stale edits.
-- Insert activity in the SAME transaction, only after a successful update.
-- All task writes must use this contract; version is not an automatic trigger.
-- Preserve created_at and id on updates. Sequelize timestamps must be disabled.
-- API authorization must reject inactive assignees and actors for new writes;
-- foreign keys deliberately retain inactive historical memberships.

-- Runtime credentials must be NOSUPERUSER NOBYPASSRLS, without schema/role
-- administration privileges. Superusers and BYPASSRLS roles bypass these rules.
-- SET LOCAL (or set_config(..., true)) is mandatory to avoid pooled-context leaks.
-- No setting / empty setting exposes no rows; malformed UUID context errors closed.
-- Only SELECT policies are provided for the currently read-only API. All writes
-- are denied to ordinary runtime roles until explicit write policies are approved.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_read ON organizations FOR SELECT
    USING (id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON organization_members FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
-- Expose only users associated with the selected organization, including historical
-- inactive actors. Active requester validation happens before tenant reads.
CREATE POLICY user_read ON users FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = users.id
        AND m.organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY project_read ON projects FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE task_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_statuses FORCE ROW LEVEL SECURITY;
CREATE POLICY status_read ON task_statuses FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels FORCE ROW LEVEL SECURITY;
CREATE POLICY label_read ON labels FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY task_read ON tasks FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_labels FORCE ROW LEVEL SECURITY;
CREATE POLICY task_label_read ON task_labels FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY comment_read ON task_comments FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_read ON task_activity FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

COMMIT;
