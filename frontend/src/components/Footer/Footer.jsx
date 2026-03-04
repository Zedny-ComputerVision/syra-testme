import React from 'react';
import styles from './Footer.module.scss';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.copyright}>
          SYRA LMS &copy; {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
