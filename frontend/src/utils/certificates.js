export const DEFAULT_CERTIFICATE_ISSUE_RULE = 'ON_PASS'

export const CERTIFICATE_ISSUE_RULE_OPTIONS = [
  {
    value: 'ON_PASS',
    label: 'Issue upon passing',
    description: 'Certificate becomes available as soon as the learner completes the test and meets the passing score.',
  },
  {
    value: 'POSITIVE_PROCTORING',
    label: 'Issue only if positive proctoring',
    description: 'Certificate is blocked when the attempt has medium or high proctoring alerts.',
  },
  {
    value: 'AFTER_PROCTORING_REVIEW',
    label: 'Issue after proctoring review',
    description: 'Certificate stays pending until an admin or instructor approves it after reviewing the attempt.',
  },
]

export function normalizeCertificateIssueRule(value) {
  const normalized = String(value || DEFAULT_CERTIFICATE_ISSUE_RULE).trim().toUpperCase()
  return CERTIFICATE_ISSUE_RULE_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_CERTIFICATE_ISSUE_RULE
}

export function certificateIssueRuleLabel(value) {
  return CERTIFICATE_ISSUE_RULE_OPTIONS.find((option) => option.value === normalizeCertificateIssueRule(value))?.label || 'Issue upon passing'
}
