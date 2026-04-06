import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import { canonicalizePermissionRows, DEFAULT_PERMISSION_ROWS } from '../../../utils/permissions'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminRolesPermissions.module.scss'

const DEFAULTS = DEFAULT_PERMISSION_ROWS
const KEY = 'permissions_config'
const ADMIN_LOCKED_FEATURES = new Set(['Manage Roles', 'System Settings'])

function serializeRows(rows) {
  return JSON.stringify(canonicalizePermissionRows(rows))
}

export default function AdminRolesPermissions() {
  const { t } = useLanguage()
  const [permissions, setPermissions] = useState(DEFAULTS)
  const [savedPermissions, setSavedPermissions] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeType, setNoticeType] = useState('success')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')

    adminApi.getSetting(KEY).then(({ data }) => {
      if (cancelled) return
      const raw = data?.value
      if (!raw) {
        setPermissions(DEFAULTS)
        setSavedPermissions(DEFAULTS)
        return
      }
      try {
        const parsed = JSON.parse(raw)
        const canonical = canonicalizePermissionRows(parsed)
        setPermissions(canonical)
        setSavedPermissions(canonical)
      } catch {
        setPermissions(DEFAULTS)
        setSavedPermissions(DEFAULTS)
        setLoadError(t('admin_roles_invalid_permissions'))
      }
    }).catch(() => {
      if (cancelled) return
      setPermissions(DEFAULTS)
      setSavedPermissions(DEFAULTS)
      setLoadError(t('admin_roles_load_error'))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const dirty = useMemo(
    () => serializeRows(permissions) !== serializeRows(savedPermissions),
    [permissions, savedPermissions],
  )

  const toggle = (idx, role) => {
    setPermissions((prev) => prev.map((permission, index) => (
      index === idx ? { ...permission, [role]: !permission[role] } : permission
    )))
  }

  const handleSave = async () => {
    const canonical = canonicalizePermissionRows(permissions)
    setSaving(true)
    setNotice('')
    try {
      await adminApi.updateSetting(KEY, JSON.stringify(canonical))
      setPermissions(canonical)
      setSavedPermissions(canonical)
      setNotice(t('admin_roles_saved'))
      setNoticeType('success')
      setTimeout(() => setNotice(''), 3000)
    } catch (error) {
      const detail = error.response?.data?.detail || t('admin_roles_save_failed')
      setNotice(`${t('admin_roles_save_failed_prefix')}: ${detail}`)
      setNoticeType('error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setPermissions(DEFAULTS)
    setNotice(t('admin_roles_defaults_restored'))
    setNoticeType('success')
    setTimeout(() => setNotice(''), 3000)
  }

  const handleReload = () => {
    setNotice('')
    setReloadKey((current) => current + 1)
  }

  const noticeClassName = `${styles.alert} ${noticeType === 'error' ? styles.alertError : styles.alertSuccess}`

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_roles_title')} subtitle={t('admin_roles_subtitle')}>
        <div className={styles.actionGroup}>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading || saving}
            className={styles.secondaryButton}
          >
            {t('admin_roles_restore_defaults')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            className={styles.primaryButton}
          >
            {saving ? t('admin_roles_saving') : t('admin_roles_save')}
          </button>
        </div>
      </AdminPageHeader>

      {loadError && (
        <div className={`${styles.alert} ${styles.alertWarning}`}>
          <span>{loadError}</span>
          <button
            type="button"
            className={styles.inlineButton}
            onClick={handleReload}
            disabled={loading || saving}
          >
            {t('admin_roles_reload')}
          </button>
        </div>
      )}
      {notice && (
        <div className={noticeClassName}>
          {notice}
        </div>
      )}
      {!loading && dirty && (
        <div className={`${styles.alert} ${styles.alertInfo}`}>
          {t('admin_roles_unsaved_changes')}
        </div>
      )}

      {loading ? (
        <div className={styles.legend}>
          <div className={styles.legendTitle}>{t('admin_roles_loading')}</div>
        </div>
      ) : (
        <div className={styles.matrixWrap}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th>{t('admin_roles_permission')}</th>
                <th><span className={`${styles.roleBadge} ${styles.roleAdmin}`}>{t('admin_roles_admin')}</span></th>
                <th><span className={`${styles.roleBadge} ${styles.roleInstructor}`}>{t('admin_roles_instructor')}</span></th>
                <th><span className={`${styles.roleBadge} ${styles.roleLearner}`}>{t('admin_roles_learner')}</span></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission, idx) => (
                <tr key={permission.feature}>
                  <td>{t('admin_roles_feature_' + permission.feature.toLowerCase().replace(/[\s.]+/g, '_'))}</td>
                  {['admin', 'instructor', 'learner'].map((role) => (
                    <td key={role}>
                      <input
                        type="checkbox"
                        checked={!!permission[role]}
                        disabled={role === 'admin' && ADMIN_LOCKED_FEATURES.has(permission.feature)}
                        onChange={() => toggle(idx, role)}
                        className={styles.checkbox}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.legend}>
        <div className={styles.legendTitle}>{t('admin_roles_access_model')}</div>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleAdmin}`}>{t('admin_roles_admin')}</span>
            {t('admin_roles_admin_desc')}
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleInstructor}`}>{t('admin_roles_instructor')}</span>
            {t('admin_roles_instructor_desc')}
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleLearner}`}>{t('admin_roles_learner')}</span>
            {t('admin_roles_learner_desc')}
          </div>
        </div>
      </div>
    </div>
  )
}
