import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import { normalizeProctoringConfig } from '../../../utils/proctoringRequirements'
import styles from './AdminManageTestPage.module.scss'

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'sections', label: 'Test sections' },
  { id: 'sessions', label: 'Testing sessions' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'proctoring', label: 'Proctoring' },
  { id: 'administration', label: 'Test administration' },
  { id: 'reports', label: 'Reports' },
]

const SETTINGS_MENU = [
  'Basic information',
  'Test instructions dialog settings',
  'Duration and layout',
  'Pause, retake and reschedule settings',
  'Security settings',
  'Result validity settings',
  'Grading configuration',
  'Certificates',
  'Personal report settings',
  'Score report settings',
  'Coupons',
  'Language settings',
  'Attachments',
  'External attributes',
  'Test categories',
]

const QUESTION_TYPES = ['MCQ', 'MULTI', 'TRUEFALSE', 'ORDERING', 'FILLINBLANK', 'MATCHING', 'TEXT']

const PROCTOR_BOOLEAN_KEYS = [
  'fullscreen_enforce',
  'tab_switch_detect',
  'lighting_required',
  'copy_paste_block',
  'face_detection',
  'multi_face',
  'eye_tracking',
  'head_pose_detection',
  'audio_detection',
  'object_detection',
  'screen_capture',
]

const PROCTOR_LABELS = {
  fullscreen_enforce: 'Fullscreen Enforce',
  tab_switch_detect: 'Tab Switch Detection',
  lighting_required: 'Lighting Quality Check',
  copy_paste_block: 'Block Copy & Paste',
  face_detection: 'Face Detection',
  multi_face: 'Multiple Face Detection',
  eye_tracking: 'Eye Tracking',
  head_pose_detection: 'Head Pose Detection',
  audio_detection: 'Audio Detection',
  object_detection: 'Object Detection',
  screen_capture: 'Screen Capture',
}

const TAB_ALIASES = {
  'test-sections': 'sections',
  'testing-sessions': 'sessions',
  'test-administration': 'administration',
}

function normalizeTabParam(search) {
  const raw = new URLSearchParams(search).get('tab')
  const normalized = TAB_ALIASES[raw] || raw
  return TABS.some((item) => item.id === normalized) ? normalized : 'settings'
}

function isManageRoutePath(pathname) {
  return /^\/admin\/tests\/[^/]+\/manage$/.test(pathname || '')
}

const MENU_TO_SECTION = {
  'Basic information': 'basic',
  'Test instructions dialog settings': 'instructions',
  'Duration and layout': 'duration',
  'Pause, retake and reschedule settings': 'retake',
  'Security settings': 'security',
  'Result validity settings': 'grading',
  'Grading configuration': 'grading',
  Certificates: 'certificate',
  'Personal report settings': 'reports',
  'Score report settings': 'reports',
  Coupons: 'coupons',
  'Language settings': 'language',
  Attachments: 'attachments',
  'External attributes': 'externalattrs',
  'Test categories': 'categories',
}

const EMPTY_QUESTION_FORM = {
  text: '',
  question_type: 'MCQ',
  options_text: '',
  correct_answer: '',
  points: '1',
  order: '0',
}

const EMPTY_SESSION_FORM = {
  user_id: '',
  scheduled_at: '',
  access_mode: 'OPEN',
  notes: '',
}

function formatAttemptStatus(row) {
  if (row.paused) return 'PAUSED'
  if (row.status === 'NOT_STARTED') return 'NOT STARTED'
  return row.status || '-'
}

function formatScore(score) {
  if (score == null || Number.isNaN(Number(score))) return '-'
  const numeric = Number(score)
  return Number.isInteger(numeric) ? `${numeric}%` : `${numeric.toFixed(2)}%`
}

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback
  try { return JSON.parse(value) } catch { return '__INVALID__' }
}

function questionTypeOf(q) {
  return q?.question_type || q?.type || 'TEXT'
}

function sanitizeFilename(v) {
  return String(v || 'report').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'report'
}

function stripAdminMeta(settings) {
  if (!settings || typeof settings !== 'object') return {}
  const next = { ...settings }
  delete next._admin_test
  return next
}

function mergeExamAndTest(examData, testData) {
  if (!examData && !testData) return null
  const settings = testData?.runtime_settings ?? stripAdminMeta(examData?.settings)
  return {
    ...(examData || {}),
    ...(testData || {}),
    id: examData?.id || testData?.id,
    title: testData?.name || examData?.title || '',
    name: testData?.name || examData?.title || '',
    description: testData?.description ?? examData?.description ?? '',
    exam_type: testData?.type || examData?.exam_type || examData?.type || 'MCQ',
    type: testData?.type || examData?.exam_type || examData?.type || 'MCQ',
    status: testData?.status || (examData?.status === 'OPEN' ? 'PUBLISHED' : examData?.status === 'CLOSED' ? 'ARCHIVED' : 'DRAFT'),
    runtime_status: examData?.status || 'CLOSED',
    code: testData?.code || '',
    course_id: testData?.course_id || examData?.course_id || '',
    course_title: testData?.course_title || examData?.course_title || '',
    time_limit_minutes: testData?.time_limit_minutes ?? examData?.time_limit_minutes ?? examData?.time_limit ?? '',
    max_attempts: testData?.attempts_allowed ?? examData?.max_attempts ?? 1,
    attempts_allowed: testData?.attempts_allowed ?? examData?.max_attempts ?? 1,
    passing_score: examData?.passing_score ?? testData?.passing_score ?? null,
    grading_scale_id: testData?.grading_scale_id ?? examData?.grading_scale_id ?? '',
    report_content: testData?.report_content || 'SCORE_AND_DETAILS',
    report_displayed: testData?.report_displayed || 'IMMEDIATELY_AFTER_GRADING',
    settings,
    proctoring_config: normalizeProctoringConfig(examData?.proctoring_config || testData?.proctoring_config || {}),
    certificate: examData?.certificate || testData?.certificate || null,
  }
}

