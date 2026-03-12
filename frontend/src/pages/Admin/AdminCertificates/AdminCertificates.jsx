import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import {
  CERTIFICATE_ISSUE_RULE_OPTIONS,
  DEFAULT_CERTIFICATE_ISSUE_RULE,
  normalizeCertificateIssueRule,
} from '../../../utils/certificates'
import styles from './AdminCertificates.module.scss'

const EMPTY_CERTIFICATE = {
  issue_rule: DEFAULT_CERTIFICATE_ISSUE_RULE,
  title: '',
  subtitle: '',
  issuer: '',
  signer: '',
}

function resolveError(err, fallback) {
  return err?.response?.data?.detail || fallback
}

function normalizeCertificate(value) {
  const certificate = {
    issue_rule: normalizeCertificateIssueRule(value?.issue_rule),
    title: value?.title?.trim() || '',
    subtitle: value?.subtitle?.trim() || '',
    issuer: value?.issuer?.trim() || '',
    signer: value?.signer?.trim() || '',
  }
  const hasContent = Object.entries(certificate).some(([key, item]) => key !== 'issue_rule' && Boolean(item))
  return hasContent ? certificate : null
}

export default function AdminCertificates() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saveErrors, setSaveErrors] = useState({})

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await adminApi.allTests()
      setExams((data?.items || []).map(normalizeAdminTest))
    } catch (err) {
      setError(resolveError(err, 'Failed to load tests'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const getDraft = (exam) => ({
    ...EMPTY_CERTIFICATE,
    ...(exam.certificate ?? {}),
    ...(drafts[exam.id] ?? {}),
  })

  const resetDraft = (examId) => {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[examId]
      return next
    })
    setSaveErrors((prev) => {
      const next = { ...prev }
      delete next[examId]
      return next
    })
  }

  const setDraft = (examId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [examId]: {
        ...(prev[examId] ?? {}),
        [field]: value,
      },
    }))
  }

  const saveCertificate = async (exam) => {
    if (exam.status !== 'DRAFT') {
      setSaveErrors((prev) => ({
        ...prev,
        [exam.id]: 'Only draft tests can update certificate settings.',
      }))
      return
    }

    const certificate = normalizeCertificate(getDraft(exam))
    setSavingId(exam.id)
    setSavedId(null)
    setNotice('')
    setSaveErrors((prev) => {
      const next = { ...prev }
      delete next[exam.id]
      return next
    })

    try {
      await adminApi.updateTest(exam.id, { certificate })
      setExams((prev) =>
        prev.map((item) => (
          item.id === exam.id
            ? { ...item, certificate }
            : item
        ))
      )
      resetDraft(exam.id)
      setSavedId(exam.id)
      setNotice(certificate ? 'Certificate settings saved.' : 'Certificate settings removed.')
      setTimeout(() => {
        setSavedId((current) => (current === exam.id ? null : current))
      }, 2000)
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [exam.id]: resolveError(err, 'Failed to save certificate.'),
      }))
    } finally {
      setSavingId(null)
    }
  }

  const isDirty = (exam) => {
    if (drafts[exam.id] === undefined) return false
    return JSON.stringify(normalizeCertificate(exam.certificate)) !== JSON.stringify(normalizeCertificate(getDraft(exam)))
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Certificates" subtitle="Configure completion certificates per test" />

      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button className={styles.secondaryBtn} onClick={() => void load()}>Retry</button>
        </div>
      )}
      {!error && notice && <div className={styles.noticeBanner}>{notice}</div>}
      {loading && <div className={styles.state}>Loading certificate settings...</div>}
      {!loading && !error && exams.length === 0 && <div className={styles.state}>No tests available for certificate configuration.</div>}
      <div className={styles.list}>
        {exams.map((exam) => {
          const cert = getDraft(exam)
          const dirty = isDirty(exam)
          return (
            <div key={exam.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.title}>{exam.title}</div>
                  <div className={styles.sub}>{exam.code || 'No code'} - {exam.status || 'DRAFT'}</div>
                </div>
                <div className={styles.cardActions}>
                  {savingId === exam.id ? (
                    <span className={styles.saving}>Saving...</span>
                  ) : savedId === exam.id ? (
                    <span className={styles.saved}>Saved</span>
                  ) : (
                    <button
                      className={styles.saveBtn}
                      disabled={!dirty || exam.status !== 'DRAFT'}
                      onClick={() => void saveCertificate(exam)}
                    >
                      Save
                    </button>
                  )}
                  <button
                    className={styles.secondaryBtn}
                    disabled={!dirty || savingId === exam.id}
                    onClick={() => resetDraft(exam.id)}
                  >
                    Reset
                  </button>
                </div>
              </div>
              {saveErrors[exam.id] && <div className={styles.cardError}>{saveErrors[exam.id]}</div>}
              {exam.status !== 'DRAFT' && (
                <div className={styles.cardHint}>
                  Published and archived tests are locked. Work from a draft to change certificate content.
                </div>
              )}

              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Issue rule</span>
                  <select
                    className={styles.input}
                    value={cert.issue_rule}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'issue_rule', e.target.value)}
                  >
                    {CERTIFICATE_ISSUE_RULE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Certificate Title</span>
                  <input
                    className={styles.input}
                    value={cert.title}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'title', e.target.value)}
                    placeholder="Certificate of Completion"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Subtitle</span>
                  <input
                    className={styles.input}
                    value={cert.subtitle}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'subtitle', e.target.value)}
                    placeholder="Awarded to learners who..."
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Issuer / Organization</span>
                  <input
                    className={styles.input}
                    value={cert.issuer}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'issuer', e.target.value)}
                    placeholder="SYRA Learning Institute"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Signer Name</span>
                  <input
                    className={styles.input}
                    value={cert.signer}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'signer', e.target.value)}
                    placeholder="Dr. Jane Doe"
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
