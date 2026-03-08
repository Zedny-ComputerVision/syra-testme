import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import styles from './AdminCustomReports.module.scss'

const DATASETS = {
  attempts: {
    label: 'Attempts',
    columns: ['id', 'test_title', 'user_name', 'status', 'score', 'started_at', 'submitted_at'],
  },
  tests: {
    label: 'Tests',
    columns: ['id', 'name', 'code', 'status', 'type', 'time_limit_minutes', 'question_count', 'course_title'],
  },
  users: {
    label: 'Users',
    columns: ['id', 'user_id', 'name', 'email', 'role', 'is_active', 'created_at'],
  },
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminCustomReports() {
  const [datasetKey, setDatasetKey] = useState('attempts')
  const [selectedCols, setSelectedCols] = useState(DATASETS.attempts.columns)
  const [search, setSearch] = useState('')
  const [previewRows, setPreviewRows] = useState([])
  const [totalRows, setTotalRows] = useState(0)
  const [availableColumns, setAvailableColumns] = useState(DATASETS.attempts.columns)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)

  const dataset = useMemo(() => DATASETS[datasetKey], [datasetKey])
  const noColumnsSelected = selectedCols.length === 0
  const hasCustomFilters = Boolean(search.trim()) || selectedCols.length !== DATASETS[datasetKey].columns.length

  useEffect(() => {
    setSelectedCols(DATASETS[datasetKey].columns)
    setAvailableColumns(DATASETS[datasetKey].columns)
    setSearch('')
    setPreviewError('')
    setActionError('')
  }, [datasetKey])

  useEffect(() => {
    let cancelled = false

    async function loadPreview() {
      if (!selectedCols.length) {
        setPreviewRows([])
        setTotalRows(0)
        setPreviewError('')
        return
      }
      setLoading(true)
      setPreviewError('')
      try {
        const { data } = await adminApi.previewCustomReport({
          dataset: datasetKey,
          columns: selectedCols,
          search: search.trim() || null,
        })
        if (cancelled) return
        setPreviewRows(data?.rows || [])
        setTotalRows(data?.total || 0)
        setAvailableColumns(data?.available_columns || DATASETS[datasetKey].columns)
      } catch (err) {
        if (cancelled) return
        setPreviewError(err.response?.data?.detail || 'Failed to load dataset preview.')
        setPreviewRows([])
        setTotalRows(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [datasetKey, selectedCols, search, reloadNonce])

  const toggleCol = (col) => {
    setSelectedCols((prev) => (
      prev.includes(col) ? prev.filter((entry) => entry !== col) : [...prev, col]
    ))
  }

  const resetFilters = () => {
    setSelectedCols(DATASETS[datasetKey].columns)
    setSearch('')
    setPreviewError('')
    setActionError('')
    setNotice('')
  }

  const retryPreview = () => {
    setPreviewError('')
    setReloadNonce((current) => current + 1)
  }

  const exportCSV = async () => {
    setExporting(true)
    setActionError('')
    setNotice('')
    try {
      const { data } = await adminApi.exportCustomReport({
        dataset: datasetKey,
        columns: selectedCols,
        search: search.trim() || null,
      })
      downloadBlob(data, `${datasetKey}_report.csv`)
      setNotice(`Exported ${totalRows} row${totalRows === 1 ? '' : 's'} from ${dataset.label.toLowerCase()}.`)
    } catch (err) {
      setActionError(await readBlobErrorMessage(err, 'Failed to export report.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Report Builder" subtitle="Export server-backed CSV reports with filters and selected columns" />

      {actionError && <div className={styles.error}>{actionError}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.toolbar}>
        <div className={styles.controls}>
          <label className={styles.label}>Dataset</label>
          <select className={styles.select} value={datasetKey} onChange={(e) => setDatasetKey(e.target.value)}>
            {Object.entries(DATASETS).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.searchGroup}>
          <label className={styles.label}>Search</label>
          <div className={styles.searchRow}>
            <input
              className={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${dataset.label.toLowerCase()}...`}
            />
            {hasCustomFilters && (
              <button type="button" className={styles.secondaryBtn} onClick={resetFilters} disabled={loading || exporting}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summaryChip}>Dataset: {dataset.label}</div>
        <div className={styles.summaryChip}>Selected columns: {selectedCols.length} / {availableColumns.length}</div>
        <div className={styles.summaryChip}>Matching rows: {loading ? 'Loading...' : totalRows}</div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>Columns</div>
            <div className={styles.muted}>The export is generated on the backend using the selected dataset, search, and columns.</div>
          </div>
          <div className={styles.actionGroup}>
            {previewError && (
              <button type="button" className={styles.secondaryBtn} onClick={retryPreview} disabled={loading || exporting}>
                Retry preview
              </button>
            )}
            <button type="button" className={styles.btnPrimary} onClick={exportCSV} disabled={loading || exporting || noColumnsSelected || Boolean(previewError)}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
        <div className={styles.columns}>
          {availableColumns.map((column) => (
            <label key={column} className={styles.colChip}>
              <input type="checkbox" checked={selectedCols.includes(column)} onChange={() => toggleCol(column)} />
              <span>{column}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>Preview</div>
            <div className={styles.muted}>
              {loading ? 'Loading preview...' : `Showing ${previewRows.length} of ${totalRows} matching row${totalRows === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>

        {noColumnsSelected ? (
          <div className={styles.empty}>Select at least one column to preview or export this report.</div>
        ) : previewError ? (
          <div className={styles.retryRow}>
            <span className={styles.errorInline}>{previewError}</span>
            <button type="button" className={styles.secondaryBtn} onClick={retryPreview} disabled={loading}>
              Retry preview
            </button>
          </div>
        ) : !loading && previewRows.length === 0 ? (
          <div className={styles.empty}>{search.trim() ? 'No rows matched the current filters.' : 'No rows are available for this dataset yet.'}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>{selectedCols.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${datasetKey}-${index}`}>
                    {selectedCols.map((column) => (
                      <td key={column}>{row[column] != null && row[column] !== '' ? String(row[column]) : '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
