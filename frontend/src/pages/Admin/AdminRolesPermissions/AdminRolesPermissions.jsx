import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import { canonicalizePermissionRows, DEFAULT_PERMISSION_ROWS } from '../../../utils/permissions'
import styles from './AdminRolesPermissions.module.scss'

const DEFAULTS = DEFAULT_PERMISSION_ROWS
const KEY = 'permissions_config'
const ADMIN_LOCKED_FEATURES = new Set(['Manage Roles', 'System Settings'])

function serializeRows(rows) {
  return JSON.stringify(canonicalizePermissionRows(rows))
}

export default function AdminRolesPermissions() {
  const [permissions, setPermissions] = useState(DEFAULTS)
  const [savedPermissions, setSavedPermissions] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
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
        setLoadError('Stored permissions were invalid. Showing default values.')
      }
    }).catch(() => {
      if (cancelled) return
      setPermissions(DEFAULTS)
      setSavedPermissions(DEFAULTS)
      setLoadError('Failed to load permission settings. Showing defaults.')
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
      setNotice('Permissions saved.')
      setTimeout(() => setNotice(''), 3000)
    } catch (error) {
      const detail = error.response?.data?.detail || 'Failed to save.'
      setNotice(`Failed to save: ${detail}`)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setPermissions(DEFAULTS)
    setNotice('Restored the default matrix. Save to apply it.')
    setTimeout(() => setNotice(''), 3000)
  }

  const handleReload = () => {
    setNotice('')
    setReloadKey((current) => current + 1)
  }

  const noticeClassName = `${styles.alert} ${notice.includes('Failed') ? styles.alertError : styles.alertSuccess}`

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Roles & Permissions" subtitle="Configure role-based access control">
        <div className={styles.actionGroup}>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading || saving}
            className={styles.secondaryButton}
          >
            Restore Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            className={styles.primaryButton}
          >
            {saving ? 'Saving...' : 'Save'}
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
            Reload
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
          You have unsaved permission changes.
        </div>
      )}

      {loading ? (
        <div className={styles.legend}>
          <div className={styles.legendTitle}>Loading permission matrix...</div>
        </div>
      ) : (
        <div className={styles.matrixWrap}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th>Permission</th>
                <th><span className={`${styles.roleBadge} ${styles.roleAdmin}`}>Admin</span></th>
                <th><span className={`${styles.roleBadge} ${styles.roleInstructor}`}>Instructor</span></th>
                <th><span className={`${styles.roleBadge} ${styles.roleLearner}`}>Learner</span></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission, idx) => (
                <tr key={permission.feature}>
                  <td>{permission.feature}</td>
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
        <div className={styles.legendTitle}>Role Access Model</div>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleAdmin}`}>Admin</span>
            Full platform access, including system settings, user groups, and role management.
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleInstructor}`}>Instructor</span>
            Can reach only the admin utility pages that are explicitly granted in this matrix, such as attempt analysis or scheduling.
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleLearner}`}>Learner</span>
            Self-service access to assigned tests, schedules, and personal attempt history.
          </div>
        </div>
      </div>
    </div>
  )
}
