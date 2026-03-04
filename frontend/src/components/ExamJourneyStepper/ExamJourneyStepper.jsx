import React from 'react'
import styles from './ExamJourneyStepper.module.scss'

export default function ExamJourneyStepper({ step }) {
  const steps = ['Instructions', 'System Check', 'Verify Identity', 'Rules', 'Exam', 'Result']
  return (
    <div className={styles.stepper}>
      {steps.map((s, idx) => (
        <div key={s} className={idx === step ? styles.active : styles.item}>
          <span className={styles.index}>{idx + 1}</span>
          <span>{s}</span>
        </div>
      ))}
    </div>
  )
}
