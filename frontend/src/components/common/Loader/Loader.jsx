import React from 'react'
import styles from './Loader.module.scss'

/**
 * Animated CSS spinner with optional label.
 *
 * @param {{ size?: number, label?: string, fullPage?: boolean }} props
 */
export default function Loader({ size = 40, label = 'Loading...', fullPage = false }) {
  const spinnerStyle = {
    width: `${size}px`,
    height: `${size}px`,
  }

  const wrapperClass = fullPage
    ? `${styles.wrapper} ${styles.fullPage}`
    : styles.wrapper

  const panelClass = fullPage
    ? `${styles.panel} ${styles.panelElevated}`
    : `${styles.panel} ${styles.panelInline}`

  return (
    <div className={wrapperClass} role="status" aria-live="polite">
      <div className={panelClass}>
        {fullPage && (
          <div className={styles.brand}>
            <span className={styles.brandMark}>S</span>
            <span className={styles.brandTextWrap}>
              <span className={styles.brandKicker}>Secure assessment platform</span>
              <span className={styles.brandText}>syra</span>
            </span>
          </div>
        )}
        <div className={styles.spinnerCluster}>
          <div className={styles.spinnerGlow} aria-hidden="true" />
          <div className={styles.spinner} style={spinnerStyle}>
            <div className={styles.ring} />
          </div>
          <div className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        {label && <span className={styles.label}>{label}</span>}
        {fullPage && <span className={styles.caption}>Preparing your workspace and loading the latest data.</span>}
      </div>
      <span className={styles.srOnly}>Loading</span>
    </div>
  )
}
