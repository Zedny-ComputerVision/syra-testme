import React from 'react'
import styles from './ExamJourneyStepper.module.scss'

export default function ExamJourneyStepper({ step, currentStep }) {
  const activeStep = currentStep ?? step ?? 0
  const steps = ['Instructions', 'System Check', 'Verify Identity', 'Rules', 'Test', 'Result']
  return (
    <div className={styles.stepper}>
      {steps.map((s, idx) => (
        <div key={s} className={idx === activeStep ? styles.active : styles.item}>
          <span className={styles.index}>{idx + 1}</span>
          <span>{s}</span>
        </div>
      ))}
    </div>
  )
}
