const FEATURE_ALIASES = {
  'Create Exams': 'Create Tests',
  'Edit Exams': 'Edit Tests',
  'Delete Exams': 'Delete Tests',
  'Take Exams': 'Take Tests',
}

export function normalizeFeature(feature) {
  const value = String(feature || '').trim()
  return FEATURE_ALIASES[value] || value
}

export const DEFAULT_PERMISSION_ROWS = [
  { feature: 'View Dashboard', admin: true, instructor: true, learner: true },
  { feature: 'Manage Users', admin: true, instructor: false, learner: false },
  { feature: 'Create Tests', admin: true, instructor: false, learner: false },
  { feature: 'Edit Tests', admin: true, instructor: false, learner: false },
  { feature: 'Delete Tests', admin: true, instructor: false, learner: false },
  { feature: 'Manage Categories', admin: true, instructor: false, learner: false },
  { feature: 'Manage Grading Scales', admin: true, instructor: false, learner: false },
  { feature: 'Manage Question Pools', admin: true, instructor: false, learner: false },
  { feature: 'Assign Schedules', admin: true, instructor: false, learner: false },
  { feature: 'View Attempt Analysis', admin: true, instructor: true, learner: false },
  { feature: 'Generate Reports', admin: true, instructor: false, learner: false },
  { feature: 'Take Tests', admin: false, instructor: false, learner: true },
  { feature: 'View Own Attempts', admin: true, instructor: true, learner: true },
  { feature: 'View Own Schedule', admin: true, instructor: true, learner: true },
  { feature: 'View Audit Log', admin: true, instructor: false, learner: false },
  { feature: 'Manage Roles', admin: true, instructor: false, learner: false },
  { feature: 'System Settings', admin: true, instructor: false, learner: false },
]

export function canonicalizePermissionRows(rows) {
  const source = Array.isArray(rows) ? rows : []
  const merged = new Map()
  source.forEach((row) => {
    if (!row || !row.feature) return
    const feature = normalizeFeature(row.feature)
    const existing = merged.get(feature) || { feature, admin: false, instructor: false, learner: false }
    merged.set(feature, {
      ...existing,
      admin: existing.admin || row.admin === true,
      instructor: existing.instructor || row.instructor === true,
      learner: existing.learner || row.learner === true,
    })
  })
  return Array.from(merged.values())
}

export function getRoleKey(role) {
  return String(role || '').toLowerCase()
}

export function allowedFeaturesForRole(rows, role) {
  const roleKey = getRoleKey(role)
  const source = canonicalizePermissionRows(rows)
  return source
    .filter((row) => row && row.feature && row[roleKey] === true)
    .map((row) => row.feature)
}

export function hasPermission(rows, role, feature) {
  if (!feature) return false
  return allowedFeaturesForRole(rows, role).includes(normalizeFeature(feature))
}
