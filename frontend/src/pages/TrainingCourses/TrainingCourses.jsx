import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/admin.service'
import { useNavigate } from 'react-router-dom'
import styles from './TrainingCourses.module.scss'

export default function TrainingCourses() {
  const [courses, setCourses] = useState([])
  const [nodes, setNodes] = useState({})
  const [exams, setExams] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const [courseRes, examRes] = await Promise.all([adminApi.courses(), adminApi.exams()])
      setCourses(courseRes.data || [])
      setExams(examRes.data || [])
      const nodeMap = {}
      for (const c of courseRes.data || []) {
        const res = await adminApi.nodes(c.id)
        nodeMap[c.id] = res.data || []
      }
      setNodes(nodeMap)
    }
    load()
  }, [])

  const examsForNode = (nodeId) => (exams || []).filter(e => e.node_id === nodeId)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>My Training Courses</h1>
      <div className={styles.grid}>
        {courses.map(c => (
          <div key={c.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.courseTitle}>{c.title}</div>
              <div className={styles.courseSub}>{c.description}</div>
            </div>
            <div className={styles.modules}>
              {(nodes[c.id] || []).map(n => (
                <div key={n.id} className={styles.module}>
                  <div className={styles.moduleTitle}>{n.title}</div>
                  <div className={styles.exams}>
                    {examsForNode(n.id).map(ex => (
                      <button key={ex.id} className={styles.examBtn} onClick={() => navigate(`/exams/${ex.id}`)}>
                        {ex.title}
                      </button>
                    ))}
                    {examsForNode(n.id).length === 0 && <span className={styles.empty}>No exams</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
