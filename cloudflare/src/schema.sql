-- ITSM Tool Database Schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'requester', -- admin | agent | requester
  department TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cmdb_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ci_type TEXT NOT NULL, -- server | application | network_device | database | workstation | service
  status TEXT NOT NULL DEFAULT 'active', -- active | retired | maintenance
  owner_id TEXT REFERENCES users(id),
  environment TEXT DEFAULT 'production', -- production | staging | development
  description TEXT,
  ip_address TEXT,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ci_relationships (
  id TEXT PRIMARY KEY,
  parent_ci_id TEXT NOT NULL REFERENCES cmdb_items(id),
  child_ci_id TEXT NOT NULL REFERENCES cmdb_items(id),
  relationship_type TEXT DEFAULT 'depends_on' -- depends_on | hosts | connects_to
);

CREATE TABLE IF NOT EXISTS sla_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL, -- incident | service_request
  priority TEXT NOT NULL, -- P1 | P2 | P3 | P4
  response_time_mins INTEGER NOT NULL,
  resolution_time_mins INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'P3', -- P1 Critical, P2 High, P3 Medium, P4 Low
  status TEXT NOT NULL DEFAULT 'new', -- new | in_progress | on_hold | resolved | closed
  impact TEXT DEFAULT 'medium', -- low | medium | high
  urgency TEXT DEFAULT 'medium',
  requester_id TEXT REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  ci_id TEXT REFERENCES cmdb_items(id),
  problem_id TEXT,
  sla_response_due TEXT,
  sla_resolution_due TEXT,
  responded_at TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  fulfillment_team TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  catalog_item_id TEXT REFERENCES service_catalog(id),
  priority TEXT NOT NULL DEFAULT 'P3',
  status TEXT NOT NULL DEFAULT 'new', -- new | pending_approval | approved | in_progress | fulfilled | rejected | closed
  requester_id TEXT REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  approver_id TEXT REFERENCES users(id),
  approval_status TEXT DEFAULT 'not_required', -- not_required | pending | approved | rejected
  sla_response_due TEXT,
  sla_resolution_due TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new | investigating | root_cause_identified | known_error | resolved | closed
  priority TEXT NOT NULL DEFAULT 'P3',
  root_cause TEXT,
  workaround TEXT,
  ci_id TEXT REFERENCES cmdb_items(id),
  assigned_to TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS problem_incidents (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL REFERENCES problems(id),
  incident_id TEXT NOT NULL REFERENCES incidents(id)
);

CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  change_type TEXT NOT NULL DEFAULT 'normal', -- standard | normal | emergency
  status TEXT NOT NULL DEFAULT 'draft', -- draft | pending_approval | approved | scheduled | in_progress | completed | failed | rejected | closed
  risk TEXT DEFAULT 'medium', -- low | medium | high
  ci_id TEXT REFERENCES cmdb_items(id),
  implementation_plan TEXT,
  backout_plan TEXT,
  test_plan TEXT,
  requester_id TEXT REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  approver_id TEXT REFERENCES users(id),
  approval_status TEXT DEFAULT 'pending', -- pending | approved | rejected
  scheduled_start TEXT,
  scheduled_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  tags TEXT,
  author_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'published', -- draft | published | archived
  views INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  not_helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  ticket_type TEXT NOT NULL, -- incident | service_request | problem | change
  ticket_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0, -- internal note vs public reply
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  workspace_slug TEXT,
  team_size TEXT,
  region TEXT,
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new | contacted | provisioned | closed
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sr_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_type, ticket_id);

-- Worker-specific: key/value settings (generated JWT secret, first-run flags).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
