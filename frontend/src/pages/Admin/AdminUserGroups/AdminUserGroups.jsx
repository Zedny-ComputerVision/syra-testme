import React, { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../../utils/pagination'
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
        setError(resolveError(groupsRes.reason) || 'Failed to load groups.')
      } else {
        setError('')
      }

      if (groupsRes.status === 'rejected') {
        setBootstrapMessage('Group data could not be loaded. Retry to continue.')
      } else if (partialFailures.length > 0) {
        setBootstrapMessage('Some group management data could not be loaded. Retry to enable member assignment and bulk scheduling.')
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
      setBootstrapMessage('Group management data could not be loaded. Retry to continue.')
      setError(resolveError(err) || 'Failed to load groups.')
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
      setError(resolveError(err) || 'Failed to load group members')
    } finally {
      setMemberLoading(false)
    }
  }

  const create = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Group name is required.')
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
      setNotice('Group created.')
      await load()
      if (data?.id) {
        await loadMembers(data)
      }
    } catch (err) {
      setError(resolveError(err) || 'Failed to create group')
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
      setNotice('Group deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to delete group')
    } finally {
      setDeletingGroupId(null)
    }
  }

  const addMember = async () => {
    if (!selectedGroup) return
    if (!addUserId) {
      setError('Select a learner to add.')
      return
    }
    setError('')
    setNotice('')
    setAddingMember(true)
    try {
      await adminApi.addUserGroupMember(selectedGroup.id, addUserId)
      setAddUserId('')
      setNotice('Member added.')
      await loadMembers(selectedGroup)
    } catch (err) {
      setError(resolveError(err) || 'Failed to add member')
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
      setNotice(data?.detail || `${selectedUserIds.length} members added.`)
      await loadMembers(selectedGroup)
    } catch (err) {
      setError(resolveError(err) || 'Failed to add members')
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
      setNotice('Member removed.')
      await loadMembers(selectedGroup)
    } catch (err) {
      setError(resolveError(err) || 'Failed to remove member')
    } finally {
      setRemovingMemberId(null)
    }
  }

  const handleBulkAssign = async (event) => {
    event.preventDefault()
    if (!bulkTestId || !bulkScheduledAt || members.length === 0) {
      setError('Choose a test, a schedule, and at least one member.')
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
      setError(resolveError(err) || 'Bulk assignment failed.')
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
      <AdminPageHeader title="User Groups" subtitle="Organize learners into cohorts" />
      {error && <div className={styles.errorMsg}>{error}</div>}
      {bootstrapMessage && (
        <div className={styles.helperRow}>
          <span className={styles.empty}>{bootstrapMessage}</span>
          <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>Retry</button>
        </div>
      )}
      {notice && <div className={styles.noticeMsg}>{notice}</div>}
      <div className={styles.grid}>
        <div>
          <form className={styles.card} onSubmit={create}>
            <div className={styles.sectionTitle}>New Group</div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            <label className={styles.label}>Description</label>
            <textarea className={styles.textarea} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
            <button className={styles.btnPrimary} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Group'}</button>
          </form>

          <div className={styles.card}>
            <div className={styles.sectionTitle}>Groups</div>
            {loading && <div className={styles.empty}>Loading groups...</div>}
            {!loading && groups.length === 0 && <div className={styles.empty}>No groups yet.</div>}
            {groups.map((group) => (
              <div key={group.id} className={`${styles.row} ${selectedGroup?.id === group.id ? styles.rowActive : ''}`}>
                <button type="button" className={styles.rowBtn} onClick={() => loadMembers(group)} aria-label={`Open group ${group.name}`} title={`Open group ${group.name}`}>
                  <div className={styles.rowTitle}>{group.name}</div>
                  <div className={styles.rowSub}>{group.description || 'No description'}</div>
                </button>
                {deleteConfirmId === group.id ? (
                  <>
                    <button type="button" className={`${styles.deleteBtn} ${styles.deleteConfirmBtn}`} onClick={() => remove(group.id)} disabled={deletingGroupId === group.id} aria-label={`Confirm delete for group ${group.name}`}>
                      {deletingGroupId === group.id ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button type="button" className={styles.deleteBtn} onClick={() => setDeleteConfirmId(null)} disabled={deletingGroupId === group.id} aria-label={`Keep group ${group.name}`}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className={styles.deleteBtn} onClick={() => remove(group.id)} disabled={deletingGroupId === group.id} aria-label={`Delete group ${group.name}`} title={`Delete group ${group.name}`}>Delete</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {selectedGroup && (
          <div className={styles.card}>
            <div className={styles.sectionTitle}>Members - {selectedGroup.name}</div>
            {!usersReady && (
              <div className={styles.helperRow}>
                <span className={styles.empty}>Learner lookup is temporarily unavailable. Retry to manage group members.</span>
                <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>Retry</button>
              </div>
            )}
            <div className={styles.addSection}>
              <input
                className={styles.input}
                placeholder="Search learners by name, email, or ID..."
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                disabled={!usersReady}
              />
              {usersReady && nonMembers.length > 0 && (
                <div className={styles.userChecklist}>
                  {filteredNonMembers.length === 0 && (
                    <div className={styles.empty}>No learners match your search.</div>
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
                  {addingMember ? 'Adding...' : `Add ${selectedUserIds.length} selected member${selectedUserIds.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
            {usersReady && !memberLoading && nonMembers.length === 0 && (
              <div className={styles.empty}>All available learners are already assigned to this group.</div>
            )}
            {memberLoading ? (
              <div className={styles.empty}>Loading...</div>
            ) : members.length === 0 ? (
              <div className={styles.empty}>No members in this group.</div>
            ) : (
              members.map((member) => (
                <div key={member.id} className={styles.memberRow}>
                  <div>
                    <div className={styles.rowTitle}>{member.name || member.user_id}</div>
                    <div className={styles.rowSub}>{member.email}</div>
                  </div>
                  <button type="button" className={styles.deleteBtn} onClick={() => removeMember(member.id)} disabled={removingMemberId === member.id}>
                    {removingMemberId === member.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))
            )}

            <div className={styles.bulkSection}>
              <div className={`${styles.sectionTitle} ${styles.subsectionTitle}`}>Bulk test assignment</div>
              <p className={styles.empty}>Assign all {members.length} group member{members.length === 1 ? '' : 's'} to a test at once.</p>
              {(!testsReady || !schedulesReady) && (
                <div className={styles.helperRow}>
                  <span className={styles.empty}>Test and schedule data are temporarily unavailable. Retry before running bulk assignments.</span>
                  <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>Retry</button>
                </div>
              )}
              {bulkNotice && <div className={styles.bulkNotice}>{bulkNotice}</div>}
              <form onSubmit={handleBulkAssign}>
                <label className={styles.label}>Test</label>
                <select className={styles.select} value={bulkTestId} onChange={(event) => setBulkTestId(event.target.value)} required disabled={!testsReady}>
                  <option value="">Select test...</option>
                  {allTests.map((test) => (
                    <option key={test.id} value={test.id}>{test.title || test.name} ({test.status || '-'})</option>
                  ))}
                </select>
                <label className={styles.label}>Scheduled date/time</label>
                <input type="datetime-local" className={styles.input} value={bulkScheduledAt} onChange={(event) => setBulkScheduledAt(event.target.value)} required disabled={!testsReady || !schedulesReady} />
                <label className={styles.label}>Access mode</label>
                <select className={styles.select} value={bulkAccessMode} onChange={(event) => setBulkAccessMode(event.target.value)} disabled={!testsReady || !schedulesReady}>
                  <option value="OPEN">OPEN</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
                <button className={styles.btnPrimary} type="submit" disabled={bulkBusy || members.length === 0 || !bulkTestId || !bulkScheduledAt || !testsReady || !schedulesReady}>
                  {bulkBusy ? 'Assigning...' : `Assign all ${members.length} members`}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
