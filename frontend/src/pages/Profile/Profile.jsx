import React, { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import { changePassword, updateProfile } from '../../services/auth.service'
import styles from './Profile.module.scss'

export default function Profile() {
  const { user, setUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setProfileForm({ name: user?.name || '', email: user?.email || '' })
  }, [user?.name, user?.email])

  const normalizedProfile = useMemo(() => ({
    name: profileForm.name.trim(),
    email: profileForm.email.trim().toLowerCase(),
  }), [profileForm.email, profileForm.name])

  const handleEditToggle = () => {
    if (profileSaving) return
    setProfileForm({ name: user?.name || '', email: user?.email || '' })
    setProfileSuccess('')
    setProfileError('')
    setEditing(e => !e)
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    if (!normalizedProfile.name) { setProfileError('Name is required.'); return }
    if (!normalizedProfile.email) { setProfileError('Email is required.'); return }
    if (
      normalizedProfile.name === (user?.name || '').trim()
      && normalizedProfile.email === String(user?.email || '').trim().toLowerCase()
    ) {
      setProfileSuccess('No profile changes to save.')
      setEditing(false)
      return
    }
    setProfileSaving(true)
    try {
      const { data } = await updateProfile(normalizedProfile)
      if (setUser) setUser(prev => ({ ...prev, name: data.name, email: data.email }))
      setProfileSuccess('Profile updated successfully.')
      setEditing(false)
    } catch (err) {
      setProfileError(err.response?.data?.detail || 'Failed to update profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePw = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!currentPw.trim()) {
      setError('Current password is required.')
      return
    }
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

  if (!user) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Profile</h2>
        <div className={styles.card}>
          <div className={styles.errorMsg}>Unable to load your account details right now.</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Profile</h2>

      <div className={styles.card}>
        <div className={styles.avatar}>{initials}</div>

        {!editing ? (
          <>
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
            {profileSuccess && <div className={styles.successMsg}>{profileSuccess}</div>}
            <button className={styles.btnOutline} type="button" onClick={handleEditToggle}>Edit Profile</button>
          </>
        ) : (
          <form onSubmit={handleProfileSave} noValidate>
            <h3 className={styles.sectionTitle}>Edit Profile</h3>
            {profileError && <div className={styles.errorMsg}>{profileError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                className={styles.input}
                value={profileForm.name}
                onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                disabled={profileSaving}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                className={styles.input}
                value={profileForm.email}
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                disabled={profileSaving}
                required
              />
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>User ID</span>
              <span className={styles.infoValue}>{user?.user_id || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Role</span>
              <span className={styles.roleBadge}>{user?.role || '-'}</span>
            </div>
            <div className={styles.actionRow}>
              <button className={styles.btn} type="submit" disabled={profileSaving}>
                {profileSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className={styles.btnOutline} type="button" onClick={handleEditToggle} disabled={profileSaving}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Change Password</h3>
        {success && <div className={styles.successMsg}>{success}</div>}
        {error && <div className={styles.errorMsg}>{error}</div>}
        <form onSubmit={handleChangePw} noValidate>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="current-password">Current Password</label>
            <input
              id="current-password"
              type="password"
              className={styles.input}
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              disabled={saving}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              type="password"
              className={styles.input}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              disabled={saving}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="confirm-password">Confirm New Password</label>
            <input
              id="confirm-password"
              type="password"
              className={styles.input}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              disabled={saving}
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
