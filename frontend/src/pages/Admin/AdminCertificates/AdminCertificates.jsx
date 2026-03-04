import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminCertificates.module.scss'

export default function AdminCertificates() {
  const [exams, setExams] = useState([])
  const [savingId, setSavingId] = useState(null)

  const load = () => adminApi.exams().then(({ data }) => setExams(data || []))
  useEffect(() => { load() }, [])

  const updateCertificate = async (exam, field, value) => {
    const cert = { ...(exam.certificate || {}), [field]: value }
    setExams(prev => prev.map(e => e.id === exam.id ? { ...e, certificate: cert } : e))
    setSavingId(exam.id)
    await adminApi.updateExam(exam.id, { certificate: cert })
    setSavingId(null)
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Certificates" subtitle="Configure completion certificates per exam" />

      <div className={styles.list}>
        {exams.map(exam => {
          const cert = exam.certificate || {}
          return (
            <div key={exam.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.title}>{exam.title}</div>
                  <div className={styles.sub}>{exam.course_title || 'Standalone exam'}</div>
                </div>
                {savingId === exam.id && <span className={styles.saving}>Saving...</span>}
              </div>

              <div className={styles.grid}>
                <label>
                  <span>Certificate Title</span>
                  <input value={cert.title || ''} onChange={e => updateCertificate(exam, 'title', e.target.value)} placeholder="Certificate of Completion" />
                </label>
                <label>
                  <span>Subtitle</span>
                  <input value={cert.subtitle || ''} onChange={e => updateCertificate(exam, 'subtitle', e.target.value)} placeholder="Awarded to learners who..." />
                </label>
                <label>
                  <span>Issuer / Organization</span>
                  <input value={cert.issuer || ''} onChange={e => updateCertificate(exam, 'issuer', e.target.value)} placeholder="SYRA Learning Institute" />
                </label>
                <label>
                  <span>Signer Name</span>
                  <input value={cert.signer || ''} onChange={e => updateCertificate(exam, 'signer', e.target.value)} placeholder="Dr. Jane Doe" />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
