import React from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminRolesPermissions.module.scss'

const PERMISSIONS = [
  { feature: 'View Dashboard', admin: true, instructor: true, learner: true },
  { feature: 'Manage Users', admin: true, instructor: false, learner: false },
  { feature: 'Create Exams', admin: true, instructor: true, learner: false },
  { feature: 'Edit Exams', admin: true, instructor: true, learner: false },
  { feature: 'Delete Exams', admin: true, instructor: true, learner: false },
  { feature: 'Manage Categories', admin: true, instructor: true, learner: false },
  { feature: 'Manage Grading Scales', admin: true, instructor: true, learner: false },
  { feature: 'Manage Question Pools', admin: true, instructor: true, learner: false },
  { feature: 'Assign Schedules', admin: true, instructor: true, learner: false },
  { feature: 'View Attempt Analysis', admin: true, instructor: true, learner: false },
  { feature: 'Generate Reports', admin: true, instructor: true, learner: false },
  { feature: 'Take Exams', admin: false, instructor: false, learner: true },
  { feature: 'View Own Attempts', admin: true, instructor: true, learner: true },
  { feature: 'View Own Schedule', admin: true, instructor: true, learner: true },
  { feature: 'View Audit Log', admin: true, instructor: false, learner: false },
  { feature: 'Manage Roles', admin: true, instructor: false, learner: false },
  { feature: 'System Settings', admin: true, instructor: false, learner: false },
]

export default function AdminRolesPermissions() {
  return (
    <div className={styles.page}>
      <AdminPageHeader title="Roles & Permissions" subtitle="Role-based access control overview" />

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
            {PERMISSIONS.map(p => (
              <tr key={p.feature}>
                <td>{p.feature}</td>
                <td>{p.admin ? <span className={styles.checkmark}>&#10003;</span> : <span className={styles.dash}>-</span>}</td>
                <td>{p.instructor ? <span className={styles.checkmark}>&#10003;</span> : <span className={styles.dash}>-</span>}</td>
                <td>{p.learner ? <span className={styles.checkmark}>&#10003;</span> : <span className={styles.dash}>-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendTitle}>Role Hierarchy</div>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleAdmin}`}>Admin</span>
            Full system access including user management and settings
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleInstructor}`}>Instructor</span>
            Manage exams, view analytics, assign schedules
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.roleBadge} ${styles.roleLearner}`}>Learner</span>
            Take exams, view own results and schedule
          </div>
        </div>
      </div>
    </div>
  )
}
