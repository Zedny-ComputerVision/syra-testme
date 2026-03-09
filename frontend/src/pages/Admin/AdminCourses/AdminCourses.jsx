import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../../utils/pagination'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import styles from './AdminCourses.module.scss'

const COURSE_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
]

function resolveError(err) {
  return (
    err.response?.data?.detail ||
    err.response?.data?.error?.message ||
    err.response?.data?.error?.detail ||
    err.message ||
    'Action failed.'
  )
}

export default function AdminCourses() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const currentUserId = String(user?.id || '')
  const [courses, setCourses] = useState([])
  const [nodes, setNodes] = useState({})
  const [allTests, setAllTests] = useState([])
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', status: 'DRAFT' })
  const [editingCourse, setEditingCourse] = useState(null)
  const [nodeTitles, setNodeTitles] = useState({})
  const [editingNode, setEditingNode] = useState(null)
  const [editNodeTitle, setEditNodeTitle] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingCourseForm, setSavingCourseForm] = useState(false)
  const [savingCourseId, setSavingCourseId] = useState(null)
  const [busyNodeId, setBusyNodeId] = useState(null)
  const [deleteCourseConfirmId, setDeleteCourseConfirmId] = useState(null)
  const [deleteNodeConfirmId, setDeleteNodeConfirmId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    setWarning('')
    try {
      const [coursesRes, testsRes] = await Promise.allSettled([
        adminApi.courses(),
        isAdmin ? adminApi.allTests() : adminApi.exams({ skip: 0, limit: 200 }),
      ])
      if (coursesRes.status !== 'fulfilled') {
        setCourses([])
        setNodes({})
        setAllTests([])
        setError(resolveError(coursesRes.reason) || 'Failed to load courses')
        return
      }

      const courseList = coursesRes.value.data || []
      setCourses(courseList)
      if (testsRes.status === 'fulfilled') {
        const testRows = isAdmin ? (testsRes.value.data?.items || []) : readPaginatedItems(testsRes.value.data)
        setAllTests(testRows.map(normalizeAdminTest))
      } else {
        setAllTests([])
        setWarning('Linked tests could not be loaded. Courses and modules remain available, but linked test counts may be incomplete until you retry.')
      }

      const nodeEntries = await Promise.allSettled(
        courseList.map(async (course) => {
          const res = await adminApi.nodes(course.id)
          return [course.id, res.data || []]
        }),
      )

      const nodeMap = {}
      const failedCourses = []
      nodeEntries.forEach((entry, index) => {
        if (entry.status === 'fulfilled') {
          const [courseId, rows] = entry.value
          nodeMap[courseId] = rows
        } else {
          nodeMap[courseList[index].id] = []
          failedCourses.push(courseList[index].title)
        }
      })
      setNodes(nodeMap)
      if (failedCourses.length) {
        setWarning((current) => (
          current
            ? `${current} Some module lists could not be loaded: ${failedCourses.join(', ')}.`
            : `Some module lists could not be loaded: ${failedCourses.join(', ')}.`
        ))
      }
    } catch (err) {
      setCourses([])
      setNodes({})
      setAllTests([])
      setError(resolveError(err) || 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  const getTestsForCourse = (courseId) => {
    const courseNodeIds = new Set((nodes[courseId] || []).map((node) => String(node.id)))
    return allTests.filter((test) => courseNodeIds.has(String(test.node_id)))
  }

  const canManageCourse = (course) => isAdmin || String(course?.created_by_id || '') === currentUserId

  useEffect(() => { void load() }, [isAdmin])

  const createCourse = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Course title is required.')
      return
    }
    setSavingCourseForm(true)
    setError('')
    setNotice('')
    try {
      await adminApi.createCourse({
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
      })
      setForm({ title: '', description: '', status: 'DRAFT' })
      setNotice('Course created.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to create course')
    } finally {
      setSavingCourseForm(false)
    }
  }

  const saveCourseEdit = async (event) => {
    event.preventDefault()
    if (!editingCourse?.title?.trim()) {
      setError('Course title is required.')
      return
    }
    setSavingCourseId(editingCourse.id)
    setError('')
    setNotice('')
    try {
      await adminApi.updateCourse(editingCourse.id, {
        title: editingCourse.title.trim(),
        description: editingCourse.description?.trim() || null,
        status: editingCourse.status,
      })
      setEditingCourse(null)
      setNotice('Course updated.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to update course')
    } finally {
      setSavingCourseId(null)
    }
  }

  const toggleCourseStatus = async (course) => {
    setSavingCourseId(course.id)
    setError('')
    setNotice('')
    try {
      await adminApi.updateCourse(course.id, {
        title: course.title,
        description: course.description,
        status: course.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
      })
      setNotice(course.status === 'PUBLISHED' ? 'Course moved back to draft.' : 'Course published.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to update course status')
    } finally {
      setSavingCourseId(null)
    }
  }

  const deleteCourse = async (id) => {
    if (deleteCourseConfirmId !== id) {
      setDeleteCourseConfirmId(id)
      return
    }
    setDeleteCourseConfirmId(null)
    setSavingCourseId(id)
    setError('')
    setNotice('')
    try {
      await adminApi.deleteCourse(id)
      setNotice('Course deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to delete course')
    } finally {
      setSavingCourseId(null)
    }
  }

  const addNode = async (courseId) => {
    const nodeTitle = String(nodeTitles[courseId] || '').trim()
    if (!nodeTitle) {
      setError('Module title is required.')
      return
    }
    setBusyNodeId(courseId)
    setError('')
    setNotice('')
    try {
      await adminApi.createNode({ course_id: courseId, title: nodeTitle, order: (nodes[courseId]?.length || 0) + 1 })
      setNodeTitles((prev) => ({ ...prev, [courseId]: '' }))
      setNotice('Module added.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to add module')
    } finally {
      setBusyNodeId(null)
    }
  }

  const saveNodeEdit = async (node) => {
    if (!editNodeTitle.trim()) {
      setError('Module title is required.')
      return
    }
    setBusyNodeId(node.id)
    setError('')
    setNotice('')
    try {
      await adminApi.updateNode(node.id, { title: editNodeTitle.trim(), order: node.order })
      setEditingNode(null)
      setNotice('Module updated.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to update module')
    } finally {
      setBusyNodeId(null)
    }
  }

  const deleteNode = async (nodeId) => {
    if (deleteNodeConfirmId !== nodeId) {
      setDeleteNodeConfirmId(nodeId)
      return
    }
    setDeleteNodeConfirmId(null)
    setBusyNodeId(nodeId)
    setError('')
    setNotice('')
    try {
      await adminApi.deleteNode(nodeId)
      setNotice('Module deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to delete module')
    } finally {
      setBusyNodeId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Training Courses" subtitle="Manage courses and modules" />
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorMsg}>{error}</div>
          <button className={styles.btnSecondary} onClick={() => void load()}>Retry</button>
        </div>
      )}
      {warning && <div className={styles.warningMsg}>{warning}</div>}
      {notice && <div className={styles.noticeMsg}>{notice}</div>}

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={createCourse}>
          <div className={styles.sectionTitle}>New Course</div>
          <label className={styles.label} htmlFor="course-form-title">Title</label>
          <input id="course-form-title" className={styles.input} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
          <label className={styles.label} htmlFor="course-form-description">Description</label>
          <textarea id="course-form-description" className={styles.textarea} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
          <label className={styles.label} htmlFor="course-form-status">Status</label>
          <select id="course-form-status" className={styles.input} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {COURSE_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>{statusOption.label}</option>
            ))}
          </select>
          <button className={styles.btnPrimary} type="submit" disabled={savingCourseForm}>{savingCourseForm ? 'Saving...' : 'Save Course'}</button>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Courses</div>
          {loading && <div className={styles.empty}>Loading...</div>}
          {!loading && courses.length === 0 && <div className={styles.empty}>No courses yet.</div>}
          {!loading && courses.map((course) => (
            <div key={course.id} className={styles.courseCard}>
              {!canManageCourse(course) && (
                <div className={`${styles.courseSub} ${styles.courseHint}`}>
                  Read-only course. Only the course owner or an admin can edit modules and publishing settings.
                </div>
              )}
              {editingCourse?.id === course.id ? (
                <form onSubmit={saveCourseEdit} className={styles.editForm}>
                  <input className={styles.input} value={editingCourse.title} onChange={(event) => setEditingCourse((current) => ({ ...current, title: event.target.value }))} required />
                  <textarea className={styles.textarea} rows={2} value={editingCourse.description || ''} onChange={(event) => setEditingCourse((current) => ({ ...current, description: event.target.value }))} />
                  <select className={styles.input} value={editingCourse.status || 'DRAFT'} onChange={(event) => setEditingCourse((current) => ({ ...current, status: event.target.value }))}>
                    {COURSE_STATUS_OPTIONS.map((statusOption) => (
                      <option key={statusOption.value} value={statusOption.value}>{statusOption.label}</option>
                    ))}
                  </select>
                  <div className={styles.editActions}>
                    <button className={styles.btnPrimary} type="submit" disabled={savingCourseId === course.id}>{savingCourseId === course.id ? 'Saving...' : 'Save'}</button>
                    <button className={styles.btnSecondary} type="button" onClick={() => setEditingCourse(null)} disabled={savingCourseId === course.id}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={styles.courseHeader}>
                  <div>
                    <div className={styles.courseTitle}>{course.title}</div>
                    <div className={styles.courseSub}>{course.description}</div>
                    <div className={styles.courseSub}>Status: {course.status === 'PUBLISHED' ? 'Published' : 'Draft'}</div>
                  </div>
                  <div className={styles.courseActions}>
                    {canManageCourse(course) && (
                      <>
                        <button className={styles.btnSecondary} onClick={() => void toggleCourseStatus(course)} disabled={savingCourseId === course.id}>
                          {savingCourseId === course.id ? 'Saving...' : course.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => setEditingCourse({ ...course })} disabled={savingCourseId === course.id}>Edit</button>
                      </>
                    )}
                    {isAdmin && (deleteCourseConfirmId === course.id ? (
                      <>
                        <button className={styles.dangerBtn} onClick={() => void deleteCourse(course.id)} disabled={savingCourseId === course.id}>
                          {savingCourseId === course.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => setDeleteCourseConfirmId(null)} disabled={savingCourseId === course.id}>Cancel</button>
                      </>
                    ) : (
                      <button className={styles.deleteBtn} onClick={() => void deleteCourse(course.id)} disabled={savingCourseId === course.id}>Delete</button>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.modules}>
                {(nodes[course.id] || []).map((node) => (
                  <div key={node.id} className={styles.moduleRow}>
                    {editingNode === node.id ? (
                      <>
                        <input className={styles.input} value={editNodeTitle} onChange={(event) => setEditNodeTitle(event.target.value)} autoFocus />
                        <button type="button" className={styles.btnPrimary} onClick={() => void saveNodeEdit(node)} disabled={busyNodeId === node.id}>{busyNodeId === node.id ? 'Saving...' : 'Save'}</button>
                        <button type="button" className={styles.btnSecondary} onClick={() => setEditingNode(null)} disabled={busyNodeId === node.id}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className={styles.moduleChip}>{node.title}</span>
                        {canManageCourse(course) && (
                          <>
                            <button type="button" className={styles.iconBtn} onClick={() => { setEditingNode(node.id); setEditNodeTitle(node.title) }} disabled={busyNodeId === node.id}>Edit</button>
                            {deleteNodeConfirmId === node.id ? (
                              <>
                                <button type="button" className={styles.iconBtnDanger} onClick={() => void deleteNode(node.id)} disabled={busyNodeId === node.id}>{busyNodeId === node.id ? 'Deleting...' : 'Confirm'}</button>
                                <button type="button" className={styles.iconBtn} onClick={() => setDeleteNodeConfirmId(null)} disabled={busyNodeId === node.id}>Cancel</button>
                              </>
                            ) : (
                              <button type="button" className={styles.iconBtnDanger} onClick={() => void deleteNode(node.id)} disabled={busyNodeId === node.id}>Delete</button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {canManageCourse(course) && (
                  <div className={styles.addModule}>
                    <input
                      className={styles.input}
                      placeholder="New module title"
                      value={nodeTitles[course.id] || ''}
                      onChange={(event) => setNodeTitles((prev) => ({ ...prev, [course.id]: event.target.value }))}
                    />
                    <button type="button" className={styles.btnSecondary} onClick={() => void addNode(course.id)} disabled={busyNodeId === course.id}>{busyNodeId === course.id ? 'Adding...' : 'Add'}</button>
                  </div>
                )}
              </div>

              <div className={styles.courseExams}>
                <button
                  type="button"
                  className={styles.examsToggle}
                  onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
                >
                  {expandedCourse === course.id ? 'Hide' : 'Show'} linked tests ({getTestsForCourse(course.id).length})
                </button>
                {expandedCourse === course.id && (
                  <div className={styles.examsTable}>
                    {getTestsForCourse(course.id).length === 0 ? (
                      <div className={styles.empty}>No tests linked to this course yet.</div>
                    ) : (
                      <table className={styles.examListTable}>
                        <thead><tr><th>Title</th><th>Status</th><th>Type</th>{isAdmin && <th></th>}</tr></thead>
                        <tbody>
                          {getTestsForCourse(course.id).map((test) => (
                            <tr key={test.id}>
                              <td>{test.title}</td>
                              <td>{test.status || '-'}</td>
                              <td>{test.type || '-'}</td>
                              {isAdmin && (
                                <td>
                                  <button type="button" className={styles.compactBtn} onClick={() => navigate(`/admin/tests/${test.id}/manage`)}>Manage</button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
