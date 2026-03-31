import React, { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import useUnsavedChanges from '../../hooks/useUnsavedChanges'
import useLanguage from '../../hooks/useLanguage'
import { changePassword, updateProfile } from '../../services/auth.service'
import styles from './Profile.module.scss'

export default function Profile() {
  const { user, setUser } = useAuth()
  const { t } = useLanguage()
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
  const isProfileDirty = editing && (
    normalizedProfile.name !== (user?.name || '').trim()
    || normalizedProfile.email !== String(user?.email || '').trim().toLowerCase()
  )

  useUnsavedChanges(isProfileDirty && !profileSaving)

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
    if (!normalizedProfile.name) { setProfileError(t('profile_name_required')); return }
    if (!normalizedProfile.email) { setProfileError(t('profile_email_required')); return }
    if (
      normalizedProfile.name === (user?.name || '').trim()
      && normalizedProfile.email === String(user?.email || '').trim().toLowerCase()
    ) {
      setProfileSuccess(t('profile_no_changes'))
      setEditing(false)
      return
    }
    setProfileSaving(true)
    try {
      const { data } = await updateProfile(normalizedProfile)
      if (setUser) setUser(prev => ({ ...prev, name: data.name, email: data.email }))
      setProfileSuccess(t('profile_updated'))
      setEditing(false)
    } catch (err) {
      setProfileError(err.response?.data?.detail || t('profile_update_failed'))
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePw = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!currentPw.trim()) {
      setError(t('profile_current_pw_required'))
      return
    }
    if (newPw !== confirmPw) {
      setError(t('validation_passwords_mismatch'))
      return
    }
    if (newPw.length < 8) {
      setError(t('validation_password_min_length'))
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPw, newPw)
      setSuccess(t('profile_password_changed'))
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setError(err.response?.data?.detail || t('profile_password_change_failed'))
    } finally {
      setSaving(false)
    }
  }

  const initials = (user?.name || user?.user_id || '?').slice(0, 2).toUpperCase()

  if (!user) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>{t('profile_title')}</h2>
        <div className={styles.card}>
          <div className={styles.errorMsg}>{t('profile_load_error')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{t('profile_title')}</h2>

      <div className={styles.card}>
        <div className={styles.avatar}>{initials}</div>

        {!editing ? (
          <>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('name')}</span>
              <span className={styles.infoValue}>{user?.name || user?.user_id || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('email')}</span>
              <span className={styles.infoValue}>{user?.email || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile_user_id')}</span>
              <span className={styles.infoValue}>{user?.user_id || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile_role')}</span>
              <span className={styles.roleBadge}>{user?.role || '-'}</span>
            </div>
            {profileSuccess && <div className={styles.successMsg}>{profileSuccess}</div>}
            <button className={styles.btnOutline} type="button" onClick={handleEditToggle}>{t('profile_edit')}</button>
          </>
        ) : (
          <form onSubmit={handleProfileSave} noValidate>
            <h3 className={styles.sectionTitle}>{t('profile_edit')}</h3>
            {profileError && <div className={styles.errorMsg}>{profileError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="profile-name">{t('name')}</label>
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
              <label className={styles.label} htmlFor="profile-email">{t('email')}</label>
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
              <span className={styles.infoLabel}>{t('profile_user_id')}</span>
              <span className={styles.infoValue}>{user?.user_id || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile_role')}</span>
              <span className={styles.roleBadge}>{user?.role || '-'}</span>
            </div>
            <div className={styles.actionRow}>
              <button className={styles.btn} type="submit" disabled={profileSaving}>
                {profileSaving ? t('saving') : t('profile_save_changes')}
              </button>
              <button className={styles.btnOutline} type="button" onClick={handleEditToggle} disabled={profileSaving}>{t('cancel')}</button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>{t('profile_change_password')}</h3>
        {success && <div className={styles.successMsg}>{success}</div>}
        {error && <div className={styles.errorMsg}>{error}</div>}
        <form onSubmit={handleChangePw} noValidate>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="current-password">{t('profile_current_password')}</label>
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
            <label className={styles.label} htmlFor="new-password">{t('profile_new_password')}</label>
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
            <label className={styles.label} htmlFor="confirm-password">{t('profile_confirm_new_password')}</label>
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
            {saving ? t('saving') : t('profile_update_password')}
          </button>
        </form>
      </div>
    </div>
  )
}