export default function AdminManageTestPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [tab, setTab] = useState(() => normalizeTabParam(location.search))
  const [settingsSection, setSettingsSection] = useState('basic')
  const [view, setView] = useState('candidate_monitoring')
  const [showFilters, setShowFilters] = useState(true)

  const [exam, setExam] = useState(null)
  const [users, setUsers] = useState([])
  const [questions, setQuestions] = useState([])
  const [sessions, setSessions] = useState([])
  const [attemptRows, setAttemptRows] = useState([])

  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const [savingSettings, setSavingSettings] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkAction, setBulkAction] = useState('')
  const [rowBusy, setRowBusy] = useState({})
  const [gradeDrafts, setGradeDrafts] = useState({})
  const [deleteQuestionId, setDeleteQuestionId] = useState(null)
  const [deleteSessionId, setDeleteSessionId] = useState(null)
  const [deleteExamConfirm, setDeleteExamConfirm] = useState(false)
  const [deletingQuestionBusyId, setDeletingQuestionBusyId] = useState(null)
  const [deletingSessionBusyId, setDeletingSessionBusyId] = useState(null)
  const [deletingExamBusy, setDeletingExamBusy] = useState(false)

  const [selectedSession, setSelectedSession] = useState('')
  const [search, setSearch] = useState({ attempt: '', user: '', session: '', status: '', group: '', comment: '' })
  const [reportsBusy, setReportsBusy] = useState(false)
  const [categories, setCategories] = useState([])

  const [settingsForm, setSettingsForm] = useState({
    title: '',
    description: '',
    time_limit_minutes: '',
    max_attempts: '1',
    passing_score: '',
    code: '',
    proctoring_config: {},
    instructions: '',
    instructions_heading: '',
    instructions_body: '',
    show_score_report: false,
    show_answer_review: false,
    show_correct_answers: false,
    email_result_on_submit: false,
    report_displayed: 'IMMEDIATELY_AFTER_GRADING',
    report_content: 'SCORE_AND_DETAILS',
    settings_json: '',
    certificate_json: '',
    allow_pause: false,
    pause_duration_minutes: '',
    allow_retake: false,
    retake_cooldown_hours: '',
    reschedule_policy: 'NOT_ALLOWED',
    coupons_enabled: false,
    coupon_code: '',
    coupon_discount_type: 'percentage',
    coupon_discount_value: '',
    language: 'en',
    allow_language_override: false,
    attachment_urls: '',
    external_attributes_json: '',
    category_id: '',
  })

  const [editingAccomId, setEditingAccomId] = useState(null)
  const [editingAccomForm, setEditingAccomForm] = useState({ access_mode: 'OPEN', notes: '', scheduled_at: '' })

  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION_FORM)
  const [editingQuestionId, setEditingQuestionId] = useState('')
  const [questionSearch, setQuestionSearch] = useState('')
  const [questionBusy, setQuestionBusy] = useState(false)

  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [savingAccomId, setSavingAccomId] = useState(null)

  useEffect(() => {
    const normalized = normalizeTabParam(location.search)
    if (normalized !== tab) {
      setTab(normalized)
    }
  }, [location.search, tab])

  const handleTabChange = useCallback((nextTab) => {
    if (!TABS.some((item) => item.id === nextTab)) return
    setTab(nextTab)
    const params = new URLSearchParams(location.search)
    if (nextTab === 'settings') params.delete('tab')
    else params.set('tab', nextTab)
    const search = params.toString()
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : '',
      },
      { replace: true },
    )
  }, [location.pathname, location.search, navigate])

  const hydrateSettingsForm = useCallback((ex) => {
    const cfg = normalizeProctoringConfig(ex?.proctoring_config || {})
    const s = ex?.runtime_settings ?? stripAdminMeta(ex?.settings)
    setSettingsForm({
      title: ex?.title || '',
      description: ex?.description || '',
      code: ex?.code || '',
      time_limit_minutes: String(ex?.time_limit_minutes ?? ex?.time_limit ?? ''),
      max_attempts: String(ex?.max_attempts ?? 1),
      passing_score: ex?.passing_score == null ? '' : String(ex.passing_score),
      proctoring_config: cfg,
      instructions: s.instructions || '',
      instructions_heading: s.instructions_heading || '',
      instructions_body: s.instructions_body || '',
      show_score_report: Boolean(s.show_score_report),
      show_answer_review: Boolean(s.show_answer_review),
      show_correct_answers: Boolean(s.show_correct_answers),
      email_result_on_submit: Boolean(s.email_result_on_submit),
      report_displayed: ex?.report_displayed || 'IMMEDIATELY_AFTER_GRADING',
      report_content: ex?.report_content || 'SCORE_AND_DETAILS',
      settings_json: Object.keys(s || {}).length ? JSON.stringify(s, null, 2) : '',
      certificate_json: ex?.certificate ? JSON.stringify(ex.certificate, null, 2) : '',
      allow_pause: Boolean(s?.allow_pause),
      pause_duration_minutes: s?.pause_duration_minutes != null ? String(s.pause_duration_minutes) : '',
      allow_retake: Boolean(s?.allow_retake),
      retake_cooldown_hours: s?.retake_cooldown_hours != null ? String(s.retake_cooldown_hours) : '',
      reschedule_policy: s?.reschedule_policy || 'NOT_ALLOWED',
      coupons_enabled: Boolean(s?.coupons_enabled),
      coupon_code: s?.coupon_code || '',
      coupon_discount_type: s?.coupon_discount_type || 'percentage',
      coupon_discount_value: s?.coupon_discount_value != null ? String(s.coupon_discount_value) : '',
      language: s?.language || 'en',
      allow_language_override: Boolean(s?.allow_language_override),
      attachment_urls: Array.isArray(s?.attachment_urls) ? s.attachment_urls.join('\n') : (s?.attachment_urls || ''),
      external_attributes_json: s?.external_attributes ? JSON.stringify(s.external_attributes, null, 2) : '',
      category_id: String(ex?.category_id || ''),
    })
  }, [])

  const loadAll = useCallback(async (showSpinner = true) => {
    if (!id || id === 'undefined' || id === 'null') {
      if (isManageRoutePath(location.pathname)) {
        navigate('/admin/tests', { replace: true })
      }
      return
    }
    if (showSpinner) setLoading(true)
    setLoadError('')
    setError('')
    try {
      const [{ data: ex }, { data: testData }, { data: attempts }, { data: scheds }, { data: usersData }, { data: questionsData }, { data: catsData }] = await Promise.all([
        adminApi.getTestRuntime(id),
        adminApi.getTest(id),
        adminApi.attempts(),
        adminApi.schedules(),
        adminApi.users(),
        adminApi.getQuestions(id),
        adminApi.categories(),
      ])
      setCategories(catsData || [])
      const mergedExam = mergeExamAndTest(ex, testData)
      setExam(mergedExam)
      setUsers(usersData || [])
      setQuestions(questionsData || [])
      hydrateSettingsForm(mergedExam)

      const examScheds = (scheds || []).filter((s) => String(s.exam_id) === String(id))
      setSessions(examScheds)
      const userMap = new Map((usersData || []).map((u) => [String(u.id), u]))
      const examAttempts = (attempts || []).filter((a) => String(a.exam_id) === String(id))

      const stateByAttempt = new Map()
      await Promise.all(examAttempts.map(async (a) => {
        let paused = false
        let hasVideo = false
        let highAlerts = 0
        let mediumAlerts = 0
        try {
          const { data: events } = await adminApi.getAttemptEvents(a.id)
          const list = events || []
          const stateEvents = list.filter((e) => e.event_type === 'ATTEMPT_PAUSED' || e.event_type === 'ATTEMPT_RESUMED')
          if (stateEvents.length > 0) paused = stateEvents[stateEvents.length - 1].event_type === 'ATTEMPT_PAUSED'
          highAlerts = list.filter((e) => e.severity === 'HIGH').length
          mediumAlerts = list.filter((e) => e.severity === 'MEDIUM').length
        } catch {}
        try {
          const { data: videos } = await adminApi.listAttemptVideos(a.id)
          hasVideo = Array.isArray(videos) && videos.length > 0
        } catch {}
        stateByAttempt.set(String(a.id), { paused, hasVideo, highAlerts, mediumAlerts })
      }))

      setAttemptRows(examAttempts.map((a) => {
        const u = userMap.get(String(a.user_id))
        const s = examScheds.find((x) => String(x.user_id) === String(a.user_id))
        const st = stateByAttempt.get(String(a.id)) || {}
        const score = (st.highAlerts || 0) * 3 + (st.mediumAlerts || 0)
        const needsManualReview = a.status === 'SUBMITTED' && (a.score == null)
        return {
          id: String(a.id),
          attemptIdFull: String(a.id),
          attemptId: String(a.id).slice(0, 8),
          username: a.user_student_id || u?.user_id || a.user_name || u?.name || String(a.user_id).slice(0, 8),
          sessionName: s ? `Session ${String(s.id).slice(0, 6)}` : '-',
          status: a.status || '-',
          score: typeof a.score === 'number' ? a.score : null,
          needsManualReview,
          reviewState: needsManualReview
            ? 'Awaiting manual grading'
            : a.status === 'GRADED'
              ? 'Finalized'
              : a.status === 'SUBMITTED'
                ? 'Auto-scored'
                : 'In progress',
          paused: st.paused === true,
          hasVideo: st.hasVideo === true,
          startedAt: a.started_at,
          submittedAt: a.submitted_at,
          userGroup: s?.access_mode || '-',
          comment: st.paused ? 'Paused by proctor' : (needsManualReview ? 'Manual grading required' : (a.status === 'GRADED' ? 'Reviewed' : a.status === 'SUBMITTED' ? 'Submitted' : '')),
          proctorRate: score,
          sessionId: s?.id || '',
          highAlerts: st.highAlerts || 0,
          mediumAlerts: st.mediumAlerts || 0,
        }
      }))
    } catch (e) {
      setLoadError(e.response?.data?.detail || 'Failed to load test data.')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [id, location.pathname, navigate, hydrateSettingsForm])

  useEffect(() => { loadAll(true) }, [loadAll])

  useEffect(() => {
    setGradeDrafts(
      attemptRows.reduce((acc, row) => {
        acc[row.id] = row.score != null ? String(row.score) : ''
        return acc
      }, {}),
    )
  }, [attemptRows])

  const filteredRows = useMemo(() => attemptRows.filter((r) => {
    if (selectedSession && String(r.sessionId) !== String(selectedSession)) return false
    if (search.attempt && !r.attemptId.toLowerCase().includes(search.attempt.toLowerCase())) return false
    if (search.user && !r.username.toLowerCase().includes(search.user.toLowerCase())) return false
    if (search.session && !r.sessionName.toLowerCase().includes(search.session.toLowerCase())) return false
    if (search.status && (search.status === 'PAUSED' ? !r.paused : r.status !== search.status)) return false
    if (search.group && !String(r.userGroup || '').toLowerCase().includes(search.group.toLowerCase())) return false
    if (search.comment && !String(r.comment || '').toLowerCase().includes(search.comment.toLowerCase())) return false
    return true
  }), [attemptRows, selectedSession, search])

  const flaggedRows = useMemo(
    () => attemptRows.filter((row) => row.highAlerts > 0 || row.mediumAlerts > 0),
    [attemptRows],
  )

  const monitoringHasFilters = Boolean(
    selectedSession
    || search.attempt
    || search.user
    || search.session
    || search.status
    || search.group
    || search.comment,
  )

  const monitoringSummaryCards = useMemo(() => [
    {
      label: 'Loaded attempts',
      value: attemptRows.length,
      helper: 'All attempts currently linked to this test',
    },
    {
      label: 'Visible now',
      value: filteredRows.length,
      helper: monitoringHasFilters ? 'Matching the active proctoring filters' : 'All loaded attempts',
    },
    {
      label: 'Paused',
      value: attemptRows.filter((row) => row.paused).length,
      helper: 'Attempts currently paused by supervision rules',
    },
    {
      label: 'Flagged requests',
      value: flaggedRows.length,
      helper: 'Attempts with high or medium alert activity',
    },
  ], [attemptRows, filteredRows.length, flaggedRows.length, monitoringHasFilters])

  const clearMonitoringFilters = () => {
    setSelectedSession('')
    setSearch({ attempt: '', user: '', session: '', status: '', group: '', comment: '' })
  }

  const filteredQuestions = useMemo(() => {
    if (!questionSearch) return questions
    const q = questionSearch.toLowerCase()
    return questions.filter((x) => String(x.text || '').toLowerCase().includes(q) || String(questionTypeOf(x)).toLowerCase().includes(q))
  }, [questions, questionSearch])

  const learners = useMemo(() => (users || []).filter((u) => u.role === 'LEARNER'), [users])
  const candidateRows = useMemo(() => {
    const sessionOnlyRows = sessions
      .filter((session) => !attemptRows.some((attempt) => String(attempt.sessionId) === String(session.id)))
      .map((session) => {
        const learner = users.find((user) => String(user.id) === String(session.user_id))
        return {
          id: `scheduled-${session.id}`,
          attemptIdFull: null,
          attemptId: '-',
          username: learner?.user_id || learner?.name || String(session.user_id).slice(0, 8),
          status: 'NOT_STARTED',
          score: null,
          needsManualReview: false,
          reviewState: 'Scheduled, not started',
          paused: false,
          hasVideo: false,
          startedAt: null,
          submittedAt: null,
          userGroup: session.access_mode || '-',
          comment: session.notes || 'Waiting for learner to start',
          proctorRate: 0,
          sessionId: session.id,
          sessionName: `Session ${String(session.id).slice(0, 6)}`,
          highAlerts: 0,
          mediumAlerts: 0,
        }
      })
    return [...attemptRows, ...sessionOnlyRows]
  }, [attemptRows, sessions, users])

  const withNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 2600) }
  const withError = (msg) => { setError(msg); setTimeout(() => setError(''), 4200) }

  const withRowBusy = async (rowId, fn) => {
    setRowBusy((prev) => ({ ...prev, [rowId]: true }))
    try { await fn() } finally { setRowBusy((prev) => ({ ...prev, [rowId]: false })) }
  }

  const handlePauseResume = async (row) => {
    if (!row.attemptIdFull) {
      withError('This learner has not started the test yet.')
      return
    }
    try {
      await withRowBusy(row.id, async () => {
        if (row.paused) await adminApi.resumeAttempt(row.attemptIdFull)
        else await adminApi.pauseAttempt(row.attemptIdFull)
      })
      await loadAll(false)
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to pause/resume attempt.')
    }
  }

  const handleOpenReport = async (row) => {
    if (!row.attemptIdFull) {
      withError('No attempt report is available until the learner starts the test.')
      return
    }
    try {
      await withRowBusy(row.id, async () => {
        const { data } = await adminApi.generateReport(row.attemptIdFull)
        const blob = new Blob([data], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(url), 30000)
      })
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to open report.')
    }
  }

  const handleOpenVideo = (row) => {
    if (rowBusy[row.id] || !row.attemptIdFull) return
    navigate(`/admin/videos/${row.attemptIdFull}`)
  }

  const handleOpenResult = (row) => {
    if (rowBusy[row.id] || !row.attemptIdFull) return
    navigate({
      pathname: `/attempts/${row.attemptIdFull}`,
      search: `?from=manage-test&testId=${encodeURIComponent(id || '')}&tab=${encodeURIComponent(tab)}`,
    })
  }

  const handleSaveGrade = async (row) => {
    if (!row.attemptIdFull) {
      withError('This learner has not started the test yet.')
      return
    }
    if (row.status === 'IN_PROGRESS') {
      withError('Submit the attempt before grading it.')
      return
    }
    const rawValue = `${gradeDrafts[row.id] ?? ''}`.trim()
    if (!rawValue) {
      withError('Enter a score between 0 and 100.')
      return
    }
    const nextScore = Number(rawValue)
    if (!Number.isFinite(nextScore) || nextScore < 0 || nextScore > 100) {
      withError('Grade must be between 0 and 100.')
      return
    }
    try {
      await withRowBusy(row.id, async () => {
        await adminApi.gradeAttempt(row.attemptIdFull, nextScore)
      })
      await loadAll(false)
      withNotice(row.status === 'GRADED' ? 'Grade updated.' : 'Attempt graded.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to save grade.')
    }
  }

  const handleBulkPauseResume = async (toPause) => {
    if (!filteredRows.length) return
    setBulkBusy(true)
    setBulkAction(toPause ? 'pause' : 'resume')
    try {
      for (const r of filteredRows) {
        if (toPause && !r.paused) await adminApi.pauseAttempt(r.id)
        if (!toPause && r.paused) await adminApi.resumeAttempt(r.id)
      }
      await loadAll(false)
      withNotice(toPause ? 'Filtered attempts paused.' : 'Filtered attempts resumed.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Bulk action failed.')
    } finally {
      setBulkBusy(false)
      setBulkAction('')
    }
  }

  const handleSettingsSave = async () => {
    if (!exam) return
    if (isArchived) return withError('Archived tests are read-only.')
    const trimmedTitle = settingsForm.title.trim()
    const trimmedCode = settingsForm.code.trim()
    const trimmedCouponCode = settingsForm.coupon_code.trim()
    const parsedSettings = safeJsonParse(settingsForm.settings_json, null)
    const parsedCertificate = safeJsonParse(settingsForm.certificate_json, null)
    if (parsedSettings === '__INVALID__') return withError('Invalid JSON in settings block.')
    if (parsedCertificate === '__INVALID__') return withError('Invalid JSON in certificate block.')

    const timeLimit = settingsForm.time_limit_minutes === '' ? null : Number(settingsForm.time_limit_minutes)
    const maxAttempts = settingsForm.max_attempts === '' ? 1 : Number(settingsForm.max_attempts)
    const passingScore = settingsForm.passing_score === '' ? null : Number(settingsForm.passing_score)
    const pauseDurationMinutes = settingsForm.pause_duration_minutes === '' ? null : Number(settingsForm.pause_duration_minutes)
    const retakeCooldownHours = settingsForm.retake_cooldown_hours === '' ? null : Number(settingsForm.retake_cooldown_hours)
    const couponDiscountValue = settingsForm.coupon_discount_value === '' ? null : Number(settingsForm.coupon_discount_value)

    if (!trimmedTitle) return withError('Title is required.')
    if (timeLimit != null && (!Number.isFinite(timeLimit) || timeLimit <= 0)) return withError('Time limit must be positive.')
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) return withError('Max attempts must be between 1 and 20.')
    if (passingScore != null && (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100)) return withError('Passing score must be between 0 and 100.')
    if (settingsForm.allow_pause && pauseDurationMinutes != null && (!Number.isFinite(pauseDurationMinutes) || pauseDurationMinutes <= 0)) {
      return withError('Pause duration must be a positive number of minutes.')
    }
    if (settingsForm.allow_retake && retakeCooldownHours != null && (!Number.isFinite(retakeCooldownHours) || retakeCooldownHours < 0)) {
      return withError('Retake cooldown must be zero or greater.')
    }
    if (settingsForm.coupons_enabled) {
      if (!trimmedCouponCode) return withError('Coupon code is required when coupons are enabled.')
      if (couponDiscountValue == null || !Number.isFinite(couponDiscountValue) || couponDiscountValue <= 0) {
        return withError('Coupon discount value must be greater than 0.')
      }
      if (settingsForm.coupon_discount_type === 'percentage' && couponDiscountValue > 100) {
        return withError('Percentage discount cannot exceed 100.')
      }
    }

    let parsedExternalAttrs = null
    if (settingsForm.external_attributes_json) {
      try { parsedExternalAttrs = JSON.parse(settingsForm.external_attributes_json) }
      catch { return withError('Invalid JSON in external attributes.') }
    }
    if (parsedExternalAttrs != null && (typeof parsedExternalAttrs !== 'object' || Array.isArray(parsedExternalAttrs))) {
      return withError('External attributes must be a JSON object.')
    }

    const runtimeSettings = {
      ...(parsedSettings || {}),
      instructions: settingsForm.instructions || '',
      instructions_heading: settingsForm.instructions_heading || '',
      instructions_body: settingsForm.instructions_body || '',
      show_score_report: settingsForm.show_score_report,
      show_answer_review: settingsForm.show_answer_review,
      show_correct_answers: settingsForm.show_correct_answers,
      email_result_on_submit: settingsForm.email_result_on_submit,
      allow_pause: settingsForm.allow_pause,
      pause_duration_minutes: settingsForm.allow_pause ? pauseDurationMinutes : null,
      allow_retake: settingsForm.allow_retake,
      retake_cooldown_hours: settingsForm.allow_retake ? retakeCooldownHours : null,
      reschedule_policy: settingsForm.reschedule_policy,
      coupons_enabled: settingsForm.coupons_enabled,
      coupon_code: settingsForm.coupons_enabled ? trimmedCouponCode : null,
      coupon_discount_type: settingsForm.coupon_discount_type,
      coupon_discount_value: settingsForm.coupons_enabled ? couponDiscountValue : null,
      language: settingsForm.language,
      allow_language_override: settingsForm.allow_language_override,
      attachment_urls: settingsForm.attachment_urls ? settingsForm.attachment_urls.split('\n').map((x) => x.trim()).filter(Boolean) : [],
      external_attributes: parsedExternalAttrs,
    }
    const adminPayload = isPublished
      ? {
          name: trimmedTitle,
          description: settingsForm.description || null,
          report_displayed: settingsForm.report_displayed,
          report_content: settingsForm.report_content,
        }
      : {
          code: trimmedCode || null,
          name: trimmedTitle,
          description: settingsForm.description || null,
          type: exam.type,
          node_id: exam.node_id || undefined,
          category_id: settingsForm.category_id || exam.category_id || undefined,
          grading_scale_id: exam.grading_scale_id || undefined,
          report_displayed: settingsForm.report_displayed,
          report_content: settingsForm.report_content,
          time_limit_minutes: timeLimit,
          attempts_allowed: Math.floor(maxAttempts),
          passing_score: passingScore,
          runtime_settings: runtimeSettings,
          proctoring_config: normalizeProctoringConfig(settingsForm.proctoring_config || {}),
          certificate: parsedCertificate,
        }

    setSavingSettings(true)
    try {
      await adminApi.updateTest(exam.id, adminPayload)
      await loadAll(false)
      withNotice('Settings saved.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  const handlePublish = async () => {
    if (!exam) return
    try {
      await adminApi.publishTest(exam.id)
      await loadAll(false)
      withNotice('Test published.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Unable to publish test.')
    }
  }

  const handleClose = async () => {
    if (!exam) return
    try {
      if (isArchived) {
        await adminApi.unarchiveTest(exam.id)
        withNotice('Test unarchived.')
      } else {
        await adminApi.archiveTest(exam.id)
        withNotice('Test archived.')
      }
      await loadAll(false)
    } catch (e) {
      withError(e.response?.data?.detail || 'Unable to change test status.')
    }
  }

  const handlePreview = () => {
    if (!exam) return
    if (!isPublished) return withError('Publish/open the test first, then preview.')
    navigate(`/tests/${exam.id}`)
  }

  const handleDuplicate = async () => {
    if (!exam) return
    try {
      const { data: newExam } = await adminApi.duplicateTest(exam.id)
      withNotice('Test duplicated.')
      navigate(`/admin/tests/${newExam.id}/manage`)
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to duplicate test.')
    }
  }

  const handleDeleteExam = async () => {
    if (!exam) return
    if (!deleteExamConfirm) { setDeleteExamConfirm(true); return }
    setDeleteExamConfirm(false)
    setDeletingExamBusy(true)
    try {
      await adminApi.deleteTest(exam.id)
      navigate('/admin/tests')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to delete test.')
    } finally {
      setDeletingExamBusy(false)
    }
  }

  const handleSettingsMenuClick = (item) => {
    const section = MENU_TO_SECTION[item] || 'advanced'
    setSettingsSection(section)
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const startEditAccom = (s) => {
    setEditingAccomId(s.id)
    setEditingAccomForm({
      access_mode: s.access_mode || 'OPEN',
      notes: s.notes || '',
      scheduled_at: s.scheduled_at ? new Date(s.scheduled_at).toISOString().slice(0, 16) : '',
    })
  }

  const handleSaveAccom = async (sessionId) => {
    if (!editingAccomForm.scheduled_at) return withError('Scheduled date/time is required.')
    setSavingAccomId(sessionId)
    try {
      await adminApi.updateSchedule(sessionId, {
        access_mode: editingAccomForm.access_mode,
        notes: editingAccomForm.notes || null,
        scheduled_at: new Date(editingAccomForm.scheduled_at).toISOString(),
      })
      setEditingAccomId(null)
      await loadAll(false)
      withNotice('Accommodation updated.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to update accommodation.')
    } finally {
      setSavingAccomId(null)
    }
  }

  const resetQuestionForm = () => { setQuestionForm(EMPTY_QUESTION_FORM); setEditingQuestionId('') }

  const startEditQuestion = (q) => {
    setEditingQuestionId(String(q.id))
    setQuestionForm({
      text: q.text || '',
      question_type: questionTypeOf(q),
      options_text: Array.isArray(q.options) ? q.options.join('\n') : '',
      correct_answer: q.correct_answer || '',
      points: String(q.points ?? 1),
      order: String(q.order ?? 0),
    })
    handleTabChange('sections')
  }

  const handleQuestionTypeChange = (value) => {
    if (value === 'TRUEFALSE') {
      setQuestionForm((prev) => ({ ...prev, question_type: value, options_text: 'True\nFalse', correct_answer: prev.correct_answer || 'A' }))
      return
    }
    setQuestionForm((prev) => ({ ...prev, question_type: value }))
  }

  const handleQuestionSubmit = async (e) => {
    e.preventDefault()
    setQuestionBusy(true)
    try {
      const qType = questionForm.question_type
      const needsOptions = ['MCQ', 'MULTI', 'TRUEFALSE'].includes(qType)
      const options = questionForm.options_text.split('\n').map((x) => x.trim()).filter(Boolean)
      const payload = {
        text: questionForm.text.trim(),
        question_type: qType,
        options: needsOptions ? options : null,
        correct_answer: needsOptions ? (questionForm.correct_answer || '').trim() : null,
        points: Number(questionForm.points || 1),
        order: Number(questionForm.order || 0),
      }
      if (!payload.text) throw new Error('Question text is required.')
      if (!Number.isFinite(payload.points) || payload.points <= 0) throw new Error('Points must be positive.')
      if (needsOptions && payload.options.length < 2) throw new Error('Provide at least 2 options.')
      if (needsOptions && !payload.correct_answer) throw new Error('Correct answer is required.')

      if (editingQuestionId) {
        await adminApi.updateQuestion(editingQuestionId, payload)
        withNotice('Question updated.')
      } else {
        await adminApi.addQuestion({ ...payload, exam_id: id })
        withNotice('Question added.')
      }
      const { data } = await adminApi.getQuestions(id)
      setQuestions(data || [])
      resetQuestionForm()
    } catch (e2) {
      withError(e2.response?.data?.detail || e2.message || 'Failed to save question.')
    } finally {
      setQuestionBusy(false)
    }
  }

  const handleDeleteQuestion = async (qid) => {
    if (deleteQuestionId !== qid) { setDeleteQuestionId(qid); return }
    setDeletingQuestionBusyId(qid)
    try {
      await adminApi.deleteQuestion(qid)
      const { data } = await adminApi.getQuestions(id)
      setQuestions(data || [])
      if (editingQuestionId === String(qid)) resetQuestionForm()
      setDeleteQuestionId(null)
      withNotice('Question deleted.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to delete question.')
    } finally {
      setDeletingQuestionBusyId(null)
    }
  }

  const handleCreateSession = async (e) => {
    e.preventDefault()
    if (!sessionForm.user_id) return withError('Select a learner.')
    if (!sessionForm.scheduled_at) return withError('Pick a schedule date/time.')
    setSessionBusy(true)
    try {
      const existing = sessions.find((session) => String(session.user_id) === String(sessionForm.user_id))
      const payload = {
        scheduled_at: new Date(sessionForm.scheduled_at).toISOString(),
        access_mode: sessionForm.access_mode,
        notes: sessionForm.notes || null,
      }
      if (existing?.id) {
        await adminApi.updateSchedule(existing.id, payload)
      } else {
        await adminApi.createSchedule({
          exam_id: id,
          user_id: sessionForm.user_id,
          ...payload,
        })
      }
      setSessionForm(EMPTY_SESSION_FORM)
      await loadAll(false)
      withNotice(existing?.id ? 'Testing session updated.' : 'Testing session created.')
    } catch (e2) {
      withError(e2.response?.data?.detail || 'Failed to save session.')
    } finally {
      setSessionBusy(false)
    }
  }

  const handleDeleteSession = async (sessionId) => {
    if (deleteSessionId !== sessionId) { setDeleteSessionId(sessionId); return }
    setDeletingSessionBusyId(sessionId)
    try {
      await adminApi.deleteSchedule(sessionId)
      setDeleteSessionId(null)
      await loadAll(false)
      withNotice('Session deleted.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to delete session.')
    } finally {
      setDeletingSessionBusyId(null)
    }
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const downloadExamCsv = async () => {
    if (!exam) return
    setReportsBusy(true)
    try {
      const { data } = await adminApi.testReportCsv(exam.id)
      downloadBlob(new Blob([data], { type: 'text/csv' }), `${sanitizeFilename(exam.title)}_report.csv`)
      withNotice('CSV report downloaded.')
    } catch (e) {
      withError(await readBlobErrorMessage(e, 'Failed to download CSV report.'))
    } finally {
      setReportsBusy(false)
    }
  }

  const downloadExamPdf = async () => {
    if (!exam) return
    setReportsBusy(true)
    try {
      const { data } = await adminApi.generateTestReportPdf(exam.id)
      downloadBlob(new Blob([data], { type: 'application/pdf' }), `${sanitizeFilename(exam.title)}_report.pdf`)
      withNotice('PDF report downloaded.')
    } catch (e) {
      withError(await readBlobErrorMessage(e, 'Failed to download PDF report.'))
    } finally {
      setReportsBusy(false)
    }
  }

  if (loading) return <div className={styles.page}>Loading...</div>
  if (!exam) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>{loadError || 'Test not found.'}</div>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.blueBtn} onClick={() => loadAll(true)}>Retry</button>
          <button type="button" className={styles.ghostBtn} onClick={() => navigate('/admin/tests')}>Back to tests</button>
        </div>
      </div>
    )
  }

  const isPublished = exam.status === 'PUBLISHED'
  const isArchived = exam.status === 'ARCHIVED'
  const lockedExamFields = isPublished || isArchived
  const reportSettingsLocked = isPublished || isArchived
  const sessionFormReady = Boolean(sessionForm.user_id && sessionForm.scheduled_at)
  const activeProctoringChecks = PROCTOR_BOOLEAN_KEYS.filter((key) => Boolean(settingsForm.proctoring_config?.[key]))
  const openSessions = sessions.filter((session) => session.access_mode === 'OPEN').length
  const restrictedSessions = sessions.filter((session) => session.access_mode === 'RESTRICTED').length
  const manageOverviewCards = [
    {
      label: 'Status',
      value: isPublished ? 'Published' : isArchived ? 'Archived' : 'Draft',
      helper: isPublished ? 'Learners can access the test based on assignment rules' : 'Changes are still fully editable',
    },
    {
      label: 'Questions',
      value: questions.length,
      helper: questions.length > 0 ? 'Real question bank linked to this test' : 'Questions still need to be added',
    },
    {
      label: 'Sessions',
      value: sessions.length,
      helper: sessions.length > 0 ? 'Learner assignments and schedules are persisted' : 'No learner sessions assigned yet',
    },
    {
      label: 'Attempts',
      value: attemptRows.length,
      helper: attemptRows.length > 0 ? `${flaggedRows.length} flagged for review` : 'No learner attempts yet',
    },
    {
      label: 'Reports',
      value: settingsForm.show_score_report ? 'Candidate visible' : 'Admin only',
      helper: settingsForm.show_answer_review ? 'Answer review is enabled after submission' : 'Answer review is hidden from learners',
    },
  ]
  const lifecycleCards = [
    {
      label: 'Learner access',
      value: sessions.length === 0 ? 'Not assigned' : `${openSessions} open / ${restrictedSessions} restricted`,
      helper: sessions.length === 0 ? 'Assign at least one learner session to move this test into the live cycle.' : 'Based on persisted testing session records.',
    },
    {
      label: 'Proctoring profile',
      value: activeProctoringChecks.length > 0 ? `${activeProctoringChecks.length} checks` : 'Monitoring off',
      helper: activeProctoringChecks.length > 0 ? activeProctoringChecks.map((key) => PROCTOR_LABELS[key]).join(', ') : 'No live proctoring checks are enabled.',
    },
    {
      label: 'Certificates',
      value: exam.certificate ? 'Enabled' : 'Disabled',
      helper: exam.certificate ? `Issued by ${exam.certificate.signer || 'configured signer'}` : 'No post-pass certificate is currently issued.',
    },
    {
      label: 'Retake policy',
      value: settingsForm.allow_retake ? 'Allowed' : 'Locked',
      helper: settingsForm.allow_retake
        ? `Cooldown ${settingsForm.retake_cooldown_hours || '0'} hour(s), max ${settingsForm.max_attempts} attempt(s)`
        : 'Learners cannot open a new attempt after submission.',
    },
    {
      label: 'Review queue',
      value: flaggedRows.length,
      helper: flaggedRows.length > 0 ? 'Attempts with high or medium proctoring alerts need review.' : 'No flagged attempts are waiting in the review queue.',
    },
  ]
  const openCycleTab = (nextTab, nextSection = null) => {
    handleTabChange(nextTab)
    if (nextSection) setSettingsSection(nextSection)
  }

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <button type="button" onClick={() => navigate('/admin/tests')}>Back</button>
        <span>All tests</span>
        <span>&gt;</span>
        <span>{exam.title}</span>
        <span className={styles.status}>{isPublished ? 'Published' : isArchived ? 'Archived' : 'Draft'}</span>
      </div>

      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {loadError ? (
        <div className={styles.error}>
          <div className={styles.bannerActions}>
            <span>{loadError}</span>
            <button type="button" className={styles.retryBtn} onClick={() => loadAll(false)}>Retry</button>
          </div>
        </div>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.summaryGrid}>
        {manageOverviewCards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </div>
        ))}
      </div>

      <div className={styles.lifecycleGrid}>
        {lifecycleCards.map((card) => (
          <div key={card.label} className={styles.lifecycleCard}>
            <div className={styles.lifecycleLabel}>{card.label}</div>
            <div className={styles.lifecycleValue}>{card.value}</div>
            <div className={styles.lifecycleHelper}>{card.helper}</div>
          </div>
        ))}
      </div>

      <div className={styles.quickActionRow}>
        <button type="button" className={styles.ghostBtn} onClick={handlePreview}>Preview learner flow</button>
        <button type="button" className={styles.ghostBtn} onClick={() => openCycleTab('sessions')}>Review sessions</button>
        <button type="button" className={styles.ghostBtn} onClick={() => openCycleTab('proctoring')}>Review proctoring</button>
        <button type="button" className={styles.ghostBtn} onClick={() => openCycleTab('reports')}>Open reports</button>
        <button type="button" className={styles.ghostBtn} onClick={() => openCycleTab('settings', 'reports')}>Adjust learner review</button>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? styles.tabActive : ''} onClick={() => handleTabChange(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'settings' && (
          <>
            <aside className={styles.leftMenu}>
              {SETTINGS_MENU.map((item) => (
                <button type="button" key={item} className={MENU_TO_SECTION[item] === settingsSection ? styles.leftActive : ''} onClick={() => handleSettingsMenuClick(item)}>
                  {item}
                </button>
              ))}
            </aside>

            <section className={styles.main}>
              <div className={styles.headerRow}>
                <h3>Settings</h3>
                <div className={styles.headerActions}>
                  <button type="button" className={styles.greenBtn} onClick={handlePreview}>Preview</button>
                  {!isPublished && !isArchived ? <button type="button" className={styles.blueBtn} onClick={handlePublish}>Publish test</button> : null}
                  {isPublished || isArchived ? <button type="button" className={styles.ghostBtn} onClick={handleClose}>{isArchived ? 'Unarchive test' : 'Archive test'}</button> : null}
                  <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={() => navigate(`/admin/tests/${exam.id}/edit`)}>Options</button>
                </div>
              </div>

              <div id="settings-instructions" className={styles.sectionCard}>
                <h4>Test instructions dialog settings</h4>
                <div className={styles.formGrid}>
                  <label>Instructions heading<input value={settingsForm.instructions_heading || ''} disabled={lockedExamFields} onChange={(e) => setSettingsForm((p) => ({ ...p, instructions_heading: e.target.value }))} placeholder="Before you begin..." /></label>
                </div>
                <label>Instructions body<textarea value={settingsForm.instructions_body || ''} disabled={lockedExamFields} onChange={(e) => setSettingsForm((p) => ({ ...p, instructions_body: e.target.value }))} rows={5} placeholder="Describe test rules, allowed resources, and important notes candidates should read before starting." /></label>
              </div>

              <div id="settings-basic" className={styles.sectionCard}>
                <h4>Basic information</h4>
                <div className={styles.formGrid}>
                  <label>Test name *<input value={settingsForm.title} disabled={isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, title: e.target.value }))} /></label>
                  <label>Test code<input value={settingsForm.code || ''} disabled={isPublished || isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, code: e.target.value }))} /></label>
                  <label>Test status<input value={exam.status || ''} readOnly /></label>
                  <label>Test ID<input value={String(exam.id).slice(0, 6)} readOnly /></label>
                </div>
                <label>Test description<textarea value={settingsForm.description} disabled={isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, description: e.target.value }))} rows={4} /></label>
              </div>

              <div id="settings-duration" className={styles.sectionCard}>
                <h4>Duration and layout</h4>
                <div className={styles.row}>
                  <label>Time limit (minutes)<input type="number" min="1" max="600" disabled={lockedExamFields} value={settingsForm.time_limit_minutes} onChange={(e) => setSettingsForm((p) => ({ ...p, time_limit_minutes: e.target.value }))} /></label>
                  <label>Max attempts<input type="number" min="1" disabled={lockedExamFields} value={settingsForm.max_attempts} onChange={(e) => setSettingsForm((p) => ({ ...p, max_attempts: e.target.value }))} /></label>
                </div>
              </div>

              <div id="settings-grading" className={styles.sectionCard}>
                <h4>Grading configuration</h4>
                <div className={styles.row}>
                  <label>Passing score<input type="number" min="0" max="100" disabled={lockedExamFields} value={settingsForm.passing_score} onChange={(e) => setSettingsForm((p) => ({ ...p, passing_score: e.target.value }))} /></label>
                  <label>Instructions<textarea rows={3} disabled={lockedExamFields} value={settingsForm.instructions} onChange={(e) => setSettingsForm((p) => ({ ...p, instructions: e.target.value }))} /></label>
                </div>
              </div>

              <div id="settings-security" className={styles.sectionCard}>
                <h4>Security settings</h4>
                <div className={styles.toggleGrid}>
                  {PROCTOR_BOOLEAN_KEYS.map((key) => (
                    <label key={key} className={styles.toggleItem}>
                      <input
                        type="checkbox"
                        disabled={lockedExamFields}
                        checked={Boolean(settingsForm.proctoring_config?.[key])}
                        onChange={(e) => setSettingsForm((p) => ({
                          ...p,
                          proctoring_config: { ...(p.proctoring_config || {}), [key]: e.target.checked },
                        }))}
                      />
                      <span>{PROCTOR_LABELS[key] || key}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div id="settings-certificate" className={styles.sectionCard}>
                <h4>Certificate configuration (JSON)</h4>
                <textarea className={styles.codeArea} rows={6} disabled={lockedExamFields} value={settingsForm.certificate_json} onChange={(e) => setSettingsForm((p) => ({ ...p, certificate_json: e.target.value }))} />
              </div>

              <div id="settings-reports" className={styles.sectionCard}>
                <h4>Report settings</h4>
                <p className={styles.sectionDescription}>
                  Published tests can still change report delivery and summary format. Candidate review toggles become read-only after publish because the live backend locks runtime review settings.
                </p>
                <div className={styles.row}>
                  <label>Report displayed
                    <select value={settingsForm.report_displayed} disabled={isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, report_displayed: e.target.value }))}>
                      <option value="IMMEDIATELY_AFTER_GRADING">Immediately after grading</option>
                      <option value="IMMEDIATELY_AFTER_FINISHING">Immediately after finishing</option>
                      <option value="ON_MANAGER_APPROVAL">On manager approval</option>
                    </select>
                  </label>
                  <label>Report content
                    <select value={settingsForm.report_content} disabled={isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, report_content: e.target.value }))}>
                      <option value="SCORE_AND_DETAILS">Score and details</option>
                      <option value="SCORE_ONLY">Score only</option>
                    </select>
                  </label>
                </div>
                <div className={styles.toggleGrid}>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.show_score_report)} onChange={(e) => setSettingsForm((p) => ({ ...p, show_score_report: e.target.checked }))} />
                    <span>Show score report to candidate</span>
                  </label>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.show_answer_review)} onChange={(e) => setSettingsForm((p) => ({ ...p, show_answer_review: e.target.checked }))} />
                    <span>Allow answer review after submission</span>
                  </label>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.show_correct_answers)} onChange={(e) => setSettingsForm((p) => ({ ...p, show_correct_answers: e.target.checked }))} />
                    <span>Show correct answers in review</span>
                  </label>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.email_result_on_submit)} onChange={(e) => setSettingsForm((p) => ({ ...p, email_result_on_submit: e.target.checked }))} />
                    <span>Email result to candidate on submit</span>
                  </label>
                </div>
              </div>

              <div id="settings-retake" className={styles.sectionCard}>
                <h4>Pause, retake and reschedule settings</h4>
                <div className={styles.toggleGrid}>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.allow_pause)} onChange={(e) => setSettingsForm((p) => ({ ...p, allow_pause: e.target.checked }))} />
                    <span>Allow test pause</span>
                  </label>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.allow_retake)} onChange={(e) => setSettingsForm((p) => ({ ...p, allow_retake: e.target.checked }))} />
                    <span>Allow retake</span>
                  </label>
                </div>
                <div className={styles.row}>
                  <label>Pause duration limit (minutes)<input type="number" min="1" disabled={lockedExamFields} value={settingsForm.pause_duration_minutes} onChange={(e) => setSettingsForm((p) => ({ ...p, pause_duration_minutes: e.target.value }))} placeholder="Unlimited" /></label>
                  <label>Retake cooldown (hours)<input type="number" min="0" disabled={lockedExamFields} value={settingsForm.retake_cooldown_hours} onChange={(e) => setSettingsForm((p) => ({ ...p, retake_cooldown_hours: e.target.value }))} placeholder="0" /></label>
                </div>
                <div className={styles.row}>
                  <label>Reschedule policy
                    <select disabled={lockedExamFields} value={settingsForm.reschedule_policy} onChange={(e) => setSettingsForm((p) => ({ ...p, reschedule_policy: e.target.value }))}>
                      <option value="NOT_ALLOWED">Not allowed</option>
                      <option value="ANYTIME">Anytime</option>
                      <option value="BEFORE_EXAM">Before test starts</option>
                    </select>
                  </label>
                </div>
              </div>

              <div id="settings-coupons" className={styles.sectionCard}>
                <h4>Coupons</h4>
                <div className={styles.toggleGrid}>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.coupons_enabled)} onChange={(e) => setSettingsForm((p) => ({ ...p, coupons_enabled: e.target.checked }))} />
                    <span>Enable coupon discounts</span>
                  </label>
                </div>
                {settingsForm.coupons_enabled && (
                  <div className={styles.row}>
                    <label>Coupon code<input disabled={lockedExamFields} value={settingsForm.coupon_code} onChange={(e) => setSettingsForm((p) => ({ ...p, coupon_code: e.target.value }))} placeholder="e.g. SAVE20" /></label>
                    <label>Discount type
                      <select disabled={lockedExamFields} value={settingsForm.coupon_discount_type} onChange={(e) => setSettingsForm((p) => ({ ...p, coupon_discount_type: e.target.value }))}>
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                    </label>
                    <label>Discount value<input type="number" min="0" disabled={lockedExamFields} value={settingsForm.coupon_discount_value} onChange={(e) => setSettingsForm((p) => ({ ...p, coupon_discount_value: e.target.value }))} /></label>
                  </div>
                )}
              </div>

              <div id="settings-language" className={styles.sectionCard}>
                <h4>Language settings</h4>
                <div className={styles.row}>
                  <label>Interface language
                    <select disabled={lockedExamFields} value={settingsForm.language} onChange={(e) => setSettingsForm((p) => ({ ...p, language: e.target.value }))}>
                      <option value="en">English</option>
                      <option value="fr">French</option>
                      <option value="es">Spanish</option>
                      <option value="de">German</option>
                      <option value="ar">Arabic</option>
                      <option value="pt">Portuguese</option>
                      <option value="zh">Chinese</option>
                    </select>
                  </label>
                </div>
                <div className={styles.toggleGrid}>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.allow_language_override)} onChange={(e) => setSettingsForm((p) => ({ ...p, allow_language_override: e.target.checked }))} />
                    <span>Allow candidate to change language</span>
                  </label>
                </div>
              </div>

              <div id="settings-attachments" className={styles.sectionCard}>
                <h4>Attachments</h4>
                <label>Attachment URLs (one per line)<textarea className={styles.codeArea} rows={4} disabled={lockedExamFields} value={settingsForm.attachment_urls} onChange={(e) => setSettingsForm((p) => ({ ...p, attachment_urls: e.target.value }))} placeholder="https://example.com/reference.pdf" /></label>
              </div>

              <div id="settings-externalattrs" className={styles.sectionCard}>
                <h4>External attributes (JSON)</h4>
                <p className={styles.muted}>Custom key-value metadata for integrations (e.g. LMS, HR system).</p>
                <textarea className={styles.codeArea} rows={5} disabled={lockedExamFields} value={settingsForm.external_attributes_json} onChange={(e) => setSettingsForm((p) => ({ ...p, external_attributes_json: e.target.value }))} placeholder={'{\n  "lms_course_id": "course_123",\n  "department": "Engineering"\n}'} />
              </div>

              <div id="settings-categories" className={styles.sectionCard}>
                <h4>Test categories</h4>
                <div className={styles.row}>
                  <label>Category
                    <select disabled={lockedExamFields} value={settingsForm.category_id} onChange={(e) => setSettingsForm((p) => ({ ...p, category_id: e.target.value }))}>
                      <option value="">-- None --</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div id="settings-advanced" className={styles.sectionCard}>
                <h4>Advanced settings (JSON)</h4>
                <textarea className={styles.codeArea} rows={8} disabled={lockedExamFields} value={settingsForm.settings_json} onChange={(e) => setSettingsForm((p) => ({ ...p, settings_json: e.target.value }))} />
              </div>

              <div id="settings-administration" className={styles.inlineActions}>
                <button type="button" className={styles.blueBtn} disabled={savingSettings || isArchived} onClick={handleSettingsSave}>{savingSettings ? 'Saving...' : 'Save settings'}</button>
                <button type="button" className={styles.ghostBtn} onClick={handleClose}>{isArchived ? 'Unarchive test' : 'Archive test'}</button>
                <button type="button" className={styles.ghostBtn} onClick={handleDuplicate}>Duplicate test</button>
              </div>
            </section>
          </>
        )}

        {tab === 'sections' && (
          <section className={styles.full}>
            <h3>Test sections - Questions</h3>
            <div className={styles.row}>
              <label>Search questions<input placeholder="Search text or type" value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} /></label>
              <label>Total questions<input readOnly value={String(questions.length)} /></label>
            </div>
            <form className={styles.sectionCard} onSubmit={handleQuestionSubmit}>
              <h4>{editingQuestionId ? 'Edit question' : 'Add question'}</h4>
              <div className={styles.row}>
                <label>Type
                  <select value={questionForm.question_type} disabled={lockedExamFields} onChange={(e) => handleQuestionTypeChange(e.target.value)}>
                    {QUESTION_TYPES.map((qt) => <option key={qt} value={qt}>{qt}</option>)}
                  </select>
                </label>
              </div>
              <label>Question text<textarea rows={3} value={questionForm.text} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, text: e.target.value }))} /></label>
              {questionForm.question_type === 'ORDERING' && (
                <div className={styles.typeHint}>Enter items in order, one per line. The correct order is top-to-bottom. Leave <em>correct_answer</em> blank (auto-derived).</div>
              )}
              {questionForm.question_type === 'FILLINBLANK' && (
                <div className={styles.typeHint}>Use <code>[blank]</code> in the question text as a placeholder. Enter each acceptable answer on its own line in the options field.</div>
              )}
              {questionForm.question_type === 'MATCHING' && (
                <div className={styles.typeHint}>Enter pairs as <code>Left | Right</code>, one pair per line (e.g., <em>Capital | Country</em>). Set correct_answer to the matched pair indices.</div>
              )}
              {questionForm.question_type === 'TEXT' && (
                <div className={styles.typeHint}>Open-ended text question. No options required. Enter a model/expected answer in correct_answer for reference grading.</div>
              )}
              {['MCQ', 'MULTI', 'TRUEFALSE', 'ORDERING', 'FILLINBLANK', 'MATCHING'].includes(questionForm.question_type) && (
                <label>
                  {questionForm.question_type === 'MATCHING' ? 'Pairs (Left | Right, one per line)' : questionForm.question_type === 'FILLINBLANK' ? 'Acceptable answers (one per line)' : 'Options (one per line)'}
                  <textarea rows={4} value={questionForm.options_text} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, options_text: e.target.value }))} />
                </label>
              )}
              <label>
                {questionForm.question_type === 'ORDERING' ? 'Correct order (comma-separated indices, e.g. 1,3,2)' : questionForm.question_type === 'MATCHING' ? 'Correct matching (e.g. A-1,B-2)' : 'Correct answer'}
                <input value={questionForm.correct_answer} disabled={lockedExamFields || questionForm.question_type === 'ORDERING'} onChange={(e) => setQuestionForm((p) => ({ ...p, correct_answer: e.target.value }))} />
              </label>
              <div className={styles.row}>
                <label>Points<input type="number" step="0.5" min="0.5" value={questionForm.points} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, points: e.target.value }))} /></label>
                <label>Order<input type="number" min="0" value={questionForm.order} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, order: e.target.value }))} /></label>
              </div>
              <div className={styles.inlineActions}>
                <button type="submit" className={styles.blueBtn} disabled={questionBusy || lockedExamFields}>{questionBusy ? 'Saving...' : editingQuestionId ? 'Update question' : 'Add question'}</button>
                <button type="button" className={styles.ghostBtn} onClick={resetQuestionForm}>Reset</button>
              </div>
            </form>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Order</th><th>Type</th><th>Question</th><th>Points</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredQuestions.length === 0 ? (
                    <tr><td colSpan={5}>No questions found.</td></tr>
                  ) : filteredQuestions.map((q) => (
                    <tr key={q.id}>
                      <td>{q.order ?? 0}</td>
                      <td>{questionTypeOf(q)}</td>
                      <td>{q.text}</td>
                      <td>{q.points ?? 1}</td>
                      <td className={styles.actionsCell}>
                        <button type="button" disabled={lockedExamFields || deletingQuestionBusyId === q.id} onClick={() => startEditQuestion(q)}>Edit</button>
                        {deleteQuestionId === q.id ? (
                          <>
                            <button
                              type="button"
                              className={styles.dangerInlineBtn}
                              disabled={lockedExamFields || deletingQuestionBusyId === q.id}
                              onClick={() => handleDeleteQuestion(q.id)}
                            >
                              {deletingQuestionBusyId === q.id ? 'Deleting...' : 'Confirm delete'}
                            </button>
                            <button type="button" disabled={deletingQuestionBusyId === q.id} onClick={() => setDeleteQuestionId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" disabled={lockedExamFields || deletingQuestionBusyId === q.id} onClick={() => handleDeleteQuestion(q.id)}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'sessions' && (
          <section className={styles.full}>
            <h3>Testing sessions</h3>
            <form className={styles.sectionCard} onSubmit={handleCreateSession}>
              <div className={styles.row}>
                <label>Learner
                  <select value={sessionForm.user_id} disabled={isArchived} onChange={(e) => setSessionForm((p) => ({ ...p, user_id: e.target.value }))}>
                    <option value="">Select learner</option>
                    {learners.map((u) => <option key={u.id} value={u.id}>{u.user_id} - {u.name}</option>)}
                  </select>
                </label>
                <label>Schedule date/time<input type="datetime-local" disabled={isArchived} value={sessionForm.scheduled_at} onChange={(e) => setSessionForm((p) => ({ ...p, scheduled_at: e.target.value }))} /></label>
              </div>
              <div className={styles.row}>
                <label>Access mode
                  <select value={sessionForm.access_mode} disabled={isArchived} onChange={(e) => setSessionForm((p) => ({ ...p, access_mode: e.target.value }))}>
                    <option value="OPEN">OPEN</option><option value="RESTRICTED">RESTRICTED</option>
                  </select>
                </label>
                <label>Notes<input value={sessionForm.notes} disabled={isArchived} onChange={(e) => setSessionForm((p) => ({ ...p, notes: e.target.value }))} /></label>
              </div>
              <p className={styles.muted}>Every testing session requires both a learner and a scheduled date/time.</p>
              <div className={styles.inlineActions}>
                <button type="submit" className={styles.blueBtn} disabled={sessionBusy || isArchived || !sessionFormReady}>
                  {sessionBusy ? 'Saving...' : 'Assign / Update session'}
                </button>
              </div>
            </form>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Session ID</th><th>User</th><th>Scheduled at</th><th>Access mode</th><th>Notes</th><th>Actions</th></tr></thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={6}>No sessions assigned yet.</td></tr>
                  ) : sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.id).slice(0, 8)}</td>
                      <td>{users.find((u) => String(u.id) === String(s.user_id))?.user_id || String(s.user_id).slice(0, 8)}</td>
                      <td>{new Date(s.scheduled_at).toLocaleString()}</td>
                      <td>{s.access_mode}</td>
                      <td>{s.notes || '-'}</td>
                      <td className={styles.actionsCell}>
                        {deleteSessionId === s.id ? (
                          <>
                            <button
                              type="button"
                              className={styles.dangerInlineBtn}
                              disabled={isArchived || deletingSessionBusyId === s.id}
                              onClick={() => handleDeleteSession(s.id)}
                            >
                              {deletingSessionBusyId === s.id ? 'Deleting...' : 'Confirm delete'}
                            </button>
                            <button type="button" disabled={deletingSessionBusyId === s.id} onClick={() => setDeleteSessionId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" disabled={isArchived || deletingSessionBusyId === s.id} onClick={() => handleDeleteSession(s.id)}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'candidates' && (
          <section className={styles.full}>
            <h3>Candidates</h3>
            <p className={styles.sectionDescription}>
              Assigned learners stay visible here even before they start the test, so the roster and attempt activity are tracked in one place.
            </p>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Attempt</th><th>User</th><th>Status</th><th>Started</th><th>Score</th><th>Review</th><th>High</th><th>Medium</th><th>Actions</th></tr></thead>
                <tbody>
                  {candidateRows.length === 0 ? (
                    <tr><td colSpan={9}>No learners or attempts are assigned to this test yet.</td></tr>
                  ) : candidateRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.attemptId}</td>
                      <td>{r.username}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${r.status === 'NOT_STARTED' ? styles.statusNeutral : r.needsManualReview ? styles.statusPending : r.status === 'GRADED' ? styles.statusGraded : styles.statusNeutral}`}>
                          {formatAttemptStatus(r)}
                        </span>
                      </td>
                      <td>{r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
                      <td>{formatScore(r.score)}</td>
                      <td>
                        <div className={styles.reviewCell}>
                          <div className={styles.reviewState}>{r.reviewState}</div>
                          {r.submittedAt && <div className={styles.reviewMeta}>Submitted {new Date(r.submittedAt).toLocaleString()}</div>}
                          {r.attemptIdFull && r.status !== 'IN_PROGRESS' ? (
                            <div className={styles.scoreEditor}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={gradeDrafts[r.id] ?? ''}
                                disabled={rowBusy[r.id]}
                                aria-label={`Grade for ${r.username}`}
                                onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              />
                              <button type="button" className={styles.blueBtn} disabled={rowBusy[r.id]} onClick={() => handleSaveGrade(r)}>
                                {rowBusy[r.id] ? 'Saving...' : r.status === 'GRADED' ? 'Update grade' : 'Save grade'}
                              </button>
                            </div>
                          ) : (
                            <div className={styles.reviewMeta}>
                              {r.attemptIdFull ? 'Submit required before grading' : 'Learner has not started this test yet'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{r.highAlerts}</td>
                      <td>{r.mediumAlerts}</td>
                      <td className={styles.actionsCell}>
                        <button type="button" disabled={rowBusy[r.id] || !r.attemptIdFull} onClick={() => handleOpenResult(r)}>Result</button>
                        <button type="button" disabled={rowBusy[r.id] || !r.attemptIdFull} onClick={() => navigate(`/admin/attempt-analysis?id=${r.attemptIdFull}`)}>Analyze</button>
                        <button type="button" onClick={() => handlePauseResume(r)} disabled={rowBusy[r.id] || !r.attemptIdFull}>{r.paused ? 'Resume' : 'Pause'}</button>
                        <button type="button" onClick={() => handleOpenVideo(r)} disabled={rowBusy[r.id] || !r.attemptIdFull}>Video</button>
                        <button type="button" onClick={() => handleOpenReport(r)} disabled={rowBusy[r.id] || !r.attemptIdFull}>{rowBusy[r.id] ? 'Opening...' : 'Report'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'proctoring' && (
          <section className={styles.full}>
            <h3>Proctoring</h3>
            <p className={styles.sectionDescription}>Review monitored attempts, special accommodations, and flagged activity for this test.</p>
            <div className={styles.row}>
              <label>Test<input value={exam.title || ''} readOnly /></label>
              <label>Testing session
                <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
                  <option value="">All testing sessions</option>
                  {sessions.map((s) => <option key={s.id} value={s.id}>{`Session ${String(s.id).slice(0, 6)}`}</option>)}
                </select>
              </label>
            </div>
            <div className={styles.summaryGrid}>
              {monitoringSummaryCards.map((card) => (
                <div key={card.label} className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>{card.label}</div>
                  <div className={styles.summaryValue}>{card.value}</div>
                  <div className={styles.summarySub}>{card.helper}</div>
                </div>
              ))}
            </div>
            <div className={styles.viewTabs}>
              <button type="button" className={view === 'candidate_monitoring' ? styles.viewActive : ''} onClick={() => setView('candidate_monitoring')}>Candidate monitoring</button>
              <button type="button" className={view === 'special_accommodations' ? styles.viewActive : ''} onClick={() => setView('special_accommodations')}>Special accommodations</button>
              <button type="button" className={view === 'special_requests' ? styles.viewActive : ''} onClick={() => setView('special_requests')}>Special requests</button>
            </div>

            {view === 'candidate_monitoring' && (
              <div className={styles.tableCard}>
                <div className={styles.tableToolbar}>
                  <div className={styles.tableMeta}>
                    Showing {filteredRows.length} attempt{filteredRows.length !== 1 ? 's' : ''} across {attemptRows.length} loaded.
                  </div>
                  <div className={styles.tableActions}>
                    <button type="button" onClick={() => handleBulkPauseResume(true)} disabled={bulkBusy || filteredRows.length === 0}>
                      {bulkBusy && bulkAction === 'pause' ? 'Pausing...' : 'Pause session'}
                    </button>
                    <button type="button" onClick={() => handleBulkPauseResume(false)} disabled={bulkBusy || filteredRows.length === 0}>
                      {bulkBusy && bulkAction === 'resume' ? 'Resuming...' : 'Resume session'}
                    </button>
                    <button type="button" onClick={() => void loadAll(false)} disabled={loading}>
                      {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button type="button" onClick={clearMonitoringFilters} disabled={!monitoringHasFilters}>
                      Clear filters
                    </button>
                    <button type="button" className={styles.blueBtn} onClick={() => navigate(`/admin/videos?exam_id=${id}`)}>Open supervision mode</button>
                    <button type="button" onClick={() => setShowFilters((s) => !s)}>{showFilters ? 'Hide filters' : 'Filter'}</button>
                  </div>
                </div>
                {filteredRows.length === 0 ? (
                  <div className={styles.emptyPanel}>
                    <div className={styles.emptyTitle}>
                      {monitoringHasFilters ? 'No attempts match the current monitoring filters.' : 'No test attempts yet.'}
                    </div>
                    <div className={styles.emptyText}>
                      {monitoringHasFilters
                        ? 'Clear the current session or column filters to restore the full monitoring list.'
                        : 'Attempts will appear here once learners begin this test.'}
                    </div>
                    {monitoringHasFilters && (
                      <button type="button" className={styles.ghostBtn} onClick={clearMonitoringFilters}>
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Actions</th><th>Attempt ID</th><th>Username</th><th>Testing session</th><th>Status</th><th>Started</th><th>Access</th><th>Comment</th><th>Proctor rate</th></tr>
                      {showFilters && (
                        <tr>
                          <th></th>
                          <th><input placeholder="Search" value={search.attempt} onChange={(e) => setSearch((p) => ({ ...p, attempt: e.target.value }))} /></th>
                          <th><input placeholder="Search" value={search.user} onChange={(e) => setSearch((p) => ({ ...p, user: e.target.value }))} /></th>
                          <th><input placeholder="Search" value={search.session} onChange={(e) => setSearch((p) => ({ ...p, session: e.target.value }))} /></th>
                          <th><select value={search.status} onChange={(e) => setSearch((p) => ({ ...p, status: e.target.value }))}><option value="">Select one</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="PAUSED">PAUSED</option><option value="SUBMITTED">SUBMITTED</option><option value="GRADED">GRADED</option></select></th>
                          <th></th>
                          <th><input placeholder="Search" value={search.group} onChange={(e) => setSearch((p) => ({ ...p, group: e.target.value }))} /></th>
                          <th><input placeholder="Search" value={search.comment} onChange={(e) => setSearch((p) => ({ ...p, comment: e.target.value }))} /></th>
                          <th></th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.id}>
                          <td className={styles.actionsCell}>
                            <button type="button" onClick={() => handlePauseResume(r)} disabled={rowBusy[r.id]}>{r.paused ? 'Resume' : 'Pause'}</button>
                            <button type="button" onClick={() => handleOpenReport(r)} disabled={rowBusy[r.id]}>{rowBusy[r.id] ? 'Opening...' : 'Report'}</button>
                            <button type="button" onClick={() => handleOpenVideo(r)} disabled={rowBusy[r.id]} className={r.hasVideo ? styles.videoBtnGreen : styles.videoBtnRed}>Video</button>
                          </td>
                          <td>{r.attemptId}</td><td>{r.username}</td><td>{r.sessionName}</td><td>{r.paused ? 'PAUSED' : r.status}</td>
                          <td>{r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td><td>{r.userGroup}</td><td>{r.comment || '-'}</td><td>{r.proctorRate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {view === 'special_accommodations' && (
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead><tr><th>Session</th><th>User</th><th>Access mode</th><th>Notes</th><th>Scheduled at</th><th>Actions</th></tr></thead>
                  <tbody>
                    {sessions.length === 0 ? <tr><td colSpan={6}>No session accommodations configured.</td></tr> : sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{String(s.id).slice(0, 8)}</td>
                        <td>{users.find((u) => String(u.id) === String(s.user_id))?.user_id || String(s.user_id).slice(0, 8)}</td>
                        {editingAccomId === s.id ? (
                          <>
                            <td>
                              <select value={editingAccomForm.access_mode} onChange={(e) => setEditingAccomForm((p) => ({ ...p, access_mode: e.target.value }))}>
                                <option value="OPEN">OPEN</option>
                                <option value="RESTRICTED">RESTRICTED</option>
                              </select>
                            </td>
                            <td><input value={editingAccomForm.notes} onChange={(e) => setEditingAccomForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" /></td>
                            <td><input type="datetime-local" value={editingAccomForm.scheduled_at} onChange={(e) => setEditingAccomForm((p) => ({ ...p, scheduled_at: e.target.value }))} /></td>
                            <td className={styles.actionsCell}>
                              <button
                                type="button"
                                className={styles.blueBtn}
                                disabled={savingAccomId === s.id || !editingAccomForm.scheduled_at}
                                onClick={() => handleSaveAccom(s.id)}
                              >
                                {savingAccomId === s.id ? 'Saving...' : 'Save'}
                              </button>
                              <button type="button" disabled={savingAccomId === s.id} onClick={() => setEditingAccomId(null)}>Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{s.access_mode}</td>
                            <td>{s.notes || '-'}</td>
                            <td>{new Date(s.scheduled_at).toLocaleString()}</td>
                            <td className={styles.actionsCell}>
                              <button type="button" disabled={isArchived} onClick={() => startEditAccom(s)}>Edit</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {view === 'special_requests' && (
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead><tr><th>Attempt</th><th>User</th><th>High alerts</th><th>Medium alerts</th><th>Actions</th></tr></thead>
                  <tbody>
                    {attemptRows.filter((r) => r.highAlerts > 0 || r.mediumAlerts > 0).length === 0 ? <tr><td colSpan={5}>No flagged requests available.</td></tr> : attemptRows.filter((r) => r.highAlerts > 0 || r.mediumAlerts > 0).map((r) => (
                      <tr key={r.id}>
                        <td>{r.attemptId}</td><td>{r.username}</td><td>{r.highAlerts}</td><td>{r.mediumAlerts}</td>
                        <td className={styles.actionsCell}>
                          <button type="button" disabled={rowBusy[r.id]} onClick={() => navigate(`/admin/attempt-analysis?id=${r.id}`)}>Analyze</button>
                          <button type="button" disabled={rowBusy[r.id]} onClick={() => handleOpenVideo(r)}>Inspect video</button>
                          <button type="button" disabled={rowBusy[r.id]} onClick={() => handleOpenReport(r)}>
                            {rowBusy[r.id] ? 'Opening...' : 'Open report'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'administration' && (
          <section className={styles.full}>
            <h3>Test administration</h3>
            <div className={styles.sectionCard}>
              <div className={styles.row}>
                <label>Current status<input value={exam.status || ''} readOnly /></label>
                <label>Total attempts<input value={String(attemptRows.length)} readOnly /></label>
              </div>
              <div className={styles.inlineActions}>
                <button type="button" className={styles.blueBtn} disabled={isArchived || deletingExamBusy} onClick={handleSettingsSave}>Save settings</button>
                {!isPublished && !isArchived ? <button type="button" className={styles.greenBtn} disabled={deletingExamBusy} onClick={handlePublish}>Open / Publish</button> : null}
                <button type="button" className={styles.ghostBtn} disabled={deletingExamBusy} onClick={handleClose}>{isArchived ? 'Unarchive' : 'Archive'}</button>
                <button type="button" className={styles.ghostBtn} disabled={lockedExamFields || deletingExamBusy} onClick={() => navigate(`/admin/tests/${exam.id}/edit`)}>Open full editor</button>
                {deleteExamConfirm ? (
                  <>
                    <button type="button" className={styles.dangerBtn} disabled={deletingExamBusy} onClick={handleDeleteExam}>
                      {deletingExamBusy ? 'Deleting...' : 'Confirm delete'}
                    </button>
                    <button type="button" className={styles.ghostBtn} disabled={deletingExamBusy} onClick={() => setDeleteExamConfirm(false)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className={styles.dangerBtn} disabled={deletingExamBusy} onClick={handleDeleteExam}>Delete test</button>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === 'reports' && (
          <section className={styles.full}>
            <h3>Reports</h3>
            <div className={styles.sectionCard}>
              <div className={styles.inlineActions}>
                <button type="button" className={styles.blueBtn} disabled={reportsBusy} onClick={downloadExamCsv}>Download Test CSV</button>
                <button type="button" className={styles.blueBtn} disabled={reportsBusy} onClick={downloadExamPdf}>Download Test PDF</button>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Attempt</th><th>User</th><th>Status</th><th>High</th><th>Medium</th><th>Actions</th></tr></thead>
                <tbody>
                  {attemptRows.length === 0 ? <tr><td colSpan={6}>No attempts available for reporting.</td></tr> : attemptRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.attemptId}</td><td>{r.username}</td><td>{r.paused ? 'PAUSED' : r.status}</td><td>{r.highAlerts}</td><td>{r.mediumAlerts}</td>
                      <td className={styles.actionsCell}>
                        <button type="button" disabled={rowBusy[r.id]} onClick={() => handleOpenReport(r)}>
                          {rowBusy[r.id] ? 'Opening...' : 'Attempt report'}
                        </button>
                        <button type="button" disabled={rowBusy[r.id]} onClick={() => handleOpenVideo(r)}>Video</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
