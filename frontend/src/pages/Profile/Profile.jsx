import React, { useState } from 'react'
import useAuth from '../../hooks/useAuth'
import { changePassword } from '../../services/auth.service'
import styles from './Profile.module.scss'

export default function Profile() {
  const { user } = useAuth()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleChangePw = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (newPw !== confirmPw) {
      setError('Passwords do not match.')
      return
    }
    if (newPw.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPw, newPw)
      setSuccess('Password changed successfully.')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change password.')
    } finally {
      setSaving(false)
    }
  }

  const initials = (user?.name || user?.user_id || '?').slice(0, 2).toUpperCase()

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Profile</h2>

      <div className={styles.card}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Name</span>
          <span className={styles.infoValue}>{user?.name || user?.user_id || '-'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Email</span>
          <span className={styles.infoValue}>{user?.email || '-'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>User ID</span>
          <span className={styles.infoValue}>{user?.user_id || '-'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Role</span>
          <span className={styles.roleBadge}>{user?.role || '-'}</span>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Change Password</h3>
        {success && <div className={styles.successMsg}>{success}</div>}
        {error && <div className={styles.errorMsg}>{error}</div>}
        <form onSubmit={handleChangePw}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Current Password</label>
            <input
              type="password"
              className={styles.input}
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>New Password</label>
            <input
              type="password"
              className={styles.input}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Confirm New Password</label>
            <input
              type="password"
              className={styles.input}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              required
            />
          </div>
          <button className={styles.btn} type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
