import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useLanguage from '../../../hooks/useLanguage'
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
  if (err?.userMessage) return err.userMessage
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  return fallback
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
  const { t } = useLanguage()
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
      setError(resolveError(err, t('admin_certs_load_error')))
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
        [exam.id]: t('admin_certs_draft_only'),
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
      setNotice(certificate ? t('admin_certs_saved') : t('admin_certs_removed'))
      setTimeout(() => {
        setSavedId((current) => (current === exam.id ? null : current))
      }, 2000)
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [exam.id]: resolveError(err, t('admin_certs_save_error')),
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
      <AdminPageHeader title={t('admin_certs_title')} subtitle={t('admin_certs_subtitle')} />

      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button className={styles.secondaryBtn} onClick={() => void load()}>{t('retry')}</button>
        </div>
      )}
      {!error && notice && <div className={styles.noticeBanner}>{notice}</div>}
      {loading && <div className={styles.state}>{t('admin_certs_loading')}</div>}
      {!loading && !error && exams.length === 0 && <div className={styles.state}>{t('admin_certs_no_tests')}</div>}
      <div className={styles.list}>
        {exams.map((exam) => {
          const cert = getDraft(exam)
          const dirty = isDirty(exam)
          return (
            <div key={exam.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.title}>{exam.title}</div>
                  <div className={styles.sub}>{exam.code || t('admin_certs_no_code')} - {exam.status || 'DRAFT'}</div>
                </div>
                <div className={styles.cardActions}>
                  {savingId === exam.id ? (
                    <span className={styles.saving}>{t('saving')}</span>
                  ) : savedId === exam.id ? (
                    <span className={styles.saved}>{t('admin_certs_saved_label')}</span>
                  ) : (
                    <button
                      className={styles.saveBtn}
                      disabled={!dirty || exam.status !== 'DRAFT'}
                      onClick={() => void saveCertificate(exam)}
                    >
                      {t('save')}
                    </button>
                  )}
                  <button
                    className={styles.secondaryBtn}
                    disabled={!dirty || savingId === exam.id}
                    onClick={() => resetDraft(exam.id)}
                  >
                    {t('reset')}
                  </button>
                </div>
              </div>
              {saveErrors[exam.id] && <div className={styles.cardError}>{saveErrors[exam.id]}</div>}
              {exam.status !== 'DRAFT' && (
                <div className={styles.cardHint}>
                  {t('admin_certs_locked_hint')}
                </div>
              )}

              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('admin_certs_issue_rule')}</span>
                  <select
                    className={styles.input}
                    value={cert.issue_rule}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'issue_rule', e.target.value)}
                  >
                    {CERTIFICATE_ISSUE_RULE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('admin_certs_cert_title')}</span>
                  <input
                    className={styles.input}
                    value={cert.title}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'title', e.target.value)}
                    placeholder={t('admin_certs_title_placeholder')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('admin_certs_subtitle_label')}</span>
                  <input
                    className={styles.input}
                    value={cert.subtitle}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'subtitle', e.target.value)}
                    placeholder={t('admin_certs_subtitle_placeholder')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('admin_certs_issuer')}</span>
                  <input
                    className={styles.input}
                    value={cert.issuer}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'issuer', e.target.value)}
                    placeholder={t('admin_certs_issuer_placeholder')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('admin_certs_signer')}</span>
                  <input
                    className={styles.input}
                    value={cert.signer}
                    disabled={exam.status !== 'DRAFT'}
                    onChange={(e) => setDraft(exam.id, 'signer', e.target.value)}
                    placeholder={t('admin_certs_signer_placeholder')}
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
