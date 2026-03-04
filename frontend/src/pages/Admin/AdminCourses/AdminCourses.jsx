import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminCourses.module.scss'

export default function AdminCourses() {
  const [courses, setCourses] = useState([])
  const [nodes, setNodes] = useState({})
  const [form, setForm] = useState({ title: '', description: '' })
  const [nodeTitle, setNodeTitle] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    const { data } = await adminApi.courses()
    setCourses(data || [])
    const nodeMap = {}
    await Promise.all(
      (data || []).map(async (c) => {
        const res = await adminApi.nodes(c.id)
        nodeMap[c.id] = res.data || []
      })
    )
    setNodes(nodeMap)
  }

  useEffect(() => { load() }, [])

  const createCourse = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminApi.createCourse(form)
      setForm({ title: '', description: '' })
      load()
    } finally {
      setLoading(false)
    }
  }

  const addNode = async (courseId) => {
    if (!nodeTitle.trim()) return
    await adminApi.createNode({ course_id: courseId, title: nodeTitle, order: (nodes[courseId]?.length || 0) + 1 })
    setNodeTitle('')
    load()
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Training Courses" subtitle="Manage courses and modules" />

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={createCourse}>
          <div className={styles.sectionTitle}>New Course</div>
          <label className={styles.label}>Title</label>
          <input className={styles.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          <button className={styles.btnPrimary} type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Course'}</button>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Courses</div>
          {(courses || []).map(c => (
            <div key={c.id} className={styles.courseCard}>
              <div className={styles.courseHeader}>
                <div>
                  <div className={styles.courseTitle}>{c.title}</div>
                  <div className={styles.courseSub}>{c.description}</div>
                </div>
              </div>
              <div className={styles.modules}>
                {(nodes[c.id] || []).map(n => (
                  <div key={n.id} className={styles.moduleChip}>{n.title}</div>
                ))}
                <div className={styles.addModule}>
                  <input
                    className={styles.input}
                    placeholder="New module title"
                    value={nodeTitle}
                    onChange={e => setNodeTitle(e.target.value)}
                  />
                  <button type="button" className={styles.btnSecondary} onClick={() => addNode(c.id)}>Add</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
