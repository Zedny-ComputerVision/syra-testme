import React from 'react'
import styles from './ExamJourneyStepper.module.scss'

export default function ExamJourneyStepper({ step, currentStep }) {
  const activeStep = currentStep ?? step ?? 0
  const steps = ['Instructions', 'System Check', 'Verify Identity', 'Rules', 'Test', 'Result']
  return (
    <div className={styles.stepper}>
      {steps.map((s, idx) => (
        <React.Fragment key={s}>
          <div
            className={
              idx === activeStep
                ? styles.active
                : idx < activeStep
                ? styles.done
                : styles.item
            }
          >
            <span className={styles.index}>
              {idx < activeStep ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                idx + 1
              )}
            </span>
            <span>{s}</span>
          </div>
          {idx < steps.length - 1 && (
            <span className={`${styles.connector} ${idx < activeStep ? styles.connectorFilled : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
