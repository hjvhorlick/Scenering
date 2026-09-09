/*
# Create projects and scenes tables (single-tenant, no auth)

1. New Tables
- `projects`
  - `id` (serial, primary key)
  - `title` (text, not null)
  - `script` (text, not null)
  - `status` (text, default 'draft' — draft, processing, ready)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
- `scenes`
  - `id` (serial, primary key)
  - `project_id` (integer, not null, references projects.id ON DELETE CASCADE)
  - `order_index` (integer, not null)
  - `text` (text, not null)
  - `image_query` (text, not null)
  - `image_url` (text, nullable)
  - `duration` (integer, default 4 — seconds)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on both tables.
- This is a single-tenant app with no sign-in screen, so all CRUD is allowed for anon + authenticated (data is intentionally shared/public).

3. Indexes
- Index on scenes.project_id for efficient lookups.
*/

CREATE TABLE IF NOT EXISTS projects (
  id serial PRIMARY KEY,
  title text NOT NULL,
  script text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  text text NOT NULL,
  image_query text NOT NULL,
  image_url text,
  duration integer NOT NULL DEFAULT 4,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_projects" ON projects;
CREATE POLICY "anon_select_projects" ON projects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_projects" ON projects;
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_projects" ON projects;
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_scenes" ON scenes;
CREATE POLICY "anon_select_scenes" ON scenes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scenes" ON scenes;
CREATE POLICY "anon_insert_scenes" ON scenes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_scenes" ON scenes;
CREATE POLICY "anon_update_scenes" ON scenes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_scenes" ON scenes;
CREATE POLICY "anon_delete_scenes" ON scenes FOR DELETE
  TO anon, authenticated USING (true);
