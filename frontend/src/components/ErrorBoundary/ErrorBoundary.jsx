import React from 'react'
import styles from './ErrorBoundary.module.scss'

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
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.wrapper} role="alert">
          <div className={styles.card}>
            <h2 className={styles.title}>Something went wrong.</h2>
            <p className={styles.message}>Reload the page to try again. If the problem continues, return to the previous page and retry the action.</p>
            <button type="button" className={styles.button} onClick={this.handleReload}>
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
