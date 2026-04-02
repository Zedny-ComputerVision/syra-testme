import React from 'react'
import useLanguage from '../../../hooks/useLanguage'
import styles from './Loader.module.scss'

/**
 * Animated CSS spinner with optional label.
 *
 * @param {{ size?: number, label?: string, fullPage?: boolean }} props
 */
export default function Loader({ size = 40, label, fullPage = false }) {
  const { t } = useLanguage()
  const resolvedLabel = label === undefined ? t('loader_loading') + '...' : label
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
              <span className={styles.brandKicker}>{t('loader_brand_tagline')}</span>
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
        {resolvedLabel && <span className={styles.label}>{resolvedLabel}</span>}
        {fullPage && <span className={styles.caption}>{t('loader_preparing')}</span>}
      </div>
      <span className={styles.srOnly}>{t('loader_loading')}</span>
    </div>
  )
}
