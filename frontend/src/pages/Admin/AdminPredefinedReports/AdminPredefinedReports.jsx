import React from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminPredefinedReports.module.scss'

export default function AdminPredefinedReports() {
  const { t } = useLanguage()

  const PREDEFINED = [
    { key: 'test-performance', title: t('admin_predef_test_performance_title'), desc: t('admin_predef_test_performance_desc'), columns: [t('admin_predef_col_test'), t('admin_predef_col_attempts'), t('admin_predef_col_avg_score'), t('admin_predef_col_pass_rate')], audience: t('admin_predef_test_performance_audience'), cadence: t('admin_predef_test_performance_cadence') },
    { key: 'proctoring-alerts', title: t('admin_predef_proctoring_title'), desc: t('admin_predef_proctoring_desc'), columns: [t('admin_predef_col_attempt'), t('admin_predef_col_user'), t('admin_predef_col_high_alerts'), t('admin_predef_col_medium_alerts')], audience: t('admin_predef_proctoring_audience'), cadence: t('admin_predef_proctoring_cadence') },
    { key: 'learner-activity', title: t('admin_predef_learner_title'), desc: t('admin_predef_learner_desc'), columns: [t('admin_predef_col_user'), t('admin_predef_col_attempts'), t('admin_predef_col_submitted')], audience: t('admin_predef_learner_audience'), cadence: t('admin_predef_learner_cadence') },
  ]
  const [loadingKey, setLoadingKey] = React.useState('')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const generate = async (key) => {
    const report = PREDEFINED.find((entry) => entry.key === key)
    setLoadingKey(key)
    setError('')
    setNotice('')
    try {
      const res = await adminApi.generatePredefinedReport(key)
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${key}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setNotice(`${t('admin_predef_reports_downloaded')} ${report?.title || key} ${t('admin_predef_reports_as_csv')}.`)
    } catch (e) {
      setError(await readBlobErrorMessage(e, t('admin_predef_reports_failed_generate')))
    } finally {
      setLoadingKey('')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_predef_reports_title')} subtitle={t('admin_predef_reports_subtitle')} />
      <div className={styles.helper}>{t('admin_predef_reports_helper')}</div>
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      <div className={styles.grid}>
        {PREDEFINED.map((r) => (
          <div key={r.key} className={styles.card}>
            <div className={styles.title}>{r.title}</div>
            <div className={styles.sub}>{r.desc}</div>
            <div className={styles.metaRow}>
              <span className={styles.metaChip}>{r.columns.length} {t('admin_predef_reports_columns')}</span>
              <span className={styles.metaChip}>{t('admin_predef_reports_csv_export')}</span>
            </div>
            <div className={styles.metaDetail}>{t('admin_predef_reports_audience')}: {r.audience}</div>
            <div className={styles.metaDetail}>{r.cadence}</div>
            <div className={styles.colsLabel}>{t('admin_predef_reports_columns')}:</div>
            <div className={styles.chips}>{r.columns.map(c => <span key={c} className={styles.chip}>{c}</span>)}</div>
            <button type="button" className={styles.btn} onClick={() => generate(r.key)} disabled={loadingKey === r.key}>
              {loadingKey === r.key ? t('admin_predef_reports_working') : t('admin_predef_reports_generate')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
