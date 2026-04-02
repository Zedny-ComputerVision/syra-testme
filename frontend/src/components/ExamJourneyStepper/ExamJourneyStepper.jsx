import React from 'react'
import useLanguage from '../../hooks/useLanguage'
import styles from './ExamJourneyStepper.module.scss'

export default function ExamJourneyStepper({ step, currentStep }) {
  const { t } = useLanguage()
  const activeStep = currentStep ?? step ?? 0
  const steps = [t('stepper_instructions'), t('stepper_system_check'), t('stepper_verify_identity'), t('stepper_rules'), t('stepper_test'), t('stepper_result')]
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
