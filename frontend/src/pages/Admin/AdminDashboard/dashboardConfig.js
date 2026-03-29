export const ICONS = {
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  learners: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
  instructors: 'M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm0 14.17L4.41 13 3 14.09 12 19l9-4.91L19.59 13 12 17.17z',
  tests: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  attempts: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
  passRate: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4 1.41-1.41L11 13.17l5.59-5.59L18 9l-7 7z',
  score: 'M3 17h3v-7H3v7zm5 0h3V7H8v10zm5 0h3v-4h-3v4zm5 0h3V4h-3v13z',
  alert: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
}

export const PIE_COLORS = ['#0891b2', '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#ef4444']
export const MIX_ROW_COLORS = ['#0891b2', '#22c55e', '#6366f1', '#f59e0b']

export const EMPTY_DASHBOARD = {
  total_exams: 0,
  total_tests: 0,
  total_users: 0,
  total_learners: 0,
  total_admins: 0,
  total_instructors: 0,
  active_users: 0,
  published_tests: 0,
  open_tests: 0,
  closed_tests: 0,
  total_attempts: 0,
  in_progress_attempts: 0,
  completed_attempts: 0,
  best_score: null,
  average_score: null,
  pass_rate: 0,
  awaiting_review_attempts: 0,
  high_risk_attempts: 0,
  medium_risk_attempts: 0,
  upcoming_count: 0,
  upcoming_schedules: [],
  attempt_status_breakdown: [],
  score_distribution: [],
  role_distribution: [],
  test_status_breakdown: [],
  recent_attempt_trend: [],
  top_tests: [],
  recent_flagged_attempts: [],
  generated_at: null,
}

export function formatCompact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

export function formatPercent(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  return `${Number(value).toFixed(digits)}%`
}

export function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(iso) {
  if (!iso) return 'No timestamp'
  const diffMs = new Date(iso).getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60000)
  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes >= 0 ? `In ${diffMinutes}m` : `${Math.abs(diffMinutes)}m ago`
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return diffHours >= 0 ? `In ${diffHours}h` : `${Math.abs(diffHours)}h ago`
  }
  const diffDays = Math.round(diffHours / 24)
  return diffDays >= 0 ? `In ${diffDays}d` : `${Math.abs(diffDays)}d ago`
}
