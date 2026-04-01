import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import useLanguage from '../../../hooks/useLanguage'
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
  const { t } = useLanguage()
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
        setPreviewError(err.response?.data?.detail || t('admin_custom_reports_failed_preview'))
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
      setNotice(`${t('admin_custom_reports_exported')} ${totalRows} ${totalRows === 1 ? t('admin_custom_reports_row') : t('admin_custom_reports_rows')} ${t('admin_custom_reports_from')} ${dataset.label.toLowerCase()}.`)
    } catch (err) {
      setActionError(await readBlobErrorMessage(err, t('admin_custom_reports_failed_export')))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_custom_reports_title')} subtitle={t('admin_custom_reports_subtitle')} />

      {actionError && <div className={styles.error}>{actionError}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.toolbar}>
        <div className={styles.controls}>
          <label className={styles.label} htmlFor="custom-report-dataset">{t('admin_custom_reports_dataset')}</label>
          <select id="custom-report-dataset" className={styles.select} value={datasetKey} onChange={(e) => setDatasetKey(e.target.value)}>
            {Object.entries(DATASETS).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.searchGroup}>
          <label className={styles.label} htmlFor="custom-report-search">{t('admin_custom_reports_search')}</label>
          <div className={styles.searchRow}>
            <input
              id="custom-report-search"
              className={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${t('admin_custom_reports_filter')} ${dataset.label.toLowerCase()}...`}
            />
            {hasCustomFilters && (
              <button type="button" className={styles.secondaryBtn} onClick={resetFilters} disabled={loading || exporting}>
                {t('admin_custom_reports_clear_filters')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summaryChip}>{t('admin_custom_reports_dataset')}: {dataset.label}</div>
        <div className={styles.summaryChip}>{t('admin_custom_reports_selected_columns')}: {selectedCols.length} / {availableColumns.length}</div>
        <div className={styles.summaryChip}>{t('admin_custom_reports_matching_rows')}: {loading ? t('admin_custom_reports_loading') : totalRows}</div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>{t('admin_custom_reports_columns')}</div>
            <div className={styles.muted}>{t('admin_custom_reports_export_description')}</div>
          </div>
          <div className={styles.actionGroup}>
            {previewError && (
              <button type="button" className={styles.secondaryBtn} onClick={retryPreview} disabled={loading || exporting}>
                {t('admin_custom_reports_retry_preview')}
              </button>
            )}
            <button type="button" className={styles.btnPrimary} onClick={exportCSV} disabled={loading || exporting || noColumnsSelected || Boolean(previewError)}>
              {exporting ? t('admin_custom_reports_exporting') : t('admin_custom_reports_export_csv')}
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
            <div className={styles.panelTitle}>{t('admin_custom_reports_preview')}</div>
            <div className={styles.muted}>
              {loading ? t('admin_custom_reports_loading_preview') : `${t('admin_custom_reports_showing')} ${previewRows.length} ${t('admin_custom_reports_of')} ${totalRows} ${totalRows === 1 ? t('admin_custom_reports_matching_row') : t('admin_custom_reports_matching_rows_plural')}`}
            </div>
          </div>
        </div>

        {noColumnsSelected ? (
          <div className={styles.empty}>{t('admin_custom_reports_select_column')}</div>
        ) : previewError ? (
          <div className={styles.retryRow}>
            <span className={styles.errorInline}>{previewError}</span>
            <button type="button" className={styles.secondaryBtn} onClick={retryPreview} disabled={loading}>
              {t('admin_custom_reports_retry_preview')}
            </button>
          </div>
        ) : !loading && previewRows.length === 0 ? (
          <div className={styles.empty}>{search.trim() ? t('admin_custom_reports_no_rows_match') : t('admin_custom_reports_no_rows_available')}</div>
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
