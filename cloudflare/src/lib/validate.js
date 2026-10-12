// Server-side input validation. The UI limits choices, but anyone can call the API directly,
// so every write endpoint checks values, lengths and formats itself.
export const ENUM = {
  priority: ['P1', 'P2', 'P3', 'P4'],
  level: ['low', 'medium', 'high'],
  incidentStatus: ['new', 'in_progress', 'on_hold', 'resolved', 'closed'],
  requestStatus: ['new', 'pending_approval', 'approved', 'in_progress', 'fulfilled', 'rejected', 'closed'],
  problemStatus: ['new', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed'],
  changeStatus: ['draft', 'pending_approval', 'approved', 'scheduled', 'in_progress', 'completed', 'failed', 'rejected', 'closed'],
  changeType: ['standard', 'normal', 'emergency'],
  risk: ['low', 'medium', 'high'],
  ciType: ['server', 'application', 'network_device', 'database', 'workstation', 'service'],
  ciStatus: ['active', 'retired', 'maintenance'],
  environment: ['production', 'staging', 'development'],
  kbStatus: ['draft', 'published', 'archived'],
  role: ['requester', 'agent', 'admin'],
  appliesTo: ['incident', 'service_request'],
  // 'growth' / 'pro' / 'enterprise' are the retired plan names — still accepted so existing records and cached pages keep working.
  plan: ['starter', 'professional', 'msp', 'not_sure', 'growth', 'pro', 'enterprise'],
  leadKind: ['demo', 'waitlist', 'enquiry'],
};
export const MAX = { name: 200, text: 10000, article: 50000, tags: 500, id: 64, short: 100 };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// rules: { field: { required, max, min, oneOf, email, int, minValue, maxValue } }
// Empty values ('' / null / undefined) are skipped unless required — the UI sends '' to clear a field.
// Returns an error message, or null when everything is valid.
export function validate(body, rules) {
  for (const [field, r] of Object.entries(rules)) {
    const v = body[field];
    if (v === undefined || v === null || v === '') {
      if (r.required) return `${field} is required`;
      continue;
    }
    if (r.int) {
      if (!Number.isInteger(v) || v < (r.minValue ?? 0) || v > (r.maxValue ?? 1e9)) {
        return `${field} must be a whole number between ${r.minValue ?? 0} and ${r.maxValue ?? 1e9}`;
      }
      continue;
    }
    if (typeof v !== 'string') return `${field} must be text`;
    if (r.max && v.length > r.max) return `${field} must be at most ${r.max} characters`;
    if (r.min && v.length < r.min) return `${field} must be at least ${r.min} characters`;
    if (r.oneOf && !r.oneOf.includes(v)) return `${field} must be one of: ${r.oneOf.join(', ')}`;
    if (r.email && !EMAIL.test(v)) return `${field} must be a valid email address`;
  }
  return null;
}

// Assignees must be real, active staff — never a requester, a deactivated user or a made-up id.
export async function assigneeError(db, id) {
  if (!id) return null;
  const u = await db.get('SELECT role, is_active FROM users WHERE id = ?', id);
  return u && u.is_active && u.role !== 'requester' ? null : 'assigned_to must be an active agent or admin';
}
export async function ciError(db, id) {
  if (!id) return null;
  return (await db.get('SELECT id FROM cmdb_items WHERE id = ?', id)) ? null : 'ci_id does not match a configuration item';
}
