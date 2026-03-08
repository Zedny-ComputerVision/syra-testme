import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
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

  const load = async () => {
    setLoading(true)
    try {
      const [groupsRes, usersRes, testsRes, schedulesRes] = await Promise.allSettled([
        adminApi.userGroups(),
        adminApi.users(),
        adminApi.allTests(),
        adminApi.schedules(),
      ])
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
        setUsers((usersRes.value.data || []).filter((user) => user.role === 'LEARNER'))
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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const loadMembers = async (group) => {
    setSelectedGroup(group)
    setMemberLoading(true)
    setBulkNotice('')
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
                <button type="button" className={styles.rowBtn} onClick={() => loadMembers(group)}>
                  <div className={styles.rowTitle}>{group.name}</div>
                  <div className={styles.rowSub}>{group.description || 'No description'}</div>
                </button>
                {deleteConfirmId === group.id ? (
                  <>
                    <button type="button" className={`${styles.deleteBtn} ${styles.deleteConfirmBtn}`} onClick={() => remove(group.id)} disabled={deletingGroupId === group.id}>
                      {deletingGroupId === group.id ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button type="button" className={styles.deleteBtn} onClick={() => setDeleteConfirmId(null)} disabled={deletingGroupId === group.id}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className={styles.deleteBtn} onClick={() => remove(group.id)} disabled={deletingGroupId === group.id}>Delete</button>
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
            <div className={styles.addRow}>
              <select className={styles.select} value={addUserId} onChange={(event) => setAddUserId(event.target.value)} disabled={!usersReady}>
                <option value="">Add learner...</option>
                {nonMembers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name || user.user_id} ({user.email})</option>
                ))}
              </select>
              <button type="button" className={styles.btnPrimary} onClick={addMember} disabled={!addUserId || !usersReady || addingMember}>
                {addingMember ? 'Adding...' : 'Add'}
              </button>
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
