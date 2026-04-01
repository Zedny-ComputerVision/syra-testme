import React, { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../../utils/pagination'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminUserGroups.module.scss'

function resolveError(err) {
  return (
    err.response?.data?.detail ||
    err.response?.data?.error?.message ||
    err.response?.data?.error?.detail ||
    err.message ||
    'Action failed.'
  )
}

export default function AdminUserGroups() {
  const { t } = useLanguage()
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [allTests, setAllTests] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [groupsReady, setGroupsReady] = useState(false)
  const [usersReady, setUsersReady] = useState(false)
  const [testsReady, setTestsReady] = useState(false)
  const [schedulesReady, setSchedulesReady] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [addUserId, setAddUserId] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberLoading, setMemberLoading] = useState(false)
  const [error, setError] = useState('')
  const [bootstrapMessage, setBootstrapMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deletingGroupId, setDeletingGroupId] = useState(null)
  const [bulkTestId, setBulkTestId] = useState('')
  const [bulkScheduledAt, setBulkScheduledAt] = useState('')
  const [bulkAccessMode, setBulkAccessMode] = useState('OPEN')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkNotice, setBulkNotice] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState(null)
  const abortRef = useRef(null)

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const [groupsRes, usersRes, testsRes, schedulesRes] = await Promise.allSettled([
        adminApi.userGroups({ signal: controller.signal }),
        adminApi.users({ role: 'LEARNER', skip: 0, limit: 200 }, { signal: controller.signal }),
        adminApi.allTests({}, { signal: controller.signal }),
        adminApi.schedules({ signal: controller.signal }),
      ])
      if (controller.signal.aborted) return
      const partialFailures = []

      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value.data || [])
        setGroupsReady(true)
      } else {
        setGroups([])
        setGroupsReady(false)
        partialFailures.push('groups')
        setSelectedGroup(null)
        setMembers([])
      }

      if (usersRes.status === 'fulfilled') {
        setUsers(readPaginatedItems(usersRes.value.data).filter((user) => user.role === 'LEARNER'))
        setUsersReady(true)
      } else {
        setUsers([])
        setUsersReady(false)
        partialFailures.push('users')
      }

      if (testsRes.status === 'fulfilled') {
        setAllTests((testsRes.value.data?.items || []).map(normalizeAdminTest))
        setTestsReady(true)
      } else {
        setAllTests([])
        setTestsReady(false)
        partialFailures.push('tests')
      }

      if (schedulesRes.status === 'fulfilled') {
        setAllSchedules(schedulesRes.value.data || [])
        setSchedulesReady(true)
      } else {
        setAllSchedules([])
        setSchedulesReady(false)
        partialFailures.push('schedules')
      }

      if (groupsRes.status === 'rejected') {
        setError(resolveError(groupsRes.reason) || t('admin_groups_failed_load_groups'))
      } else {
        setError('')
      }

      if (groupsRes.status === 'rejected') {
        setBootstrapMessage(t('admin_groups_bootstrap_groups_failed'))
      } else if (partialFailures.length > 0) {
        setBootstrapMessage(t('admin_groups_bootstrap_partial_failed'))
      } else {
        setBootstrapMessage('')
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return
      setGroups([])
      setUsers([])
      setAllTests([])
      setAllSchedules([])
      setGroupsReady(false)
      setUsersReady(false)
      setTestsReady(false)
      setSchedulesReady(false)
      setBootstrapMessage(t('admin_groups_bootstrap_load_failed'))
      setError(resolveError(err) || t('admin_groups_failed_load_groups'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [load])

  const loadMembers = async (group) => {
    setSelectedGroup(group)
    setMemberLoading(true)
    setBulkNotice('')
    setSelectedUserIds([])
    setMemberSearch('')
    try {
      const { data } = await adminApi.getUserGroupMembers(group.id)
      setMembers(data || [])
      setError('')
    } catch (err) {
      setMembers([])
      setError(resolveError(err) || t('admin_groups_failed_load_members'))
    } finally {
      setMemberLoading(false)
    }
  }

  const create = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError(t('admin_groups_name_required'))
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await adminApi.createUserGroup({
        name: form.name.trim(),
        description: form.description.trim() || null,
      })
      setForm({ name: '', description: '' })
      setNotice(t('admin_groups_group_created'))
      await load()
      if (data?.id) {
        await loadMembers(data)
      }
    } catch (err) {
      setError(resolveError(err) || t('admin_groups_failed_create'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    setDeletingGroupId(id)
    setError('')
    setNotice('')
    try {
      await adminApi.deleteUserGroup(id)
      setDeleteConfirmId(null)
      if (selectedGroup?.id === id) {
        setSelectedGroup(null)
        setMembers([])
      }
      setNotice(t('admin_groups_group_deleted'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_groups_failed_delete'))
    } finally {
      setDeletingGroupId(null)
    }
  }

  const addMember = async () => {
    if (!selectedGroup) return
    if (!addUserId) {
      setError(t('admin_groups_select_learner'))
      return
    }
    setError('')
    setNotice('')
    setAddingMember(true)
    try {
      await adminApi.addUserGroupMember(selectedGroup.id, addUserId)
      setAddUserId('')
      setNotice(t('admin_groups_member_added'))
      await loadMembers(selectedGroup)
    } catch (err) {
      setError(resolveError(err) || t('admin_groups_failed_add_member'))
    } finally {
      setAddingMember(false)
    }
  }

  const addSelectedMembers = async () => {
    if (!selectedGroup || selectedUserIds.length === 0) return
    setAddingMember(true)
    setError('')
    setNotice('')
    try {
      const { data } = await adminApi.addUserGroupMembersBulk(selectedGroup.id, selectedUserIds)
      setSelectedUserIds([])
      setMemberSearch('')
      setNotice(data?.detail || t('admin_groups_members_added'))
      await loadMembers(selectedGroup)
    } catch (err) {
      setError(resolveError(err) || t('admin_groups_failed_add_members'))
    } finally {
      setAddingMember(false)
    }
  }

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId])
  }

  const removeMember = async (userId) => {
    setError('')
    setNotice('')
    setRemovingMemberId(userId)
    try {
      await adminApi.removeUserGroupMember(selectedGroup.id, userId)
      setNotice(t('admin_groups_member_removed'))
      await loadMembers(selectedGroup)
    } catch (err) {
      setError(resolveError(err) || t('admin_groups_failed_remove_member'))
    } finally {
      setRemovingMemberId(null)
    }
  }

  const handleBulkAssign = async (event) => {
    event.preventDefault()
    if (!bulkTestId || !bulkScheduledAt || members.length === 0) {
      setError(t('admin_groups_bulk_assign_required'))
      return
    }
    setBulkBusy(true)
    setBulkNotice('')
    setError('')
    let created = 0
    let updated = 0
    try {
      for (const member of members) {
        const existing = allSchedules.find((schedule) => String(schedule.exam_id) === String(bulkTestId) && String(schedule.user_id) === String(member.id))
        const payload = {
          scheduled_at: new Date(bulkScheduledAt).toISOString(),
          access_mode: bulkAccessMode,
        }
        if (existing) {
          await adminApi.updateSchedule(existing.id, payload)
          updated += 1
        } else {
          await adminApi.createSchedule({ exam_id: bulkTestId, user_id: member.id, ...payload })
          created += 1
        }
      }
      const { data } = await adminApi.schedules()
      setAllSchedules(data || [])
      setBulkNotice(`Done: ${created} created, ${updated} updated for ${members.length} member${members.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setError(resolveError(err) || t('admin_groups_bulk_assign_failed'))
    } finally {
      setBulkBusy(false)
    }
  }

  const nonMembers = users.filter((user) => !members.find((member) => member.id === user.id || member.user_id === user.user_id))
  const normalizedMemberSearch = memberSearch.trim().toLowerCase()
  const filteredNonMembers = normalizedMemberSearch
    ? nonMembers.filter((user) =>
        (user.name || '').toLowerCase().includes(normalizedMemberSearch) ||
        (user.email || '').toLowerCase().includes(normalizedMemberSearch) ||
        (user.user_id || '').toLowerCase().includes(normalizedMemberSearch)
      )
    : nonMembers

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_groups_title')} subtitle={t('admin_groups_subtitle')} />
      {error && <div className={styles.errorMsg}>{error}</div>}
      {bootstrapMessage && (
        <div className={styles.helperRow}>
          <span className={styles.empty}>{bootstrapMessage}</span>
          <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>{t('admin_groups_retry')}</button>
        </div>
      )}
      {notice && <div className={styles.noticeMsg}>{notice}</div>}
      <div className={styles.grid}>
        <div>
          <form className={styles.card} onSubmit={create}>
            <div className={styles.sectionTitle}>{t('admin_groups_new_group')}</div>
            <label className={styles.label}>{t('admin_groups_name_label')}</label>
            <input className={styles.input} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            <label className={styles.label}>{t('admin_groups_description_label')}</label>
            <textarea className={styles.textarea} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
            <button className={styles.btnPrimary} type="submit" disabled={saving}>{saving ? t('admin_groups_saving') : t('admin_groups_save_group')}</button>
          </form>

          <div className={styles.card}>
            <div className={styles.sectionTitle}>{t('admin_groups_groups')}</div>
            {loading && <div className={styles.empty}>{t('admin_groups_loading')}</div>}
            {!loading && groups.length === 0 && <div className={styles.empty}>{t('admin_groups_no_groups')}</div>}
            {groups.map((group) => (
              <div key={group.id} className={`${styles.row} ${selectedGroup?.id === group.id ? styles.rowActive : ''}`}>
                <button type="button" className={styles.rowBtn} onClick={() => loadMembers(group)} aria-label={`Open group ${group.name}`} title={`Open group ${group.name}`}>
                  <div className={styles.rowTitle}>{group.name}</div>
                  <div className={styles.rowSub}>{group.description || t('admin_groups_no_description')}</div>
                </button>
                {deleteConfirmId === group.id ? (
                  <>
                    <button type="button" className={`${styles.deleteBtn} ${styles.deleteConfirmBtn}`} onClick={() => remove(group.id)} disabled={deletingGroupId === group.id} aria-label={`Confirm delete for group ${group.name}`}>
                      {deletingGroupId === group.id ? t('admin_groups_deleting') : t('admin_groups_confirm')}
                    </button>
                    <button type="button" className={styles.deleteBtn} onClick={() => setDeleteConfirmId(null)} disabled={deletingGroupId === group.id} aria-label={`Keep group ${group.name}`}>{t('admin_groups_cancel')}</button>
                  </>
                ) : (
                  <button type="button" className={styles.deleteBtn} onClick={() => remove(group.id)} disabled={deletingGroupId === group.id} aria-label={`Delete group ${group.name}`} title={`Delete group ${group.name}`}>{t('admin_groups_delete')}</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {selectedGroup && (
          <div className={styles.card}>
            <div className={styles.sectionTitle}>{t('admin_groups_members')} - {selectedGroup.name}</div>
            {!usersReady && (
              <div className={styles.helperRow}>
                <span className={styles.empty}>{t('admin_groups_learner_lookup_unavailable')}</span>
                <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>{t('admin_groups_retry')}</button>
              </div>
            )}
            <div className={styles.addSection}>
              <input
                className={styles.input}
                placeholder={t('admin_groups_search_learners_placeholder')}
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                disabled={!usersReady}
              />
              {usersReady && nonMembers.length > 0 && (
                <div className={styles.userChecklist}>
                  {filteredNonMembers.length === 0 && (
                    <div className={styles.empty}>{t('admin_groups_no_learners_match')}</div>
                  )}
                  {filteredNonMembers.map((user) => (
                    <label key={user.id} className={styles.checklistItem}>
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                      />
                      <div>
                        <div className={styles.checklistName}>{user.name || user.user_id}</div>
                        <div className={styles.checklistSub}>{user.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedUserIds.length > 0 && (
                <button type="button" className={styles.btnPrimary} onClick={addSelectedMembers} disabled={addingMember}>
                  {addingMember ? t('admin_groups_adding') : t('admin_groups_add_selected_members')}
                </button>
              )}
            </div>
            {usersReady && !memberLoading && nonMembers.length === 0 && (
              <div className={styles.empty}>{t('admin_groups_all_learners_assigned')}</div>
            )}
            {memberLoading ? (
              <div className={styles.empty}>{t('admin_groups_loading_members')}</div>
            ) : members.length === 0 ? (
              <div className={styles.empty}>{t('admin_groups_no_members')}</div>
            ) : (
              members.map((member) => (
                <div key={member.id} className={styles.memberRow}>
                  <div>
                    <div className={styles.rowTitle}>{member.name || member.user_id}</div>
                    <div className={styles.rowSub}>{member.email}</div>
                  </div>
                  <button type="button" className={styles.deleteBtn} onClick={() => removeMember(member.id)} disabled={removingMemberId === member.id}>
                    {removingMemberId === member.id ? t('admin_groups_removing') : t('admin_groups_remove')}
                  </button>
                </div>
              ))
            )}

            <div className={styles.bulkSection}>
              <div className={`${styles.sectionTitle} ${styles.subsectionTitle}`}>{t('admin_groups_bulk_assignment')}</div>
              <p className={styles.empty}>{t('admin_groups_bulk_assignment_description')}</p>
              {(!testsReady || !schedulesReady) && (
                <div className={styles.helperRow}>
                  <span className={styles.empty}>{t('admin_groups_test_schedule_unavailable')}</span>
                  <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>{t('admin_groups_retry')}</button>
                </div>
              )}
              {bulkNotice && <div className={styles.bulkNotice}>{bulkNotice}</div>}
              <form onSubmit={handleBulkAssign}>
                <label className={styles.label}>{t('admin_groups_test_label')}</label>
                <select className={styles.select} value={bulkTestId} onChange={(event) => setBulkTestId(event.target.value)} required disabled={!testsReady}>
                  <option value="">{t('admin_groups_select_test')}</option>
                  {allTests.map((test) => (
                    <option key={test.id} value={test.id}>{test.title || test.name} ({test.status || '-'})</option>
                  ))}
                </select>
                <label className={styles.label}>{t('admin_groups_scheduled_datetime')}</label>
                <input type="datetime-local" className={styles.input} value={bulkScheduledAt} onChange={(event) => setBulkScheduledAt(event.target.value)} required disabled={!testsReady || !schedulesReady} />
                <label className={styles.label}>{t('admin_groups_access_mode')}</label>
                <select className={styles.select} value={bulkAccessMode} onChange={(event) => setBulkAccessMode(event.target.value)} disabled={!testsReady || !schedulesReady}>
                  <option value="OPEN">OPEN</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
                <button className={styles.btnPrimary} type="submit" disabled={bulkBusy || members.length === 0 || !bulkTestId || !bulkScheduledAt || !testsReady || !schedulesReady}>
                  {bulkBusy ? t('admin_groups_assigning') : t('admin_groups_assign_all_members')}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
