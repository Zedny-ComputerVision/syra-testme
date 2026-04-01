import React from 'react'
import styles from './ErrorBoundary.module.scss'
import { isDynamicImportFailure, recoverFromChunkFailure } from '../../utils/chunkRecovery'
import useLanguage from '../../hooks/useLanguage'

function ErrorFallback({ onReload }) {
  const { t } = useLanguage()
  return (
    <div className={styles.wrapper} role="alert">
      <div className={styles.card}>
        <h2 className={styles.title}>{t('error_boundary_title')}</h2>
        <p className={styles.message}>{t('error_boundary_message')}</p>
        <button type="button" className={styles.button} onClick={onReload}>
          {t('error_boundary_reload')}
        </button>
      </div>
    </div>
  )
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info)
    if (isDynamicImportFailure(error)) {
      recoverFromChunkFailure()
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.handleReload} />
    }

    return this.props.children
  }
}
