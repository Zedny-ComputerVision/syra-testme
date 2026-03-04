import React from 'react';
import styles from './Loader.module.scss';

/**
 * Animated CSS spinner with optional label.
 *
 * @param {{ size?: number, label?: string, fullPage?: boolean }} props
 */
export default function Loader({ size = 40, label = 'Loading...', fullPage = false }) {
  const spinnerStyle = {
    width: `${size}px`,
    height: `${size}px`,
  };

  const wrapperClass = fullPage
    ? `${styles.wrapper} ${styles.fullPage}`
    : styles.wrapper;

  return (
    <div className={wrapperClass} role="status" aria-live="polite">
      <div className={styles.spinner} style={spinnerStyle}>
        <div className={styles.ring} />
      </div>
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.srOnly}>Loading</span>
    </div>
  );
}
