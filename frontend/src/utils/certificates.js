export const DEFAULT_CERTIFICATE_ISSUE_RULE = 'ON_PASS'

export const CERTIFICATE_ISSUE_RULE_OPTIONS = [
  {
    value: 'ON_PASS',
    labelKey: 'cert_rule_issue_upon_passing',
    descriptionKey: 'cert_rule_issue_upon_passing_desc',
  },
  {
    value: 'POSITIVE_PROCTORING',
    labelKey: 'cert_rule_positive_proctoring',
    descriptionKey: 'cert_rule_positive_proctoring_desc',
  },
  {
    value: 'AFTER_PROCTORING_REVIEW',
    labelKey: 'cert_rule_after_review',
    descriptionKey: 'cert_rule_after_review_desc',
  },
]

export function normalizeCertificateIssueRule(value) {
  const normalized = String(value || DEFAULT_CERTIFICATE_ISSUE_RULE).trim().toUpperCase()
  return CERTIFICATE_ISSUE_RULE_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_CERTIFICATE_ISSUE_RULE
}

export function certificateIssueRuleLabelKey(value) {
  return CERTIFICATE_ISSUE_RULE_OPTIONS.find((option) => option.value === normalizeCertificateIssueRule(value))?.labelKey || 'cert_rule_issue_upon_passing'
}
