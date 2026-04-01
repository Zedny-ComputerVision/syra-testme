import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminCourses.module.scss'

const COURSE_STATUS_KEYS = [
  { value: 'DRAFT', labelKey: 'draft' },
  { value: 'PUBLISHED', labelKey: 'published' },
]

function resolveError(err) {
  return (
    err.response?.data?.detail ||
    err.response?.data?.error?.message ||
    err.response?.data?.error?.detail ||
    err.message ||
    ''
  )
}

export default function AdminCourses() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLanguage()
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
      const [coursesRes, testsRes, nodesRes] = await Promise.allSettled([
        adminApi.courses(),
        adminApi.allTests({ page_size: 200 }),
        adminApi.nodes(),
      ])
      if (coursesRes.status !== 'fulfilled') {
        setCourses([])
        setNodes({})
        setAllTests([])
        setError(resolveError(coursesRes.reason) || t('admin_courses_load_error'))
        return
      }

      const courseList = coursesRes.value.data || []
      setCourses(courseList)
      if (testsRes.status === 'fulfilled') {
        const testRows = testsRes.value.data?.items || []
        setAllTests(testRows.map(normalizeAdminTest))
      } else {
        setAllTests([])
        setWarning(t('admin_courses_tests_warning'))
      }

      const nodeMap = Object.fromEntries(courseList.map((course) => [course.id, []]))
      if (nodesRes.status === 'fulfilled') {
        for (const node of nodesRes.value.data || []) {
          const courseId = String(node.course_id || '')
          if (!courseId) continue
          if (!nodeMap[courseId]) nodeMap[courseId] = []
          nodeMap[courseId].push(node)
        }
      } else {
        setWarning((current) => (
          current
            ? `${current} ${t('admin_courses_modules_warning')}`
            : t('admin_courses_modules_warning')
        ))
      }

      Object.values(nodeMap).forEach((rows) => {
        rows.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      })
      setNodes(nodeMap)
    } catch (err) {
      setCourses([])
      setNodes({})
      setAllTests([])
      setError(resolveError(err) || t('admin_courses_load_error'))
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
      setError(t('admin_courses_title_required'))
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
      setNotice(t('admin_courses_created'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_create_error'))
    } finally {
      setSavingCourseForm(false)
    }
  }

  const saveCourseEdit = async (event) => {
    event.preventDefault()
    if (!editingCourse?.title?.trim()) {
      setError(t('admin_courses_title_required'))
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
      setNotice(t('admin_courses_updated'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_update_error'))
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
      setNotice(course.status === 'PUBLISHED' ? t('admin_courses_moved_draft') : t('admin_courses_published'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_status_error'))
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
      setNotice(t('admin_courses_deleted'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_delete_error'))
    } finally {
      setSavingCourseId(null)
    }
  }

  const addNode = async (courseId) => {
    const nodeTitle = String(nodeTitles[courseId] || '').trim()
    if (!nodeTitle) {
      setError(t('admin_courses_module_title_required'))
      return
    }
    setBusyNodeId(courseId)
    setError('')
    setNotice('')
    try {
      await adminApi.createNode({ course_id: courseId, title: nodeTitle, order: (nodes[courseId]?.length || 0) + 1 })
      setNodeTitles((prev) => ({ ...prev, [courseId]: '' }))
      setNotice(t('admin_courses_module_added'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_add_module_error'))
    } finally {
      setBusyNodeId(null)
    }
  }

  const saveNodeEdit = async (node) => {
    if (!editNodeTitle.trim()) {
      setError(t('admin_courses_module_title_required'))
      return
    }
    setBusyNodeId(node.id)
    setError('')
    setNotice('')
    try {
      await adminApi.updateNode(node.id, { title: editNodeTitle.trim(), order: node.order })
      setEditingNode(null)
      setNotice(t('admin_courses_module_updated'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_update_module_error'))
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
      setNotice(t('admin_courses_module_deleted'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_courses_delete_module_error'))
    } finally {
      setBusyNodeId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_courses_title')} subtitle={t('admin_courses_subtitle')} />
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorMsg}>{error}</div>
          <button className={styles.btnSecondary} onClick={() => void load()}>{t('retry')}</button>
        </div>
      )}
      {warning && <div className={styles.warningMsg}>{warning}</div>}
      {notice && <div className={styles.noticeMsg}>{notice}</div>}

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={createCourse}>
          <div className={styles.sectionTitle}>{t('admin_courses_new_course')}</div>
          <label className={styles.label} htmlFor="course-form-title">{t('title')}</label>
          <input id="course-form-title" className={styles.input} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
          <label className={styles.label} htmlFor="course-form-description">{t('description')}</label>
          <textarea id="course-form-description" className={styles.textarea} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
          <label className={styles.label} htmlFor="course-form-status">{t('status')}</label>
          <select id="course-form-status" className={styles.input} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {COURSE_STATUS_KEYS.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>{t(statusOption.labelKey)}</option>
            ))}
          </select>
          <button className={styles.btnPrimary} type="submit" disabled={savingCourseForm}>{savingCourseForm ? t('saving') : t('admin_courses_save_course')}</button>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>{t('admin_courses_courses')}</div>
          {loading && <div className={styles.empty}>{t('loading')}</div>}
          {!loading && courses.length === 0 && <div className={styles.empty}>{t('admin_courses_no_courses')}</div>}
          {!loading && courses.map((course) => (
            <div key={course.id} className={styles.courseCard}>
              {!canManageCourse(course) && (
                <div className={`${styles.courseSub} ${styles.courseHint}`}>
                  {t('admin_courses_read_only')}
                </div>
              )}
              {editingCourse?.id === course.id ? (
                <form onSubmit={saveCourseEdit} className={styles.editForm}>
                  <input className={styles.input} value={editingCourse.title} onChange={(event) => setEditingCourse((current) => ({ ...current, title: event.target.value }))} required />
                  <textarea className={styles.textarea} rows={2} value={editingCourse.description || ''} onChange={(event) => setEditingCourse((current) => ({ ...current, description: event.target.value }))} />
                  <select className={styles.input} value={editingCourse.status || 'DRAFT'} onChange={(event) => setEditingCourse((current) => ({ ...current, status: event.target.value }))}>
                    {COURSE_STATUS_KEYS.map((statusOption) => (
                      <option key={statusOption.value} value={statusOption.value}>{t(statusOption.labelKey)}</option>
                    ))}
                  </select>
                  <div className={styles.editActions}>
                    <button className={styles.btnPrimary} type="submit" disabled={savingCourseId === course.id}>{savingCourseId === course.id ? t('saving') : t('save')}</button>
                    <button className={styles.btnSecondary} type="button" onClick={() => setEditingCourse(null)} disabled={savingCourseId === course.id}>{t('cancel')}</button>
                  </div>
                </form>
              ) : (
                <div className={styles.courseHeader}>
                  <div>
                    <div className={styles.courseTitle}>{course.title}</div>
                    <div className={styles.courseSub}>{course.description}</div>
                    <div className={styles.courseSub}>{t('status')}: {course.status === 'PUBLISHED' ? t('published') : t('draft')}</div>
                  </div>
                  <div className={styles.courseActions}>
                    {canManageCourse(course) && (
                      <>
                        <button className={styles.btnSecondary} onClick={() => void toggleCourseStatus(course)} disabled={savingCourseId === course.id} aria-label={`${course.status === 'PUBLISHED' ? t('admin_courses_unpublish') : t('admin_courses_publish')} ${t('admin_courses_course')} ${course.title || t('admin_courses_this_course')}`} title={`${course.status === 'PUBLISHED' ? t('admin_courses_unpublish') : t('admin_courses_publish')} ${t('admin_courses_course')} ${course.title || t('admin_courses_this_course')}`}>
                          {savingCourseId === course.id ? t('saving') : course.status === 'PUBLISHED' ? t('admin_courses_unpublish') : t('admin_courses_publish')}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => setEditingCourse({ ...course })} disabled={savingCourseId === course.id} aria-label={`${t('edit')} ${course.title || t('admin_courses_this_course')}`} title={`${t('edit')} ${course.title || t('admin_courses_this_course')}`}>{t('edit')}</button>
                      </>
                    )}
                    {isAdmin && (deleteCourseConfirmId === course.id ? (
                      <>
                        <button className={styles.dangerBtn} onClick={() => void deleteCourse(course.id)} disabled={savingCourseId === course.id} aria-label={`${t('confirm_delete')} ${course.title || t('admin_courses_this_course')}`}>
                          {savingCourseId === course.id ? t('admin_courses_deleting') : t('confirm')}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => setDeleteCourseConfirmId(null)} disabled={savingCourseId === course.id} aria-label={`${t('cancel_delete')} ${course.title || t('admin_courses_this_course')}`}>{t('cancel')}</button>
                      </>
                    ) : (
                      <button className={styles.deleteBtn} onClick={() => void deleteCourse(course.id)} disabled={savingCourseId === course.id} aria-label={`${t('delete')} ${course.title || t('admin_courses_this_course')}`} title={`${t('delete')} ${course.title || t('admin_courses_this_course')}`}>{t('delete')}</button>
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
                        <button type="button" className={styles.btnPrimary} onClick={() => void saveNodeEdit(node)} disabled={busyNodeId === node.id} aria-label={`${t('save')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`}>{busyNodeId === node.id ? t('saving') : t('save')}</button>
                        <button type="button" className={styles.btnSecondary} onClick={() => setEditingNode(null)} disabled={busyNodeId === node.id} aria-label={`${t('cancel')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`}>{t('cancel')}</button>
                      </>
                    ) : (
                      <>
                        <span className={styles.moduleChip}>{node.title}</span>
                        {canManageCourse(course) && (
                          <>
                            <button type="button" className={styles.iconBtn} onClick={() => { setEditingNode(node.id); setEditNodeTitle(node.title) }} disabled={busyNodeId === node.id} aria-label={`${t('edit')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`} title={`${t('edit')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`}>{t('edit')}</button>
                            {deleteNodeConfirmId === node.id ? (
                              <>
                                <button type="button" className={styles.iconBtnDanger} onClick={() => void deleteNode(node.id)} disabled={busyNodeId === node.id} aria-label={`${t('confirm_delete')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`}>{busyNodeId === node.id ? t('admin_courses_deleting') : t('confirm')}</button>
                                <button type="button" className={styles.iconBtn} onClick={() => setDeleteNodeConfirmId(null)} disabled={busyNodeId === node.id} aria-label={`${t('cancel_delete')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`}>{t('cancel')}</button>
                              </>
                            ) : (
                              <button type="button" className={styles.iconBtnDanger} onClick={() => void deleteNode(node.id)} disabled={busyNodeId === node.id} aria-label={`${t('delete')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`} title={`${t('delete')} ${node.title || t('admin_courses_this_module')} ${course.title || t('admin_courses_this_course')}`}>{t('delete')}</button>
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
                      placeholder={t('admin_courses_new_module_title')}
                      value={nodeTitles[course.id] || ''}
                      onChange={(event) => setNodeTitles((prev) => ({ ...prev, [course.id]: event.target.value }))}
                    />
                    <button type="button" className={styles.btnSecondary} onClick={() => void addNode(course.id)} disabled={busyNodeId === course.id}>{busyNodeId === course.id ? t('admin_courses_adding') : t('add')}</button>
                  </div>
                )}
              </div>

              <div className={styles.courseExams}>
                <button
                  type="button"
                  className={styles.examsToggle}
                  onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
                >
                  {expandedCourse === course.id ? t('admin_courses_hide') : t('admin_courses_show')} {t('admin_courses_linked_tests')} ({getTestsForCourse(course.id).length})
                </button>
                {expandedCourse === course.id && (
                  <div className={styles.examsTable}>
                    {getTestsForCourse(course.id).length === 0 ? (
                      <div className={styles.empty}>{t('admin_courses_no_linked_tests')}</div>
                    ) : (
                      <table className={styles.examListTable}>
                        <thead><tr><th>{t('title')}</th><th>{t('status')}</th><th>{t('type')}</th>{isAdmin && <th></th>}</tr></thead>
                        <tbody>
                          {getTestsForCourse(course.id).map((test) => (
                            <tr key={test.id}>
                              <td>{test.title}</td>
                              <td>{test.status || '-'}</td>
                              <td>{test.type || '-'}</td>
                              {isAdmin && (
                                <td>
                                  <button type="button" className={styles.compactBtn} onClick={() => navigate(`/admin/tests/${test.id}/manage`)} aria-label={`${t('admin_courses_manage_test')} ${test.title || t('admin_courses_test')} ${t('admin_courses_from_course')} ${course.title || t('admin_courses_this_course')}`} title={`${t('admin_courses_manage_test')} ${test.title || t('admin_courses_test')} ${t('admin_courses_from_course')} ${course.title || t('admin_courses_this_course')}`}>{t('admin_courses_manage_test')}</button>
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
