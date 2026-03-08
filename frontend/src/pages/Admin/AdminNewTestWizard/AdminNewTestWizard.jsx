import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { generateQuestionsAI } from '../../../services/ai.service'
import { normalizeProctoringConfig } from '../../../utils/proctoringRequirements'
import ExamQuestionPanel from '../ExamQuestionPanel/ExamQuestionPanel'
import styles from './AdminNewTestWizard.module.scss'

const STEPS = [
  { id: 0, label: 'Information' },
  { id: 1, label: 'Method' },
  { id: 2, label: 'Proctoring' },
  { id: 3, label: 'Questions' },
  { id: 4, label: 'Grading' },
  { id: 5, label: 'Certificates' },
  { id: 6, label: 'Review' },
  { id: 7, label: 'Sessions' },
  { id: 8, label: 'Save Test' },
]

const QUESTION_TYPES = [
  { value: 'MCQ', label: 'Single Choice' },
  { value: 'MULTI', label: 'Multiple Choice' },
  { value: 'TEXT', label: 'Essay' },
  { value: 'TRUEFALSE', label: 'True / False' },
  { value: 'ORDERING', label: 'Ordering' },
  { value: 'FILLINBLANK', label: 'Fill in the Blanks' },
  { value: 'MATCHING', label: 'Matching' },
]

const CERTIFICATE_TEMPLATES = ['Classic', 'Modern', 'Simple']

const DETECTORS = [
  { key: 'face_detection', label: 'Face Detection', desc: 'Detect presence and count of faces' },
  { key: 'multi_face', label: 'Multi-Face Alert', desc: 'Alert when multiple faces detected' },
  { key: 'audio_detection', label: 'Audio Detection', desc: 'Detect speech and noise' },
  { key: 'object_detection', label: 'Object Detection', desc: 'Detect forbidden objects (phone, book)' },
  { key: 'eye_tracking', label: 'Eye Tracking', desc: 'Detect gaze deviation from screen' },
  { key: 'head_pose_detection', label: 'Head Pose Detection', desc: 'Detect sustained head turns and posture changes' },
  { key: 'mouth_detection', label: 'Mouth Movement', desc: 'Detect talking during exam' },
]

const DEFAULT_PROCTORING_CONFIG = normalizeProctoringConfig({
  face_detection: true,
  multi_face: true,
  audio_detection: true,
  object_detection: true,
  eye_tracking: true,
  head_pose_detection: true,
  mouth_detection: false,
  face_verify: true,
  fullscreen_enforce: true,
  tab_switch_detect: true,
  screen_capture: false,
  copy_paste_block: true,
  alert_rules: [],
  eye_deviation_deg: 12,
  mouth_open_threshold: 0.35,
  audio_rms_threshold: 0.08,
  max_face_absence_sec: 5,
  max_tab_blurs: 3,
  max_alerts_before_autosubmit: 5,
  lighting_min_score: 0.35,
  face_verify_id_threshold: 0.18,
  max_score_before_autosubmit: 15,
  frame_interval_ms: 3000,
  audio_chunk_ms: 3000,
  screenshot_interval_sec: 60,
  face_verify_threshold: 0.15,
  cheating_consecutive_frames: 5,
  head_pose_consecutive: 5,
  eye_consecutive: 5,
  head_pose_yaw_deg: 20,
  head_pose_pitch_deg: 20,
  object_confidence_threshold: 0.5,
  audio_consecutive_chunks: 2,
  audio_window: 5,
})

const PROCTORING_REQUIREMENTS = [
  { key: 'identity_required', label: 'Identity verification', desc: 'Require selfie and ID checks before the learner enters the attempt.' },
  { key: 'camera_required', label: 'Camera required', desc: 'Block the journey if the camera is unavailable.' },
  { key: 'mic_required', label: 'Microphone required', desc: 'Block the journey if the microphone is unavailable.' },
  { key: 'lighting_required', label: 'Lighting check', desc: 'Require the webcam feed to pass the minimum lighting score.' },
  { key: 'fullscreen_enforce', label: 'Fullscreen lock', desc: 'Require fullscreen during the active attempt.' },
  { key: 'tab_switch_detect', label: 'Tab / blur detection', desc: 'Track focus loss, tab switches, and hidden pages.' },
  { key: 'copy_paste_block', label: 'Clipboard blocking', desc: 'Disable copy and paste shortcuts during the attempt.' },
  { key: 'screen_capture', label: 'Periodic screen capture', desc: 'Capture timed screen snapshots for later review.' },
]

const PROCTORING_CONTROL_GROUPS = [
  {
    key: 'identity',
    title: 'Identity & environment thresholds',
    description: 'Tune how strict the journey checks are before the learner can start.',
    controls: [
      { key: 'max_face_absence_sec', label: 'Face absence grace period', desc: 'Lower is stricter. Missing faces trigger alerts sooner.', min: 1, max: 15, step: 1, unit: 'sec', enabledBy: 'face_detection' },
      { key: 'lighting_min_score', label: 'Minimum lighting score', desc: 'Higher is stricter. Darker rooms will fail the precheck.', min: 0.1, max: 0.8, step: 0.05, unit: 'score', enabledBy: 'lighting_required' },
      { key: 'face_verify_id_threshold', label: 'ID verification distance', desc: 'Lower is stricter. Tightens selfie-to-ID matching.', min: 0.05, max: 0.4, step: 0.01, unit: 'distance', enabledBy: 'identity_required' },
      { key: 'face_verify_threshold', label: 'Live face verification distance', desc: 'Lower is stricter. Tightens ongoing face verification.', min: 0.05, max: 0.35, step: 0.01, unit: 'distance', enabledBy: 'identity_required' },
      { key: 'object_confidence_threshold', label: 'Forbidden object confidence', desc: 'Higher is stricter. Require stronger model confidence before flagging objects.', min: 0.1, max: 0.95, step: 0.05, unit: 'confidence', enabledBy: 'object_detection' },
    ],
  },
  {
    key: 'attention',
    title: 'Attention & movement sensitivity',
    description: 'Control how aggressively gaze, posture, speech, and mouth movement are flagged.',
    controls: [
      { key: 'eye_deviation_deg', label: 'Eye deviation angle', desc: 'Lower is stricter. Smaller gaze drift triggers alerts.', min: 6, max: 25, step: 1, unit: 'deg', enabledBy: 'eye_tracking' },
      { key: 'eye_consecutive', label: 'Eye consecutive frames', desc: 'Lower is stricter. Fewer frames are needed before flagging.', min: 1, max: 12, step: 1, unit: 'frames', enabledBy: 'eye_tracking' },
      { key: 'head_pose_yaw_deg', label: 'Head yaw tolerance', desc: 'Lower is stricter. Smaller side turns count as suspicious.', min: 8, max: 35, step: 1, unit: 'deg', enabledBy: 'head_pose_detection' },
      { key: 'head_pose_pitch_deg', label: 'Head pitch tolerance', desc: 'Lower is stricter. Smaller up/down head motion is flagged.', min: 8, max: 35, step: 1, unit: 'deg', enabledBy: 'head_pose_detection' },
      { key: 'head_pose_consecutive', label: 'Head pose consecutive frames', desc: 'Lower is stricter. Head pose changes trigger sooner.', min: 1, max: 12, step: 1, unit: 'frames', enabledBy: 'head_pose_detection' },
      { key: 'mouth_open_threshold', label: 'Mouth movement threshold', desc: 'Lower is stricter. Smaller mouth motion can trigger talking alerts.', min: 0.1, max: 0.8, step: 0.05, unit: 'ratio', enabledBy: 'mouth_detection' },
      { key: 'audio_rms_threshold', label: 'Audio RMS threshold', desc: 'Lower is stricter. Quieter noise can trigger audio alerts.', min: 0.02, max: 0.25, step: 0.01, unit: 'rms', enabledBy: 'audio_detection' },
      { key: 'audio_consecutive_chunks', label: 'Audio consecutive chunks', desc: 'Lower is stricter. Fewer noisy chunks are needed before alerting.', min: 1, max: 6, step: 1, unit: 'chunks', enabledBy: 'audio_detection' },
      { key: 'audio_window', label: 'Audio anomaly window', desc: 'How many recent chunks are considered when detecting sustained audio anomalies.', min: 3, max: 10, step: 1, unit: 'chunks', enabledBy: 'audio_detection' },
    ],
  },
  {
    key: 'enforcement',
    title: 'Enforcement & auto-submit',
    description: 'Define when repeated violations should escalate to an automatic submission.',
    controls: [
      { key: 'max_tab_blurs', label: 'Maximum tab switches', desc: 'Lower is stricter. The attempt can auto-submit after fewer focus losses.', min: 1, max: 10, step: 1, unit: 'switches', enabledBy: 'tab_switch_detect' },
      { key: 'max_alerts_before_autosubmit', label: 'Maximum alert count', desc: 'Auto-submit after this many alerts are logged.', min: 1, max: 20, step: 1, unit: 'alerts' },
      { key: 'max_score_before_autosubmit', label: 'Maximum violation score', desc: 'Auto-submit after the weighted violation score crosses this number.', min: 3, max: 40, step: 1, unit: 'score' },
      { key: 'cheating_consecutive_frames', label: 'Base consecutive-frame fallback', desc: 'Fallback consecutive frame count shared by sustained detectors.', min: 1, max: 12, step: 1, unit: 'frames' },
    ],
  },
  {
    key: 'capture',
    title: 'Capture cadence & evidence',
    description: 'Control how often visual/audio evidence is sampled and sent for analysis.',
    controls: [
      { key: 'frame_interval_ms', label: 'Frame analysis interval', desc: 'Higher saves bandwidth. Lower gives denser monitoring.', min: 1200, max: 6000, step: 200, unit: 'ms' },
      { key: 'audio_chunk_ms', label: 'Audio chunk interval', desc: 'Higher sends fewer but larger audio chunks.', min: 1000, max: 6000, step: 250, unit: 'ms', enabledBy: 'audio_detection' },
      { key: 'screenshot_interval_sec', label: 'Screen capture interval', desc: 'Only used when periodic screen capture is enabled.', min: 15, max: 180, step: 5, unit: 'sec', enabledBy: 'screen_capture' },
    ],
  },
]

const PROCTORING_LABELS = Object.fromEntries([
  ...DETECTORS.map((detector) => [detector.key, detector.label]),
  ...PROCTORING_REQUIREMENTS.map((control) => [control.key, control.label]),
])

const ALERT_RULE_EVENT_OPTIONS = [
  { value: 'FULLSCREEN_EXIT', label: 'Fullscreen exit', desc: 'Learner exits fullscreen during the attempt.', requires: ['fullscreen_enforce'] },
  { value: 'ALT_TAB', label: 'Tab switch', desc: 'Browser loses focus because the learner switched tabs or apps.', requires: ['tab_switch_detect'] },
  { value: 'FOCUS_LOSS', label: 'Focus loss', desc: 'The test window loses focus or becomes hidden.', requires: ['tab_switch_detect'] },
  { value: 'CAMERA_COVERED', label: 'Camera covered', desc: 'The webcam feed is blocked or too dark.', requires: ['camera_required'] },
  { value: 'FACE_DISAPPEARED', label: 'No face detected', desc: 'The learner moves out of frame for too long.', requires: ['face_detection'] },
  { value: 'MULTIPLE_FACES', label: 'Multiple faces', desc: 'More than one face appears in the camera view.', requires: ['multi_face'] },
  { value: 'FACE_MISMATCH', label: 'Face mismatch', desc: 'Live face does not match the verified identity sample.', requires: ['face_verify'] },
  { value: 'LOUD_AUDIO', label: 'Loud audio', desc: 'Sudden loud noise or speech is detected.', requires: ['audio_detection'] },
  { value: 'AUDIO_ANOMALY', label: 'Audio anomaly', desc: 'Repeated suspicious audio activity is detected.', requires: ['audio_detection'] },
  { value: 'FORBIDDEN_OBJECT', label: 'Forbidden object', desc: 'Phone, book, or other forbidden object is detected.', requires: ['object_detection'] },
  { value: 'EYE_MOVEMENT', label: 'Eye movement', desc: 'Gaze deviates away from the screen for too long.', requires: ['eye_tracking'] },
  { value: 'HEAD_POSE', label: 'Head pose', desc: 'The learner turns away or changes head pose suspiciously.', requires: ['head_pose_detection'] },
  { value: 'MOUTH_MOVEMENT', label: 'Mouth movement', desc: 'Talking or sustained mouth movement is detected.', requires: ['mouth_detection'] },
]

const ALERT_RULE_ACTIONS = [
  { value: 'FLAG_REVIEW', label: 'Flag for review' },
  { value: 'WARN', label: 'Warn learner' },
  { value: 'AUTO_SUBMIT', label: 'Auto-submit exam' },
]

const ALERT_RULE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH']
const ALERT_RULE_ACTION_HELPERS = {
  FLAG_REVIEW: 'Creates a proctoring escalation event for admins to review later.',
  WARN: 'Shows a live warning to the learner and keeps the exam running.',
  AUTO_SUBMIT: 'Immediately submits the exam when the rule threshold is reached.',
}

function humanizeSettingLabel(value) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function createAlertRule(seed = {}) {
  const id = seed.id || `rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return {
    id,
    event_type: seed.event_type || 'FULLSCREEN_EXIT',
    threshold: Number.isFinite(Number(seed.threshold)) ? Math.max(1, Number(seed.threshold)) : 1,
    severity: seed.severity || 'HIGH',
    action: seed.action || 'WARN',
    message: seed.message || '',
  }
}

function describeAlertRule(rule) {
  const option = ALERT_RULE_EVENT_OPTIONS.find((item) => item.value === rule.event_type)
  const action = ALERT_RULE_ACTIONS.find((item) => item.value === rule.action)
  return `${option?.label || humanizeSettingLabel(rule.event_type || 'Alert')} x${rule.threshold} -> ${action?.label || rule.action} (${rule.severity})`
}

export default function AdminNewTestWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { id: paramId } = useParams()
  const editId = searchParams.get('edit') || paramId
  const autosaveTimerRef = useRef(null)

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [examId, setExamId] = useState(editId || null)
  const [editorLocked, setEditorLocked] = useState(false)

  /* ─── Step 0: Information ─── */
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [examCode, setExamCode] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [nodes, setNodes] = useState([])
  const [nodeId, setNodeId] = useState('')
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [showCourseCreator, setShowCourseCreator] = useState(false)
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseDescription, setNewCourseDescription] = useState('')
  const [newModuleTitle, setNewModuleTitle] = useState('Module 1')
  const [examTemplates, setExamTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')

  /* ─── Step 1: Method ─── */
  const [method, setMethod] = useState('manual') // 'manual' | 'generator'
  const [generatorBy, setGeneratorBy] = useState('difficulty') // 'difficulty' | 'category'
  const [generatorCount, setGeneratorCount] = useState(20)
  const [generatorDifficultyMix, setGeneratorDifficultyMix] = useState({ easy: 40, medium: 40, hard: 20 })
  const [generatorCategories, setGeneratorCategories] = useState([])
  const [generatorPools, setGeneratorPools] = useState([])
  const [generatorTagsInclude, setGeneratorTagsInclude] = useState('')
  const [generatorTagsExclude, setGeneratorTagsExclude] = useState('')
  const [generatorUniquePerCandidate, setGeneratorUniquePerCandidate] = useState(true)
  const [generatorVersionCount, setGeneratorVersionCount] = useState(3)
  const [generatorRandomSeed, setGeneratorRandomSeed] = useState('')
  const [generatorPreventReuse, setGeneratorPreventReuse] = useState(true)
  const [generatorShuffleAnswers, setGeneratorShuffleAnswers] = useState(true)
  const [generatorAdaptive, setGeneratorAdaptive] = useState(false)

  /* ─── Step 2: Settings ─── */
  const [examType, setExamType] = useState('MCQ')
  const [pageFormat, setPageFormat] = useState('one_per_page')
  const [calculatorType, setCalculatorType] = useState('none')
  const [hideMetadata, setHideMetadata] = useState(false)
  const [randomizeQuestions, setRandomizeQuestions] = useState(false)
  const [randomizeAnswers, setRandomizeAnswers] = useState(false)
  const [showProgressBar, setShowProgressBar] = useState(true)
  const [unlimitedTime, setUnlimitedTime] = useState(false)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60)
  const [proctoring, setProctoring] = useState(DEFAULT_PROCTORING_CONFIG)
  const [proctoringView, setProctoringView] = useState('proctoring_settings')
  const [proctoringSessionId, setProctoringSessionId] = useState('')
  const [proctoringLoading, setProctoringLoading] = useState(false)
  const [proctoringRows, setProctoringRows] = useState([])
  const [proctoringSessions, setProctoringSessions] = useState([])
  const [specialAccommodations, setSpecialAccommodations] = useState('')
  const [specialRequests, setSpecialRequests] = useState('')
  const [proctoringSearch, setProctoringSearch] = useState({
    attemptId: '',
    username: '',
    sessionName: '',
    status: '',
    userGroup: '',
    comment: '',
  })

  /* ─── Step 3: Questions ─── */
  const [questions, setQuestions] = useState([])
  const [pools, setPools] = useState([])
  const [selectedPool, setSelectedPool] = useState('')
  const [seedCount, setSeedCount] = useState(5)
  const [questionInitError, setQuestionInitError] = useState('')
  const [panelError, setPanelError] = useState('')

  /* ─── Step 4: Grading ─── */
  const [passingScore, setPassingScore] = useState(60)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [gradingScaleId, setGradingScaleId] = useState('')
  const [gradingScales, setGradingScales] = useState([])
  const [negativeMarking, setNegativeMarking] = useState(false)
  const [negMarkValue, setNegMarkValue] = useState(0.25)
  const [negMarkType, setNegMarkType] = useState('points')
  const [showFinalScore, setShowFinalScore] = useState(true)
  const [showQuestionScores, setShowQuestionScores] = useState(false)

  /* ─── Step 5: Certificates ─── */
  const [certEnabled, setCertEnabled] = useState(false)
  const [certTemplate, setCertTemplate] = useState('Classic')
  const [certOrientation, setCertOrientation] = useState('landscape')
  const [certTitle, setCertTitle] = useState('Certificate of Achievement')
  const [certSubtitle, setCertSubtitle] = useState('')
  const [certCompany, setCertCompany] = useState('')
  const [certSigner, setCertSigner] = useState('Examiner')
  const [certDescription, setCertDescription] = useState('This is to certify that the above named candidate has successfully completed the assessment.')

  /* ─── Step 7: Sessions ─── */
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [bulkLearnerInput, setBulkLearnerInput] = useState('')
  const [bulkLearnerFeedback, setBulkLearnerFeedback] = useState('')
  const [accessMode, setAccessMode] = useState('OPEN')
  const [scheduledAt, setScheduledAt] = useState('')
  const [assignedSessions, setAssignedSessions] = useState([])
  const [sessionBusy, setSessionBusy] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState('mixed')

  /* ─── Step 8: Save ─── */
  const [publishStatus, setPublishStatus] = useState('CLOSED')

  const toDateTimeLocalValue = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
    return local.toISOString().slice(0, 16)
  }

  const loadNodesForCourse = async (selectedCourseId, { createIfEmpty = false } = {}) => {
    if (!selectedCourseId) {
      setNodes([])
      setNodeId('')
      return []
    }
    try {
      const { data } = await adminApi.nodes(selectedCourseId)
      const nodeList = Array.isArray(data)
        ? data
        : typeof data === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(data)
                if (Array.isArray(parsed)) return parsed
                return parsed ? [parsed] : []
              } catch {
                return []
              }
            })()
          : data
            ? [data]
            : []
      if (nodeList.length) {
        setNodes(nodeList)
        setNodeId((prev) => (
          prev && nodeList.some((node) => String(node.id) === String(prev))
            ? prev
            : nodeList[0].id
        ))
        return nodeList
      }
      if (createIfEmpty) {
        const { data: node } = await adminApi.createNode({ course_id: selectedCourseId, title: 'Module 1', order: 0 })
        setNodes([node])
        setNodeId(node.id)
        return [node]
      }
      setNodes([])
      setNodeId('')
      return []
    } catch {
      setNodes([])
      setNodeId('')
      return []
    }
  }

  const loadAssignedSessions = useCallback(async (targetExamId = examId) => {
    if (!targetExamId) {
      setAssignedSessions([])
      setSelectedUsers([])
      setAccessMode('OPEN')
      setScheduledAt('')
      return
    }
    try {
      const { data } = await adminApi.schedules()
      const examSchedules = (data || []).filter((schedule) => String(schedule.exam_id) === String(targetExamId))
      const nextAssigned = examSchedules.map((schedule) => {
        const learner = users.find((user) => String(user.id) === String(schedule.user_id))
        return {
          id: schedule.id,
          userId: schedule.user_id,
          user: learner?.user_id || learner?.name || String(schedule.user_id).slice(0, 8),
          mode: schedule.access_mode || 'OPEN',
          at: schedule.scheduled_at || '',
        }
      })
      setAssignedSessions(nextAssigned)
      setSelectedUsers(examSchedules.map((schedule) => schedule.user_id))
      if (examSchedules.length > 0) {
        const firstSchedule = examSchedules[0]
        setAccessMode(firstSchedule.access_mode || 'OPEN')
        const sameScheduleTime = examSchedules.every((schedule) => String(schedule.scheduled_at || '') === String(firstSchedule.scheduled_at || ''))
        setScheduledAt(sameScheduleTime ? toDateTimeLocalValue(firstSchedule.scheduled_at) : '')
      } else {
        setAccessMode('OPEN')
        setScheduledAt('')
      }
    } catch {
      setAssignedSessions([])
      setSelectedUsers([])
    }
  }, [examId, users])

  const handleCreateCourseInline = async () => {
    if (!newCourseTitle.trim()) {
      setPanelError('Enter a course title before creating one.')
      return
    }
    setCreatingCourse(true)
    setPanelError('')
    try {
      const { data: course } = await adminApi.createCourse({
        title: newCourseTitle.trim(),
        description: newCourseDescription.trim() || null,
        status: 'DRAFT',
      })
      const { data: node } = await adminApi.createNode({
        course_id: course.id,
        title: newModuleTitle.trim() || 'Module 1',
        order: 0,
      })
      setCourses((current) => [...current, course])
      setCourseId(course.id)
      setNodes([node])
      setNodeId(node.id)
      setShowCourseCreator(false)
      setNewCourseTitle('')
      setNewCourseDescription('')
      setNewModuleTitle('Module 1')
    } catch (e) {
      setPanelError(e.response?.data?.detail || 'Failed to create the course. Please try again.')
    } finally {
      setCreatingCourse(false)
    }
  }

  /* ─── Load lookups ─── */
  useEffect(() => {
    Promise.all([
      adminApi.courses(),
      adminApi.categories(),
      adminApi.gradingScales(),
      adminApi.questionPools(),
      adminApi.users(),
      adminApi.examTemplates(),
    ]).then(([courseRes, catRes, gsRes, poolRes, userRes, tplRes]) => {
      const courseList = courseRes.data || []
      setCourses(courseList)
      setCategories(catRes.data || [])
      setGradingScales(gsRes.data || [])
      setPools(poolRes.data || [])
      setUsers((userRes.data || []).filter(u => u.role === 'LEARNER'))
      setExamTemplates(tplRes?.data || [])
      if (courseList.length) {
        const first = courseList[0]
        setCourseId((current) => current || first.id)
        if (!courseId) {
          loadNodesForCourse(first.id, { createIfEmpty: true })
        }
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!nodes.length) return
    setNodeId((current) => (
      current && nodes.some((node) => String(node.id) === String(current))
        ? current
        : nodes[0].id
    ))
  }, [nodes])

  /* ─── Load existing exam for edit ─── */
  useEffect(() => {
    if (!editId) return
    adminApi.getTest(editId).then(({ data: test }) => {
      if (!test) return
      setEditorLocked(test.status && test.status !== 'DRAFT')
      const runtimeSettings = test.runtime_settings || {}
      setTitle(test.name || '')
      setDescription(test.description || '')
      setExamCode(test.code || '')
      setExamType(test.type || 'MCQ')
      setCategoryId(test.category_id || '')
      setCourseId(test.course_id || '')
      setNodeId(test.node_id || '')
      if (test.course_id) {
        loadNodesForCourse(test.course_id, { createIfEmpty: true })
      }
      setPassingScore(test.passing_score ?? 60)
      setMaxAttempts(test.attempts_allowed ?? 1)
      setGradingScaleId(test.grading_scale_id || '')
      setPublishStatus(test.status === 'PUBLISHED' ? 'OPEN' : 'CLOSED')
      if (test.proctoring_config) setProctoring({ ...DEFAULT_PROCTORING_CONFIG, ...normalizeProctoringConfig(test.proctoring_config) })
      if (test.time_limit_minutes != null) {
        setUnlimitedTime(false)
        setTimeLimitMinutes(test.time_limit_minutes)
      } else {
        setUnlimitedTime(true)
      }
      setMethod(runtimeSettings.creation_method || 'manual')
      if (runtimeSettings.generator_config) {
        const g = runtimeSettings.generator_config
        if (g.strategy) setGeneratorBy(g.strategy)
        if (g.total_questions) setGeneratorCount(g.total_questions)
        if (g.difficulty_mix) setGeneratorDifficultyMix(g.difficulty_mix)
        if (g.categories) setGeneratorCategories(g.categories)
        if (g.pools) setGeneratorPools(g.pools)
        setGeneratorTagsInclude((g.include_tags || []).join(', '))
        setGeneratorTagsExclude((g.exclude_tags || []).join(', '))
        if (g.unique_per_candidate != null) setGeneratorUniquePerCandidate(!!g.unique_per_candidate)
        if (g.version_count) setGeneratorVersionCount(g.version_count)
        if (g.random_seed) setGeneratorRandomSeed(g.random_seed)
        if (g.prevent_question_reuse != null) setGeneratorPreventReuse(!!g.prevent_question_reuse)
        if (g.shuffle_answers != null) setGeneratorShuffleAnswers(!!g.shuffle_answers)
        if (g.adaptive != null) setGeneratorAdaptive(!!g.adaptive)
      }
      setPageFormat(runtimeSettings.page_format || 'one_per_page')
      setCalculatorType(runtimeSettings.calculator_type || 'none')
      setHideMetadata(!!runtimeSettings.hide_metadata)
      setRandomizeQuestions(!!runtimeSettings.randomize_questions)
      setRandomizeAnswers(!!runtimeSettings.randomize_answers)
      setShowProgressBar(runtimeSettings.show_progress_bar ?? true)
      setNegativeMarking(!!runtimeSettings.negative_marking)
      setNegMarkValue(runtimeSettings.neg_mark_value ?? 0.25)
      setNegMarkType(runtimeSettings.neg_mark_type || 'points')
      setShowFinalScore(runtimeSettings.show_final_score ?? true)
      setShowQuestionScores(!!runtimeSettings.show_question_scores)
      setSpecialAccommodations(runtimeSettings.special_accommodations || '')
      setSpecialRequests(runtimeSettings.special_requests || '')
      if (test.certificate) {
        setCertEnabled(true)
        setCertTemplate(test.certificate.template || 'Classic')
        setCertOrientation(test.certificate.orientation || 'landscape')
        setCertTitle(test.certificate.title || 'Certificate of Achievement')
        setCertSubtitle(test.certificate.subtitle || '')
        setCertCompany(test.certificate.issuer || '')
        setCertSigner(test.certificate.signer || 'Examiner')
        setCertDescription(test.certificate.description || 'This is to certify that the above named candidate has successfully completed the assessment.')
      } else {
        setCertEnabled(false)
      }
    }).catch(() => {})
    adminApi.getQuestions(editId).then(({ data }) => setQuestions(data || [])).catch(() => {})
  }, [editId])

  useEffect(() => {
    loadAssignedSessions(examId)
  }, [examId, users, loadAssignedSessions])

  useEffect(() => {
    if (step === 3 && !examId) {
      ensureExamCreated()
    }
  }, [step, examId])

  const applyTemplate = (tplId) => {
    const tpl = examTemplates.find(t => t.id === tplId)
    if (!tpl || !tpl.config) return
    const cfg = tpl.config
    setTitle(cfg.title || title)
    setDescription(cfg.description || description)
    if (cfg.exam_type) setExamType(cfg.exam_type)
    if (cfg.category_id) setCategoryId(cfg.category_id)
    if (cfg.time_limit_minutes != null) { setUnlimitedTime(false); setTimeLimitMinutes(cfg.time_limit_minutes) }
    if (cfg.max_attempts != null) setMaxAttempts(cfg.max_attempts)
    if (cfg.passing_score != null) setPassingScore(cfg.passing_score)
    if (cfg.proctoring_config) setProctoring({ ...DEFAULT_PROCTORING_CONFIG, ...normalizeProctoringConfig(cfg.proctoring_config) })
    if (cfg.settings) {
      setRandomizeQuestions(!!cfg.settings.randomize_questions)
      setRandomizeAnswers(!!cfg.settings.randomize_answers)
      setShowProgressBar(cfg.settings.show_progress_bar ?? showProgressBar)
      setSpecialAccommodations(cfg.settings.special_accommodations || '')
      setSpecialRequests(cfg.settings.special_requests || '')
      if (cfg.settings.creation_method) setMethod(cfg.settings.creation_method)
      if (cfg.settings.generator_config) {
        const g = cfg.settings.generator_config
        if (g.strategy) setGeneratorBy(g.strategy)
        if (g.total_questions) setGeneratorCount(g.total_questions)
        if (g.difficulty_mix) setGeneratorDifficultyMix(g.difficulty_mix)
        if (g.categories) setGeneratorCategories(g.categories)
        if (g.pools) setGeneratorPools(g.pools)
        if (g.include_tags) setGeneratorTagsInclude((g.include_tags || []).join(', '))
        if (g.exclude_tags) setGeneratorTagsExclude((g.exclude_tags || []).join(', '))
        if (g.unique_per_candidate != null) setGeneratorUniquePerCandidate(!!g.unique_per_candidate)
        if (g.version_count) setGeneratorVersionCount(g.version_count)
        if (g.random_seed) setGeneratorRandomSeed(g.random_seed)
        if (g.prevent_question_reuse != null) setGeneratorPreventReuse(!!g.prevent_question_reuse)
        if (g.shuffle_answers != null) setGeneratorShuffleAnswers(!!g.shuffle_answers)
        if (g.adaptive != null) setGeneratorAdaptive(!!g.adaptive)
      }
    }
    if (cfg.certificate) {
      setCertEnabled(true)
      setCertTitle(cfg.certificate.title || certTitle)
      setCertSubtitle(cfg.certificate.subtitle || certSubtitle)
      setCertCompany(cfg.certificate.issuer || certCompany)
      setCertSigner(cfg.certificate.signer || certSigner)
    }
  }

  const buildRuntimeSettings = () => ({
      creation_method: method,
      generator_config: method === 'generator' ? {
        strategy: generatorBy,
        total_questions: generatorCount,
        difficulty_mix: generatorDifficultyMix,
        categories: generatorCategories,
        pools: generatorPools,
        include_tags: generatorTagsInclude.split(',').map(t => t.trim()).filter(Boolean),
        exclude_tags: generatorTagsExclude.split(',').map(t => t.trim()).filter(Boolean),
        unique_per_candidate: generatorUniquePerCandidate,
        version_count: generatorVersionCount,
        random_seed: generatorRandomSeed || null,
        prevent_question_reuse: generatorPreventReuse,
        shuffle_answers: generatorShuffleAnswers,
        adaptive: generatorAdaptive,
      } : null,
      page_format: pageFormat,
      calculator_type: calculatorType,
      hide_metadata: hideMetadata,
      randomize_questions: randomizeQuestions,
      randomize_answers: randomizeAnswers,
      show_progress_bar: showProgressBar,
      negative_marking: negativeMarking,
      neg_mark_value: negMarkValue,
      neg_mark_type: negMarkType,
      show_final_score: showFinalScore,
      show_question_scores: showQuestionScores,
      special_accommodations: specialAccommodations,
      special_requests: specialRequests,
    })

  const buildCertificate = () => (certEnabled ? {
      template: certTemplate,
      orientation: certOrientation,
      title: certTitle,
      subtitle: certSubtitle,
      issuer: certCompany,
      signer: certSigner,
      description: certDescription,
    } : null)

  const buildTestPayload = () => ({
    code: examCode || null,
    name: title,
    description,
    type: examType,
    node_id: nodeId || undefined,
    category_id: categoryId || undefined,
    grading_scale_id: gradingScaleId || undefined,
    time_limit_minutes: unlimitedTime ? null : timeLimitMinutes,
    attempts_allowed: maxAttempts,
    passing_score: passingScore,
    randomize_questions: randomizeQuestions,
    runtime_settings: buildRuntimeSettings(),
    proctoring_config: normalizeProctoringConfig(proctoring),
    certificate: buildCertificate(),
  })

  const saveExam = async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    const data = buildTestPayload()
    let id = examId
    if (examId) {
      await adminApi.updateTest(examId, data)
    } else {
      const res = await adminApi.createTest(data)
      setExamId(res.data.id)
      id = res.data.id
    }
    return id
  }

  const ensureExamCreated = async () => {
    if (examId || saving) return examId
    setSaving(true)
    setQuestionInitError('')
    try {
      const newId = await saveExam()
      if (newId) {
        const { data } = await adminApi.getQuestions(newId)
        setQuestions(data || [])
      }
      return newId
    } catch (e) {
      setQuestionInitError('Could not create the test yet. Please check required fields and try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const autoPersist = async () => {
    if (!examId || editorLocked) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        await saveExam()
      } catch (e) {
        setPanelError('Autosave failed. Check your connection and try again.')
      }
    }, 250)
  }

  const handleNext = async () => {
    setPanelError('')
    if (editorLocked) {
      setPanelError('Published and archived tests must be edited from Manage Tests.')
      return
    }
    if (step === 0 && courseId && !nodeId) {
      setSaving(true)
      try {
        const { data: node } = await adminApi.createNode({ course_id: courseId, title: 'Module 1', order: 0 })
        setNodes([node])
        setNodeId(node.id)
      } catch (e) {
        setPanelError(e.response?.data?.detail || 'Could not create module. Please try again.')
      } finally {
        setSaving(false)
      }
      return
    }
    const validationMessage = validateStep(step)
    if (validationMessage) {
      setPanelError(validationMessage)
      return
    }
    // Save on important steps
    if ([0, 1, 2, 3, 4, 5].includes(step)) {
      let saveSucceeded = true
      setSaving(true)
      try {
        await saveExam()
      } catch (e) {
        saveSucceeded = false
        setPanelError(e.response?.data?.detail || 'Could not save. Please check required fields and try again.')
      } finally {
        setSaving(false)
      }
      if (!saveSucceeded) return
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1))
  }

  const handleSeedPool = async () => {
    if (!selectedPool || !examId) return
    const selectedPoolRecord = pools.find((pool) => String(pool.id) === String(selectedPool))
    if (selectedPoolRecord && Number(selectedPoolRecord.question_count || 0) < 1) {
      setPanelError('This pool has no questions yet. Open the pool and add questions before seeding this test.')
      return
    }
    setPanelError('')
    try {
      await adminApi.seedExamFromPool(selectedPool, examId, seedCount)
      const { data } = await adminApi.getQuestions(examId)
      setQuestions(data || [])
    } catch (e) { setPanelError(e.response?.data?.detail || 'Failed to seed questions from pool.') }
  }

  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) {
      setPanelError('Enter a topic for AI generation.')
      return
    }
    const ensuredId = await ensureExamCreated()
    if (!ensuredId) return
    setAiLoading(true)
    setPanelError('')
    try {
      const { data } = await generateQuestionsAI({
        topic: aiTopic,
        count: aiCount,
        difficulty: aiDifficulty === 'mixed' ? null : aiDifficulty,
        question_type: 'MCQ',
      })
      // Save generated questions to backend
      for (const [idx, q] of data.entries()) {
        await adminApi.addQuestion({
          exam_id: ensuredId,
          text: q.text,
          question_type: 'MCQ',
          options: q.options && q.options.length ? q.options : null,
          correct_answer: q.correct_answer || (q.options && q.options[0]) || '',
          order: questions.length + idx + 1,
          points: 1,
        })
      }
      const refreshed = await adminApi.getQuestions(ensuredId)
      setQuestions(refreshed.data || [])
    } catch (e) {
      setPanelError(e.response?.data?.detail || 'AI generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAssignSessions = async () => {
    if (!examId || (selectedUsers.length === 0 && assignedSessions.length === 0)) return
    if (accessMode === 'RESTRICTED' && !scheduledAt) {
      setPanelError('Restricted access requires a scheduled date and time.')
      return
    }
    setPanelError('')
    setSessionBusy(true)
    try {
      const existingByUser = new Map(assignedSessions.map((session) => [String(session.userId), session]))
      const selectedSet = new Set(selectedUsers.map((id) => String(id)))
      const staleSessions = assignedSessions.filter((session) => !selectedSet.has(String(session.userId)))
      for (const stale of staleSessions) {
        await adminApi.deleteSchedule(stale.id)
      }
      for (const uid of selectedUsers) {
        const existing = existingByUser.get(String(uid))
        const payload = {
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : (existing?.at || new Date().toISOString()),
          access_mode: accessMode || existing?.mode || 'OPEN',
          notes: null,
        }
        if (existing?.id) {
          await adminApi.updateSchedule(existing.id, payload)
        } else {
          await adminApi.createSchedule({
            user_id: uid,
            exam_id: examId,
            ...payload,
          })
        }
      }
      await loadAssignedSessions(examId)
    } catch (e) {
      setPanelError(e.response?.data?.detail || 'Failed to assign sessions. Please try again.')
    } finally {
      setSessionBusy(false)
    }
  }

  const handleRemoveSession = async (sessionId, userId) => {
    setPanelError('')
    setSessionBusy(true)
    try {
      await adminApi.deleteSchedule(sessionId)
      setSelectedUsers((prev) => prev.filter((id) => String(id) !== String(userId)))
      await loadAssignedSessions(examId)
    } catch (e) {
      setPanelError(e.response?.data?.detail || 'Failed to remove the session.')
    } finally {
      setSessionBusy(false)
    }
  }

  const handlePublish = async () => {
    if (editorLocked) {
      setPanelError('Published and archived tests must be edited from Manage Tests.')
      return
    }
    if (publishStatus === 'OPEN') {
      const publishGateSteps = [0, 1, 2, 4, 5, 7]
      for (const gateStep of publishGateSteps) {
        const validationMessage = validateStep(gateStep, { forPublish: true })
        if (validationMessage) {
          setStep(gateStep)
          setPanelError(validationMessage)
          return
        }
      }
    }
    setSaving(true)
    try {
      const id = await saveExam()
      if (publishStatus === 'OPEN') {
        await adminApi.publishTest(id)
      }
      navigate('/admin/tests')
    } catch (e) { setPanelError(e.response?.data?.detail || 'Could not save. Please add questions and try again.') } finally { setSaving(false) }
  }

  const toggleDetector = (key) => {
    setProctoring((prev) => ({ ...prev, [key]: !prev[key] }))
    if (examId) autoPersist()
  }
  const addAlertRule = () => {
    setProctoring((prev) => ({ ...prev, alert_rules: [...(prev.alert_rules || []), createAlertRule()] }))
    if (examId) autoPersist()
  }
  const updateAlertRule = (ruleId, key, rawValue) => {
    setProctoring((prev) => ({
      ...prev,
      alert_rules: (prev.alert_rules || []).map((rule) => (
        rule.id === ruleId
          ? {
              ...rule,
              [key]: key === 'threshold' ? Math.max(1, Number.parseInt(rawValue, 10) || 1) : rawValue,
            }
          : rule
      )),
    }))
    if (examId) autoPersist()
  }
  const removeAlertRule = (ruleId) => {
    setProctoring((prev) => ({
      ...prev,
      alert_rules: (prev.alert_rules || []).filter((rule) => rule.id !== ruleId),
    }))
    if (examId) autoPersist()
  }
  const updateProctoringFlag = (key, checked) => {
    setProctoring((prev) => ({ ...prev, [key]: checked }))
    if (examId) autoPersist()
  }
  const updateProctoringNumber = (key, rawValue, { integer = false } = {}) => {
    const nextValue = integer ? Number.parseInt(rawValue, 10) : Number.parseFloat(rawValue)
    if (!Number.isFinite(nextValue)) return
    setProctoring((prev) => ({ ...prev, [key]: nextValue }))
    if (examId) autoPersist()
  }
  const applyProctoringPreset = (mode) => {
    const presetValues = {
      lenient: {
        eye_deviation_deg: 16,
        eye_consecutive: 7,
        head_pose_yaw_deg: 26,
        head_pose_pitch_deg: 24,
        head_pose_consecutive: 7,
        mouth_open_threshold: 0.45,
        audio_rms_threshold: 0.12,
        audio_consecutive_chunks: 3,
        max_face_absence_sec: 8,
        max_tab_blurs: 5,
        max_alerts_before_autosubmit: 10,
        max_score_before_autosubmit: 20,
        frame_interval_ms: 4200,
        audio_chunk_ms: 4000,
        screenshot_interval_sec: 90,
        lighting_min_score: 0.28,
        face_verify_id_threshold: 0.24,
        face_verify_threshold: 0.2,
        object_confidence_threshold: 0.65,
      },
      standard: {
        eye_deviation_deg: 12,
        eye_consecutive: 5,
        head_pose_yaw_deg: 20,
        head_pose_pitch_deg: 20,
        head_pose_consecutive: 5,
        mouth_open_threshold: 0.35,
        audio_rms_threshold: 0.08,
        audio_consecutive_chunks: 2,
        max_face_absence_sec: 5,
        max_tab_blurs: 3,
        max_alerts_before_autosubmit: 5,
        max_score_before_autosubmit: 15,
        frame_interval_ms: 3000,
        audio_chunk_ms: 3000,
        screenshot_interval_sec: 60,
        lighting_min_score: 0.35,
        face_verify_id_threshold: 0.18,
        face_verify_threshold: 0.15,
        object_confidence_threshold: 0.5,
      },
      strict: {
        eye_deviation_deg: 8,
        eye_consecutive: 3,
        head_pose_yaw_deg: 14,
        head_pose_pitch_deg: 14,
        head_pose_consecutive: 3,
        mouth_open_threshold: 0.22,
        audio_rms_threshold: 0.05,
        audio_consecutive_chunks: 1,
        max_face_absence_sec: 3,
        max_tab_blurs: 1,
        max_alerts_before_autosubmit: 3,
        max_score_before_autosubmit: 9,
        frame_interval_ms: 1800,
        audio_chunk_ms: 2000,
        screenshot_interval_sec: 30,
        lighting_min_score: 0.45,
        face_verify_id_threshold: 0.12,
        face_verify_threshold: 0.1,
        object_confidence_threshold: 0.35,
        screen_capture: true,
      },
    }
    setProctoring((prev) => ({ ...prev, ...(presetValues[mode] || {}) }))
    if (examId) autoPersist()
  }
  const mergeLearnerSelection = (incomingIds) => {
    setSelectedUsers((prev) => {
      const merged = new Map(prev.map((id) => [String(id), id]))
      incomingIds.forEach((id) => {
        merged.set(String(id), id)
      })
      return Array.from(merged.values())
    })
  }
  const toggleUser = (uid) => {
    setBulkLearnerFeedback('')
    setSelectedUsers((prev) => (
      prev.some((id) => String(id) === String(uid))
        ? prev.filter((id) => String(id) !== String(uid))
        : [...prev, uid]
    ))
  }

  const filteredUsers = users.filter(u =>
    !userSearch || u.user_id?.toLowerCase().includes(userSearch.toLowerCase()) || u.name?.toLowerCase().includes(userSearch.toLowerCase())
  )
  const selectedLearnerKeys = new Set(selectedUsers.map((id) => String(id)))
  const totalLearners = users.length
  const selectedVisibleLearners = filteredUsers.filter((user) => selectedLearnerKeys.has(String(user.id))).length
  const allLearnersSelected = totalLearners > 0 && users.every((user) => selectedLearnerKeys.has(String(user.id)))
  const allVisibleLearnersSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedLearnerKeys.has(String(user.id)))
  const sessionRequiresSchedule = accessMode === 'RESTRICTED'
  const canSaveAssignments = !sessionBusy
    && (selectedUsers.length > 0 || assignedSessions.length > 0)
    && (!sessionRequiresSchedule || Boolean(scheduledAt))
  const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : '-')
  const generatorMixTotal = Object.values(generatorDifficultyMix).reduce((sum, value) => sum + Number(value || 0), 0)
  const activeDetectorCount = DETECTORS.filter(({ key }) => Boolean(proctoring[key])).length
  const alertRuleCount = Array.isArray(proctoring.alert_rules) ? proctoring.alert_rules.length : 0
  const enabledProctoringChecks = Object.entries(proctoring)
    .filter(([, value]) => typeof value === 'boolean' && value)
    .map(([key]) => humanizeSettingLabel(key))

  const validateStep = (targetStep, { forPublish = false } = {}) => {
    if (targetStep === 0) {
      if (!title.trim()) return 'Test name is required.'
      if (courseId && !nodeId) return 'Select or create a module before continuing.'
    }
    if (targetStep === 1 && method === 'generator') {
      if (!generatorCount || Number(generatorCount) < 1) return 'Please set a total question count for the generator.'
      if (generatorMixTotal !== 100) return 'Generator difficulty mix must total exactly 100%.'
    }
    if (targetStep === 2) {
      if (!unlimitedTime && (!Number.isFinite(Number(timeLimitMinutes)) || Number(timeLimitMinutes) <= 0)) {
        return 'Provide a valid time limit or enable unlimited time.'
      }
    }
    if (targetStep === 4) {
      if (!Number.isFinite(Number(passingScore)) || Number(passingScore) < 0 || Number(passingScore) > 100) {
        return 'Passing score must be between 0 and 100.'
      }
      if (!Number.isFinite(Number(maxAttempts)) || Number(maxAttempts) < 1) {
        return 'Max attempts must be at least 1.'
      }
      if (negativeMarking && (!Number.isFinite(Number(negMarkValue)) || Number(negMarkValue) < 0)) {
        return 'Negative marking must be zero or higher.'
      }
    }
    if (targetStep === 5 && certEnabled) {
      if (!certTitle.trim()) return 'Enter a certificate title or disable certificates.'
      if (!certSigner.trim()) return 'Enter a certificate signer or disable certificates.'
    }
    if (targetStep === 7 && accessMode === 'RESTRICTED' && selectedUsers.length > 0 && !scheduledAt) {
      return 'Restricted assignments require a scheduled date and time.'
    }
    if (forPublish && questions.length === 0) {
      return 'Add at least one question before publishing.'
    }
    return ''
  }

  const selectedPoolRecord = pools.find((pool) => String(pool.id) === String(selectedPool))
  const selectedPoolCount = Number(selectedPoolRecord?.question_count || 0)

  const infoReady = Boolean(title.trim() && (!courseId || nodeId))
  const settingsReady = Boolean(unlimitedTime || (Number.isFinite(Number(timeLimitMinutes)) && Number(timeLimitMinutes) > 0))
  const gradingReady = Boolean(
    Number.isFinite(Number(passingScore))
    && Number(passingScore) >= 0
    && Number(passingScore) <= 100
    && Number.isFinite(Number(maxAttempts))
    && Number(maxAttempts) >= 1
  )
  const certificatesReady = !certEnabled || Boolean(certTitle.trim() && certSigner.trim())
  const currentStepValidation = validateStep(step)
  const cycleOverviewCards = [
    {
      label: 'Current step',
      value: `${step + 1} / ${STEPS.length}`,
      helper: currentStepValidation || 'Ready to continue',
      tone: currentStepValidation ? 'attention' : 'ready',
    },
    {
      label: 'Questions',
      value: String(questions.length),
      helper: questions.length > 0 ? `${method === 'generator' ? 'Generated / seeded' : 'Manually curated'} question bank ready` : 'Questions still need to be added',
      tone: questions.length > 0 ? 'ready' : 'attention',
    },
    {
      label: 'Sessions',
      value: String(assignedSessions.length),
      helper: assignedSessions.length > 0 ? `${accessMode === 'RESTRICTED' ? 'Restricted schedule saved' : 'Open access saved'}` : 'No learners assigned yet',
      tone: assignedSessions.length > 0 ? 'ready' : 'info',
    },
    {
      label: 'Proctoring',
      value: `${activeDetectorCount} checks`,
      helper: `Fullscreen ${proctoring.fullscreen_enforce ? 'on' : 'off'} | Tabs ${proctoring.tab_switch_detect ? 'tracked' : 'not tracked'} | Rules ${alertRuleCount}`,
      tone: activeDetectorCount > 0 ? 'ready' : 'attention',
    },
    {
      label: 'Readiness',
      value: infoReady && settingsReady && gradingReady && certificatesReady ? 'Healthy' : 'Needs review',
      helper: `${infoReady ? 'Info ok' : 'Info missing'} | ${settingsReady ? 'Settings ok' : 'Settings missing'} | ${gradingReady ? 'Grading ok' : 'Grading missing'}`,
      tone: infoReady && settingsReady && gradingReady && certificatesReady ? 'ready' : 'attention',
    },
  ]

  const reviewSections = [
    {
      key: 'information',
      title: 'Information',
      editStep: 0,
      items: [
        ['Test Title', title || '-'],
        ['Description', description || 'None'],
        ['Category', categories.find((category) => category.id === categoryId)?.name || 'None'],
        ['Course', courses.find((course) => String(course.id) === String(courseId))?.title || 'None'],
        ['Module', nodes.find((node) => String(node.id) === String(nodeId))?.title || 'None'],
        ['Code', examCode || 'Auto-generated'],
      ],
    },
    {
      key: 'question-design',
      title: 'Question Design',
      editStep: 1,
      items: [
        ['Creation Method', method === 'manual' ? 'Manual selection' : `Generator (${generatorBy})`],
        ...(method === 'generator'
          ? [
              ['Total Questions', generatorCount],
              ['Difficulty Mix', `${generatorDifficultyMix.easy}% easy | ${generatorDifficultyMix.medium}% medium | ${generatorDifficultyMix.hard}% hard`],
              ['Generator Categories', generatorCategories.length ? String(generatorCategories.length) : 'All'],
              ['Generator Pools', generatorPools.length ? String(generatorPools.length) : 'All'],
              ['Tags Include', generatorTagsInclude || 'None'],
              ['Tags Exclude', generatorTagsExclude || 'None'],
            ]
          : [
              ['Question Bank', `${questions.length} question(s) currently authored`],
              ['Seed Pool', selectedPoolRecord ? `${selectedPoolRecord.name} (${selectedPoolCount} question${selectedPoolCount === 1 ? '' : 's'})` : 'None'],
            ]),
      ],
    },
    {
      key: 'delivery',
      title: 'Delivery & Security',
      editStep: 2,
      items: [
        ['Question Type', examType],
        ['Page Format', pageFormat],
        ['Calculator', calculatorType],
        ['Time Limit', unlimitedTime ? 'Unlimited' : `${timeLimitMinutes} minutes`],
        ['Randomize Questions', randomizeQuestions ? 'Yes' : 'No'],
        ['Randomize Answers', randomizeAnswers ? 'Yes' : 'No'],
        ['Show Progress Bar', showProgressBar ? 'Yes' : 'No'],
        ['Enabled Proctoring Checks', enabledProctoringChecks.join(', ') || 'None'],
        ['Alert Escalation Rules', alertRuleCount > 0 ? proctoring.alert_rules.map((rule) => describeAlertRule(rule)).join(' | ') : 'None'],
        ['Special Accommodations', specialAccommodations || 'None'],
        ['Special Requests', specialRequests || 'None'],
      ],
    },
    {
      key: 'grading',
      title: 'Scoring & Results',
      editStep: 4,
      items: [
        ['Passing Score', `${passingScore}%`],
        ['Max Attempts', maxAttempts],
        ['Grading Scale', gradingScales.find((gradingScale) => gradingScale.id === gradingScaleId)?.name || 'None'],
        ['Negative Marking', negativeMarking ? `Yes (${negMarkValue} ${negMarkType})` : 'No'],
        ['Show Final Score', showFinalScore ? 'Yes' : 'No'],
        ['Show Question Scores', showQuestionScores ? 'Yes' : 'No'],
      ],
    },
    {
      key: 'certificates',
      title: 'Certificates',
      editStep: 5,
      items: [
        ['Certificate', certEnabled ? `${certTemplate} (${certOrientation})` : 'Disabled'],
        ['Certificate Title', certEnabled ? certTitle || 'None' : 'Disabled'],
        ['Subtitle', certEnabled ? certSubtitle || 'None' : 'Disabled'],
        ['Issuer', certEnabled ? certCompany || 'None' : 'Disabled'],
        ['Signer', certEnabled ? certSigner || 'None' : 'Disabled'],
      ],
    },
    {
      key: 'readiness',
      title: 'Final Readiness',
      editStep: 3,
      items: [
        ['Questions Authored', `${questions.length} question(s)`],
        ['Ready for Publishing', questions.length > 0 ? 'Yes' : 'Add at least one question first'],
        ['Sessions Assigned', `${assignedSessions.length} session(s)`],
        ['Next Phase', 'Assign learners and schedule access in Step 7'],
      ],
    },
  ]

  useEffect(() => () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
  }, [])

  const handleSelectAllLearners = () => {
    if (users.length === 0) {
      setBulkLearnerFeedback('There are no learners available to assign yet.')
      return
    }
    setPanelError('')
    setBulkLearnerFeedback(`Selected all ${users.length} learner${users.length === 1 ? '' : 's'}.`)
    setSelectedUsers(users.map((user) => user.id))
  }

  const handleSelectVisibleLearners = () => {
    if (filteredUsers.length === 0) {
      setBulkLearnerFeedback('No learners match the current search.')
      return
    }
    setPanelError('')
    mergeLearnerSelection(filteredUsers.map((user) => user.id))
    setBulkLearnerFeedback(`Selected ${filteredUsers.length} learner${filteredUsers.length === 1 ? '' : 's'} from the filtered list.`)
  }

  const handleClearLearnerSelection = () => {
    setPanelError('')
    setSelectedUsers([])
    setBulkLearnerFeedback('Cleared the learner selection.')
  }

  const handleBulkLearnerMatch = () => {
    const tokens = Array.from(new Set(
      bulkLearnerInput
        .split(/[\n,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ))
    if (tokens.length === 0) {
      setBulkLearnerFeedback('Paste learner IDs, emails, or user IDs first.')
      return
    }

    const matchedLearners = users.filter((user) => {
      const keys = [user.id, user.user_id, user.email]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
      return tokens.some((token) => keys.includes(token))
    })
    if (matchedLearners.length === 0) {
      setPanelError('None of the pasted learners matched the current learner list.')
      setBulkLearnerFeedback(`Matched 0 of ${tokens.length} entries.`)
      return
    }

    setPanelError('')
    mergeLearnerSelection(matchedLearners.map((user) => user.id))
    const matchedKeys = new Set()
    matchedLearners.forEach((user) => {
      ;[user.id, user.user_id, user.email]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
        .forEach((value) => matchedKeys.add(value))
    })
    const unmatchedCount = tokens.filter((token) => !matchedKeys.has(token)).length
    setBulkLearnerFeedback(
      `Matched ${matchedLearners.length} learner${matchedLearners.length === 1 ? '' : 's'}`
      + (unmatchedCount > 0 ? `, ${unmatchedCount} entr${unmatchedCount === 1 ? 'y was' : 'ies were'} not found.` : '.'),
    )
  }

  useEffect(() => {
    if (step !== 2 || !examId) return
    let cancelled = false
    setProctoringLoading(true)
    Promise.all([adminApi.attempts(), adminApi.schedules()])
      .then(([attemptsRes, schedulesRes]) => {
        if (cancelled) return
        const attempts = (attemptsRes.data || []).filter((a) => String(a.exam_id) === String(examId))
        const sessions = (schedulesRes.data || []).filter((s) => String(s.exam_id) === String(examId))
        setProctoringSessions(sessions)

        const schedulesByUser = new Map()
        sessions.forEach((s) => schedulesByUser.set(String(s.user_id), s))

        const rows = attempts.map((a) => {
          const fallbackUser = users.find((u) => String(u.id) === String(a.user_id))
          const session = schedulesByUser.get(String(a.user_id))
          return {
            id: String(a.id),
            attemptId: String(a.id).slice(0, 8),
            username: a.user?.user_id || fallbackUser?.user_id || fallbackUser?.name || String(a.user_id).slice(0, 8),
            sessionName: session ? `Session ${String(session.id).slice(0, 6)}` : '-',
            status: a.status || '-',
            startedAt: a.started_at,
            userGroup: '-',
            comment: a.status === 'GRADED' ? 'Reviewed' : '',
            proctorRate: '-',
            sessionId: session?.id || '',
          }
        })
        setProctoringRows(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setProctoringSessions([])
          setProctoringRows([])
        }
      })
      .finally(() => {
        if (!cancelled) setProctoringLoading(false)
      })
    return () => { cancelled = true }
  }, [step, examId, users])

  const [proctoringRowBusy, setProctoringRowBusy] = useState({})
  const [proctoringBulkBusy, setProctoringBulkBusy] = useState(false)

  const handleProctoringPauseResume = async (row) => {
    setProctoringRowBusy((prev) => ({ ...prev, [row.id]: true }))
    try {
      if (row.paused) await adminApi.resumeAttempt(row.id)
      else await adminApi.pauseAttempt(row.id)
      // Refresh rows
      const { data: attempts } = await adminApi.attempts()
      const filtered = (attempts || []).filter((a) => String(a.exam_id) === String(examId))
      setProctoringRows((prev) => prev.map((r) => {
        const updated = filtered.find((a) => String(a.id) === r.id)
        return updated ? { ...r, status: updated.status, paused: row.paused ? false : true } : r
      }))
    } catch { /* silent */ }
    finally { setProctoringRowBusy((prev) => ({ ...prev, [row.id]: false })) }
  }

  const handleProctoringBulkPause = async (toPause) => {
    if (!filteredProctoringRows.length) return
    setProctoringBulkBusy(true)
    try {
      for (const r of filteredProctoringRows) {
        if (toPause && !r.paused) await adminApi.pauseAttempt(r.id)
        if (!toPause && r.paused) await adminApi.resumeAttempt(r.id)
      }
      const { data: attempts } = await adminApi.attempts()
      const filtered = (attempts || []).filter((a) => String(a.exam_id) === String(examId))
      setProctoringRows((prev) => prev.map((r) => {
        const updated = filtered.find((a) => String(a.id) === r.id)
        return updated ? { ...r, status: updated.status } : r
      }))
    } catch { /* silent */ }
    finally { setProctoringBulkBusy(false) }
  }

  const filteredProctoringRows = proctoringRows.filter((row) => {
    if (proctoringSessionId && String(row.sessionId) !== String(proctoringSessionId)) return false
    if (proctoringSearch.attemptId && !row.attemptId.toLowerCase().includes(proctoringSearch.attemptId.toLowerCase())) return false
    if (proctoringSearch.username && !row.username.toLowerCase().includes(proctoringSearch.username.toLowerCase())) return false
    if (proctoringSearch.sessionName && !row.sessionName.toLowerCase().includes(proctoringSearch.sessionName.toLowerCase())) return false
    if (proctoringSearch.status && row.status !== proctoringSearch.status) return false
    if (proctoringSearch.userGroup && !row.userGroup.toLowerCase().includes(proctoringSearch.userGroup.toLowerCase())) return false
    if (proctoringSearch.comment && !row.comment.toLowerCase().includes(proctoringSearch.comment.toLowerCase())) return false
    return true
  })

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <>
          <h3 className={styles.panelTitle}>Test Information</h3>
          {examTemplates.length > 0 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Start from Template</label>
              <div className={styles.templateRow}>
                <select className={styles.select} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  <option value="">Select template...</option>
                  {examTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className={styles.btnSecondary} type="button" disabled={!selectedTemplate} onClick={() => applyTemplate(selectedTemplate)}>Apply</button>
              </div>
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label}>Test Name <span className={styles.requiredMark}>*</span></label>
            <input name="title" className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Midterm Examination - Computer Science" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Description</label>
            <textarea name="description" className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the test purpose, scope, and any special instructions..." />
          </div>
          <div className={styles.inputRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Course</label>
              <select
                name="course"
                className={styles.select}
                value={courseId}
                onChange={e => {
                  const nextCourseId = e.target.value
                  setCourseId(nextCourseId)
                  setNodeId('')
                  loadNodesForCourse(nextCourseId, { createIfEmpty: true })
                }}
              >
                <option value="">Select course...</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <div className={styles.inlineActions}>
                <button className={styles.btnSecondary} type="button" onClick={() => setShowCourseCreator((current) => !current)}>
                  {showCourseCreator ? 'Cancel New Course' : 'Create Course'}
                </button>
              </div>
              {!courses.length && <p className={styles.helper}>No courses yet. Create one here and the wizard will keep going.</p>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Module</label>
              <select name="node" className={styles.select} value={nodeId} onChange={e => setNodeId(e.target.value)}>
                <option value="">Select module...</option>
                {nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
              </select>
              {!nodes.length && courseId && <p className={styles.helper}>No modules in this course. The wizard will create Module 1 automatically.</p>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>External Code / ID</label>
              <input name="exam_code" className={styles.input} value={examCode} onChange={e => setExamCode(e.target.value)} placeholder="e.g. CS-101-MT" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Category</label>
              <select name="category" className={styles.select} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">No Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {showCourseCreator && (
            <div className={styles.inlineCard}>
              <div className={styles.inlineCardHead}>
                <div>
                  <div className={styles.label}>Create course inline</div>
                  <div className={styles.helper}>This creates a draft course and its first module without leaving the wizard.</div>
                </div>
              </div>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Course title</label>
                  <input className={styles.input} value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)} placeholder="e.g. Computer Science 101" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>First module</label>
                  <input className={styles.input} value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} placeholder="Module 1" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Course description</label>
                <textarea className={styles.textarea} rows={3} value={newCourseDescription} onChange={(e) => setNewCourseDescription(e.target.value)} placeholder="Optional description for the training course..." />
              </div>
              <div className={styles.inlineActions}>
                <button className={styles.btnSecondary} type="button" onClick={handleCreateCourseInline} disabled={creatingCourse || !newCourseTitle.trim()}>
                  {creatingCourse ? 'Creating...' : 'Create Course and Module'}
                </button>
              </div>
            </div>
          )}
        </>
      )

      case 1: return (
        <>
          <h3 className={styles.panelTitle}>Test Creation Method</h3>
          <div className={styles.methodCards}>
            <div className={`${styles.methodCard} ${method === 'manual' ? styles.methodCardActive : ''}`} onClick={() => setMethod('manual')}>
              <div className={styles.methodIcon}>Edit</div>
              <div className={styles.methodLabel}>Manual Selection</div>
              <div className={styles.methodDesc}>Pick questions from pools or create them manually. Define exactly which questions appear in each test version.</div>
              <div className={styles.methodRadio}>
                <input type="radio" checked={method === 'manual'} readOnly />
              </div>
            </div>
            <div className={`${styles.methodCard} ${method === 'generator' ? styles.methodCardActive : ''}`} onClick={() => setMethod('generator')}>
              <div className={styles.methodIcon}>AI</div>
              <div className={styles.methodLabel}>Generator Mode</div>
              <div className={styles.methodDesc}>Let the system automatically select questions based on your criteria. Creates unique test versions per candidate.</div>
              <div className={styles.methodRadio}>
                <input type="radio" checked={method === 'generator'} readOnly />
              </div>
            </div>
          </div>
          {method === 'generator' && (
            <div className={styles.generatorOptions}>
              <div className={styles.aiBar}>
                <div>
                  <div className={styles.label}>AI-assisted generation</div>
                  <div className={styles.helper}>Enter a topic and let the model draft questions, then we save them into this test.</div>
                </div>
                <div className={styles.aiControls}>
                  <input className={`${styles.input} ${styles.aiTopicInput}`} placeholder="Topic or chapter" value={aiTopic} onChange={e => setAiTopic(e.target.value)} />
                  <input className={styles.inputMini} type="number" min={1} max={15} value={aiCount} onChange={e => setAiCount(Number(e.target.value))} />
                  <select className={styles.selectMini} value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value)}>
                    <option value="mixed">Mixed</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <button type="button" className={styles.btnSeed} onClick={handleAIGenerate} disabled={aiLoading}>
                    {aiLoading ? 'Generating...' : 'Generate with AI'}
                  </button>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Select Questions Based On</label>
                <div className={styles.generatorChoiceRow}>
                  <label className={styles.generatorChoiceLabel}>
                    <input type="radio" checked={generatorBy === 'difficulty'} onChange={() => setGeneratorBy('difficulty')} />
                    Difficulty mix
                  </label>
                  <label className={styles.generatorChoiceLabel}>
                    <input type="radio" checked={generatorBy === 'category'} onChange={() => setGeneratorBy('category')} />
                    Category quotas
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Total Questions</label>
                <input className={`${styles.input} ${styles.generatorCountInput}`} type="number" min={1} max={200} value={generatorCount} onChange={e => setGeneratorCount(Number(e.target.value))} />
              </div>

              <div className={styles.generatorGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Difficulty Mix (%)</label>
                  {['easy','medium','hard'].map(key => (
                    <div key={key} className={styles.sliderRow}>
                      <span className={styles.sliderLabel}>{key.toUpperCase()}</span>
                      <input
                        className={styles.slider}
                        type="range"
                        min={0}
                        max={100}
                        value={generatorDifficultyMix[key]}
                        onChange={e => setGeneratorDifficultyMix(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      />
                      <input
                        className={styles.inputMini}
                        type="number"
                        min={0}
                        max={100}
                        value={generatorDifficultyMix[key]}
                        onChange={e => setGeneratorDifficultyMix(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                  <div className={styles.helper}>Totals can exceed or fall below 100. They are normalized during generation.</div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Restrict by Categories</label>
                  <div className={styles.chipRow}>
                    {categories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`${styles.chipToggle} ${generatorCategories.includes(c.id) ? styles.chipToggleOn : ''}`}
                        onClick={() => setGeneratorCategories(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className={styles.helper}>Leave empty to allow all categories.</div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Allowed Pools</label>
                  <div className={styles.chipRow}>
                    {pools.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`${styles.chipToggle} ${generatorPools.includes(p.id) ? styles.chipToggleOn : ''}`}
                        onClick={() => setGeneratorPools(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className={styles.helper}>If none selected, generator can draw from any pool.</div>
                </div>
              </div>

              <div className={styles.generatorGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Include Tags (comma separated)</label>
                  <input className={styles.input} value={generatorTagsInclude} onChange={e => setGeneratorTagsInclude(e.target.value)} placeholder="math, algebra, fundamentals" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Exclude Tags (comma separated)</label>
                  <input className={styles.input} value={generatorTagsExclude} onChange={e => setGeneratorTagsExclude(e.target.value)} placeholder="archived, beta" />
                </div>
              </div>

              <div className={styles.generatorGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Versioning & Randomness</label>
                  <div className={styles.toggleRow}>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorUniquePerCandidate} onChange={e => setGeneratorUniquePerCandidate(e.target.checked)} />
                      Unique paper per candidate
                    </label>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorPreventReuse} onChange={e => setGeneratorPreventReuse(e.target.checked)} />
                      Prevent reusing same question across versions
                    </label>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorShuffleAnswers} onChange={e => setGeneratorShuffleAnswers(e.target.checked)} />
                      Shuffle answers per version
                    </label>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorAdaptive} onChange={e => setGeneratorAdaptive(e.target.checked)} />
                      Adaptive (increase difficulty on streaks)
                    </label>
                  </div>
                  <div className={styles.inputRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Versions to pre-generate</label>
                      <input className={styles.input} type="number" min={1} max={20} value={generatorVersionCount} onChange={e => setGeneratorVersionCount(Number(e.target.value))} />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Random Seed (optional)</label>
                      <input className={styles.input} value={generatorRandomSeed} onChange={e => setGeneratorRandomSeed(e.target.value)} placeholder="Leave blank for random" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )

      case 2: return (
        <>
          <h3 className={styles.panelTitle}>Proctoring & Test Settings</h3>
          <div className={styles.summaryChips}>
            <span className={styles.chip}>Phase 3 of 9</span>
            <span className={styles.chip}>Checks enabled: {activeDetectorCount}</span>
            <span className={styles.chip}>Escalation rules: {alertRuleCount}</span>
            <span className={styles.chip}>Fullscreen: {proctoring.fullscreen_enforce ? 'On' : 'Off'}</span>
            <span className={styles.chip}>Tabs: {proctoring.tab_switch_detect ? 'Tracked' : 'Ignored'}</span>
          </div>
          <p className={styles.phaseIntro}>
            This is the dedicated proctoring phase. Configure delivery rules, AI monitoring, special accommodations, and live candidate controls here before you publish.
          </p>
          <div className={styles.sectionDivider}>Delivery settings</div>
          <div className={styles.inputRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Question Type</label>
              <select className={styles.select} value={examType} onChange={e => setExamType(e.target.value)}>
                <option value="MCQ">Multiple Choice (MCQ)</option>
                <option value="TEXT">Essay / Text</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Page Format</label>
              <select className={styles.select} value={pageFormat} onChange={e => setPageFormat(e.target.value)}>
                <option value="one_per_page">One question per page</option>
                <option value="all_per_page">All questions on one page</option>
                <option value="section_per_page">One section per page</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Calculator</label>
              <select className={styles.select} value={calculatorType} onChange={e => setCalculatorType(e.target.value)}>
                <option value="none">No calculator</option>
                <option value="basic">Basic calculator</option>
                <option value="scientific">Scientific calculator</option>
              </select>
            </div>
          </div>

          <div className={styles.checkboxGroup}>
            {[
              { key: 'hideMetadata', label: 'Hide metadata from candidates', state: hideMetadata, set: setHideMetadata },
              { key: 'randomize_q', label: 'Randomize question order', state: randomizeQuestions, set: setRandomizeQuestions },
              { key: 'randomize_a', label: 'Randomize answer choices', state: randomizeAnswers, set: setRandomizeAnswers },
              { key: 'progress', label: 'Show progress bar', state: showProgressBar, set: setShowProgressBar },
            ].map(item => (
              <label key={item.key} className={styles.checkItem}>
                <input type="checkbox" checked={item.state} onChange={e => item.set(e.target.checked)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className={styles.sectionDivider}>Proctoring</div>
          <div className={styles.proctoringShell}>
            <div className={styles.proctoringHead}>
              <h4 className={styles.proctoringTitle}>Proctoring</h4>
              <div className={styles.proctoringViews}>
                <button type="button" className={`${styles.viewTab} ${proctoringView === 'candidate_monitoring' ? styles.viewTabActive : ''}`} onClick={() => setProctoringView('candidate_monitoring')}>Candidate monitoring</button>
                <button type="button" className={`${styles.viewTab} ${proctoringView === 'special_accommodations' ? styles.viewTabActive : ''}`} onClick={() => setProctoringView('special_accommodations')}>Special accommodations</button>
                <button type="button" className={`${styles.viewTab} ${proctoringView === 'special_requests' ? styles.viewTabActive : ''}`} onClick={() => setProctoringView('special_requests')}>Special requests</button>
              </div>
            </div>

            <div className={styles.inputRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Test</label>
                <input className={styles.input} value={title || 'Untitled test'} readOnly />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Testing session</label>
                <select className={styles.select} value={proctoringSessionId} onChange={(e) => setProctoringSessionId(e.target.value)}>
                  <option value="">All testing sessions</option>
                  {proctoringSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {`Session ${String(s.id).slice(0, 6)} - ${fmtDateTime(s.scheduled_at)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {proctoringView === 'candidate_monitoring' && (
              <div className={styles.monitoringTableCard}>
                <div className={styles.monitoringActions}>
                  <button type="button" className={styles.btnSecondary} disabled={proctoringBulkBusy} onClick={() => handleProctoringBulkPause(true)}>Pause filtered</button>
                  <button type="button" className={styles.btnSecondary} disabled={proctoringBulkBusy} onClick={() => handleProctoringBulkPause(false)}>Resume filtered</button>
                  <button type="button" className={styles.btnPrimarySolid} onClick={() => examId && navigate(`/admin/videos?exam_id=${examId}`)}>Open supervision mode</button>
                  {examId && <button type="button" className={styles.btnSecondary} onClick={() => navigate(`/admin/tests/${examId}/manage?tab=proctoring`)}>Full proctoring view</button>}
                </div>

                <div className={styles.monitoringTableWrap}>
                  <table className={styles.monitoringTable}>
                    <thead>
                      <tr>
                        <th>Actions</th>
                        <th>Attempt ID</th>
                        <th>Username</th>
                        <th>Testing session name</th>
                        <th>Attempt status</th>
                        <th>Test started</th>
                        <th>User group</th>
                        <th>Comment</th>
                        <th>Proctor rate</th>
                      </tr>
                      <tr className={styles.monitoringSearchRow}>
                        <th></th>
                        <th><input className={styles.tableFilter} placeholder="Search" value={proctoringSearch.attemptId} onChange={(e) => setProctoringSearch((p) => ({ ...p, attemptId: e.target.value }))} /></th>
                        <th><input className={styles.tableFilter} placeholder="Search" value={proctoringSearch.username} onChange={(e) => setProctoringSearch((p) => ({ ...p, username: e.target.value }))} /></th>
                        <th><input className={styles.tableFilter} placeholder="Search" value={proctoringSearch.sessionName} onChange={(e) => setProctoringSearch((p) => ({ ...p, sessionName: e.target.value }))} /></th>
                        <th>
                          <select className={styles.tableFilter} value={proctoringSearch.status} onChange={(e) => setProctoringSearch((p) => ({ ...p, status: e.target.value }))}>
                            <option value="">Select one</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="SUBMITTED">SUBMITTED</option>
                            <option value="GRADED">GRADED</option>
                          </select>
                        </th>
                        <th></th>
                        <th><input className={styles.tableFilter} placeholder="Search" value={proctoringSearch.userGroup} onChange={(e) => setProctoringSearch((p) => ({ ...p, userGroup: e.target.value }))} /></th>
                        <th><input className={styles.tableFilter} placeholder="Search" value={proctoringSearch.comment} onChange={(e) => setProctoringSearch((p) => ({ ...p, comment: e.target.value }))} /></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {proctoringLoading ? (
                        <tr><td colSpan={9}>Loading attempts...</td></tr>
                      ) : filteredProctoringRows.length === 0 ? (
                        <tr><td colSpan={9}>There are no test attempts</td></tr>
                      ) : (
                        filteredProctoringRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <div className={styles.rowActionGroup}>
                                <button type="button" className={styles.rowIconBtn} title={row.paused ? 'Resume attempt' : 'Pause attempt'} aria-label={row.paused ? 'Resume attempt' : 'Pause attempt'} disabled={proctoringRowBusy[row.id]} onClick={() => handleProctoringPauseResume(row)}>
                                  {row.paused ? (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                  ) : (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 5v14M16 5v14" /></svg>
                                  )}
                                </button>
                                <button type="button" className={styles.rowIconBtn} title="Analyze attempt" aria-label="Analyze attempt" onClick={() => navigate(`/admin/attempt-analysis?id=${row.id}`)}>
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                                  </svg>
                                </button>
                                <button type="button" className={styles.rowIconBtn} title="Open video recordings" aria-label="Open video recordings" onClick={() => navigate(`/admin/videos/${row.id}`)}>
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M23 7l-7 5 7 5V7z" />
                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                            <td>{row.attemptId}</td>
                            <td>{row.username}</td>
                            <td>{row.sessionName}</td>
                            <td>{row.status}</td>
                            <td>{fmtDateTime(row.startedAt)}</td>
                            <td>{row.userGroup}</td>
                            <td>{row.comment || '-'}</td>
                            <td>{row.proctorRate}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={styles.monitoringFooter}>
                  <span>Save displayed column set</span>
                  <span>Rows: {filteredProctoringRows.length}</span>
                </div>
              </div>
            )}

            {proctoringView === 'special_accommodations' && (
              <div className={styles.proctoringNotes}>
                <label className={styles.label}>Special accommodations</label>
                <textarea
                  className={styles.textarea}
                  value={specialAccommodations}
                  onChange={(e) => {
                    setSpecialAccommodations(e.target.value)
                    if (examId) autoPersist()
                  }}
                  rows={4}
                />
              </div>
            )}

            {proctoringView === 'special_requests' && (
              <div className={styles.proctoringNotes}>
                <label className={styles.label}>Special requests</label>
                <textarea
                  className={styles.textarea}
                  value={specialRequests}
                  onChange={(e) => {
                    setSpecialRequests(e.target.value)
                    if (examId) autoPersist()
                  }}
                  rows={4}
                />
              </div>
            )}

            <div className={styles.sectionDivider}>Journey requirements</div>
            <div className={styles.requirementGrid}>
              {PROCTORING_REQUIREMENTS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.requirementCard} ${proctoring[item.key] ? styles.requirementCardActive : ''}`}
                  onClick={() => updateProctoringFlag(item.key, !proctoring[item.key])}
                >
                  <div className={styles.requirementCardHead}>
                    <div className={styles.requirementCardTitle}>{item.label}</div>
                    <div className={`${styles.toggleTrack} ${proctoring[item.key] ? styles.toggleTrackOn : ''}`}>
                      <div className={styles.toggleThumb} />
                    </div>
                  </div>
                  <div className={styles.requirementCardDesc}>{item.desc}</div>
                </button>
              ))}
            </div>

            <div className={styles.sectionDivider}>Alert escalation rules</div>
            <div className={styles.alertRuleShell}>
              <div className={styles.alertRuleHead}>
                <div>
                  <div className={styles.alertRuleTitle}>Escalate specific proctoring alerts</div>
                  <div className={styles.alertRuleDesc}>
                    Choose which alert matters, how many repeats are allowed, what severity gets logged, and what the exam should do when the threshold is reached.
                  </div>
                </div>
                <button type="button" className={styles.btnSecondary} onClick={addAlertRule}>Add rule</button>
              </div>

              {alertRuleCount === 0 ? (
                <div className={styles.alertRuleEmpty}>
                  No custom alert rules yet. The global auto-submit thresholds still apply until you add a rule here.
                </div>
              ) : (
                <div className={styles.alertRuleList}>
                  {proctoring.alert_rules.map((rule, index) => {
                    const option = ALERT_RULE_EVENT_OPTIONS.find((item) => item.value === rule.event_type) || ALERT_RULE_EVENT_OPTIONS[0]
                    const dependencies = Array.isArray(option.requires) ? option.requires : []
                    const missingDependencies = dependencies.filter((dep) => !proctoring[dep])
                    const dependencyLabel = missingDependencies.map((dep) => PROCTORING_LABELS[dep] || humanizeSettingLabel(dep)).join(', ')
                    return (
                      <div key={rule.id} className={styles.alertRuleCard}>
                        <div className={styles.alertRuleCardHead}>
                          <div>
                            <div className={styles.alertRuleCardTitle}>Rule {index + 1}</div>
                            <div className={styles.alertRuleCardMeta}>{describeAlertRule(rule)}</div>
                          </div>
                          <button type="button" className={styles.reviewEditBtn} onClick={() => removeAlertRule(rule.id)}>Remove</button>
                        </div>
                        <div className={styles.alertRuleGrid}>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>Alert type</label>
                            <select
                              aria-label={`Alert type ${index + 1}`}
                              className={styles.select}
                              value={rule.event_type}
                              onChange={(e) => updateAlertRule(rule.id, 'event_type', e.target.value)}
                            >
                              {ALERT_RULE_EVENT_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <div className={styles.helper}>{option.desc}</div>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>Trigger after</label>
                            <input
                              aria-label={`Trigger after ${index + 1}`}
                              className={styles.input}
                              type="number"
                              min={1}
                              max={20}
                              value={rule.threshold}
                              onChange={(e) => updateAlertRule(rule.id, 'threshold', e.target.value)}
                            />
                            <div className={styles.helper}>Count of matching alerts before this rule fires.</div>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>Escalation severity</label>
                            <select
                              aria-label={`Escalation severity ${index + 1}`}
                              className={styles.select}
                              value={rule.severity}
                              onChange={(e) => updateAlertRule(rule.id, 'severity', e.target.value)}
                            >
                              {ALERT_RULE_SEVERITIES.map((value) => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                            <div className={styles.helper}>Severity stored on the escalation event for review and reporting.</div>
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>What happens</label>
                            <select
                              aria-label={`What happens ${index + 1}`}
                              className={styles.select}
                              value={rule.action}
                              onChange={(e) => updateAlertRule(rule.id, 'action', e.target.value)}
                            >
                              {ALERT_RULE_ACTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <div className={styles.helper}>{ALERT_RULE_ACTION_HELPERS[rule.action] || ALERT_RULE_ACTION_HELPERS.WARN}</div>
                          </div>
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Optional escalation message</label>
                          <input
                            aria-label={`Escalation message ${index + 1}`}
                            className={styles.input}
                            value={rule.message || ''}
                            onChange={(e) => updateAlertRule(rule.id, 'message', e.target.value)}
                            placeholder="Optional custom message shown when this rule fires"
                          />
                        </div>
                        {missingDependencies.length > 0 && (
                          <div className={styles.alertRuleDependencyWarning}>
                            This rule depends on {dependencyLabel}. Enable it above or the rule will never fire.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={styles.sectionDivider}>Detector switches</div>
            <div className={styles.presetRow}>
              <button className={styles.btnSecondary} type="button" onClick={() => applyProctoringPreset('lenient')}>Lenient</button>
              <button className={styles.btnSecondary} type="button" onClick={() => applyProctoringPreset('standard')}>Standard</button>
              <button className={styles.btnSecondary} type="button" onClick={() => applyProctoringPreset('strict')}>Strict</button>
            </div>
            <div className={styles.detectorsGrid}>
              {DETECTORS.map(d => (
                <div key={d.key} className={`${styles.detectorCard} ${proctoring[d.key] ? styles.detectorOn : ''}`} onClick={() => toggleDetector(d.key)}>
                  <div className={styles.detectorToggle}>
                    <div className={`${styles.toggleTrack} ${proctoring[d.key] ? styles.toggleTrackOn : ''}`}>
                      <div className={styles.toggleThumb} />
                    </div>
                  </div>
                  <div>
                    <div className={styles.detectorName}>{d.label}</div>
                    <div className={styles.detectorDesc}>{d.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.sectionDivider}>Advanced detector tuning</div>
            <div className={styles.advancedSectionStack}>
              {PROCTORING_CONTROL_GROUPS.map((group) => (
                <div key={group.key} className={styles.advancedSectionCard}>
                  <div className={styles.advancedSectionHead}>
                    <div className={styles.advancedSectionTitle}>{group.title}</div>
                    <div className={styles.advancedSectionDesc}>{group.description}</div>
                  </div>
                  <div className={styles.advancedControlGrid}>
                    {group.controls.map((control) => {
                      const dependencies = Array.isArray(control.enabledBy)
                        ? control.enabledBy
                        : control.enabledBy
                          ? [control.enabledBy]
                          : []
                      const controlEnabled = dependencies.length === 0 || dependencies.every((dep) => Boolean(proctoring[dep]))
                      const dependencyLabel = dependencies.map((dep) => PROCTORING_LABELS[dep] || humanizeSettingLabel(dep)).join(' and ')
                      const numericValue = proctoring[control.key] ?? control.min
                      return (
                        <div
                          key={control.key}
                          className={`${styles.advancedControlCard} ${!controlEnabled ? styles.advancedControlCardDisabled : ''}`}
                        >
                          <div className={styles.advancedControlHead}>
                            <div>
                              <div className={styles.advancedControlLabel}>{control.label}</div>
                              <div className={styles.advancedControlDesc}>{control.desc}</div>
                            </div>
                            <div className={styles.advancedControlMeta}>
                              {numericValue}
                              <span className={styles.advancedControlUnit}>{control.unit}</span>
                            </div>
                          </div>
                          <input
                            className={styles.advancedControlRange}
                            type="range"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            value={numericValue}
                            disabled={!controlEnabled}
                            onChange={(e) => updateProctoringNumber(control.key, e.target.value, { integer: Number.isInteger(control.step) })}
                          />
                          <div className={styles.advancedControlInputs}>
                            <input
                              className={`${styles.input} ${styles.advancedNumberInput}`}
                              type="number"
                              min={control.min}
                              max={control.max}
                              step={control.step}
                              value={numericValue}
                              disabled={!controlEnabled}
                              onChange={(e) => updateProctoringNumber(control.key, e.target.value, { integer: Number.isInteger(control.step) })}
                            />
                            <span className={styles.advancedInputHint}>
                              {controlEnabled ? `Recommended range: ${control.min} to ${control.max} ${control.unit}` : `Enable ${dependencyLabel} first`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.sectionDivider}>Time Limit</div>
          <label className={styles.checkItem}>
            <input type="checkbox" checked={unlimitedTime} onChange={e => setUnlimitedTime(e.target.checked)} />
            <span>Unlimited time (no timer)</span>
          </label>
          {!unlimitedTime && (
            <div className={`${styles.formGroup} ${styles.timeLimitWrap}`}>
              <label className={styles.label}>Duration (minutes)</label>
              <input name="time_limit" className={`${styles.input} ${styles.timeLimitInput}`} type="number" min={1} max={600} value={timeLimitMinutes} onChange={e => setTimeLimitMinutes(Number(e.target.value))} />
            </div>
          )}
        </>
      )

      case 3: return (
        <>
          <h3 className={styles.panelTitle}>Questions</h3>
          <p className={styles.questionsIntro}>
            Add questions directly or seed from a question pool.
          </p>

          {method === 'manual' && examId && (
            <>
              <div className={styles.poolSeed}>
                <span className={styles.poolSeedLabel}>Seed from pool:</span>
                <select className={`${styles.select} ${styles.poolSeedSelect}`} value={selectedPool} onChange={e => setSelectedPool(e.target.value)}>
                  <option value="">Select pool...</option>
                  {pools.map(p => <option key={p.id} value={p.id}>{p.name} ({Number(p.question_count || 0)})</option>)}
                </select>
                <input className={`${styles.input} ${styles.poolSeedCountInput}`} type="number" min={1} max={100} value={seedCount} onChange={e => setSeedCount(Number(e.target.value))} />
                <button className={styles.btnSeed} onClick={handleSeedPool} disabled={!selectedPool || !examId || saving || selectedPoolCount < 1}>
                  {saving ? 'Saving...' : 'Seed'}
                </button>
              </div>
              {selectedPool && (
                <div className={styles.helper}>
                  {selectedPoolCount > 0
                    ? `${selectedPoolCount} question${selectedPoolCount === 1 ? '' : 's'} available in this pool for seeding.`
                    : 'This pool is empty. Open Question Pools and add questions before seeding.'}
                </div>
              )}
              <ExamQuestionPanel examId={examId} questions={questions} onUpdate={setQuestions} questionTypes={QUESTION_TYPES} />
            </>
          )}
          {!examId && (
            <div className={styles.questionInitCard}>
              <div className={styles.questionInitLead}>
                {saving ? 'Creating the test so you can add questions...' : 'Hang tight while we create the test so you can start adding questions right away.'}
              </div>
              {questionInitError && <div className={styles.questionInitError}>{questionInitError}</div>}
              {!saving && (
                <button className={styles.btnSeed} onClick={ensureExamCreated}>
                  Retry create
                </button>
              )}
            </div>
          )}
        </>
      )

      case 4: return (
        <>
          <h3 className={styles.panelTitle}>Grading Configuration</h3>
          <div className={styles.inputRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Passing Mark (%)</label>
              <input className={styles.input} type="number" min={0} max={100} value={passingScore} onChange={e => { setPassingScore(Number(e.target.value)); if (examId) autoPersist() }} />
              <span className={styles.metricHelper}>
                Achieve more than {passingScore}% on the entire test to pass.
              </span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Max Attempts Allowed</label>
              <input className={styles.input} type="number" min={1} max={99} value={maxAttempts} onChange={e => { setMaxAttempts(Number(e.target.value)); if (examId) autoPersist() }} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Grading Scale</label>
              <select className={styles.select} value={gradingScaleId} onChange={e => { setGradingScaleId(e.target.value); if (examId) autoPersist() }}>
                <option value="">No scale</option>
                {gradingScales.map(gs => <option key={gs.id} value={gs.id}>{gs.name}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.sectionDivider}>Negative Marking</div>
          <label className={styles.checkItem}>
            <input type="checkbox" checked={negativeMarking} onChange={e => { setNegativeMarking(e.target.checked); if (examId) autoPersist() }} />
            <span>Enable negative marking for wrong answers</span>
          </label>
          {negativeMarking && (
            <div className={`${styles.inputRow} ${styles.negativeMarkRow}`}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Deduction per Wrong Answer</label>
                <input className={styles.input} type="number" min={0} step={0.25} value={negMarkValue} onChange={e => { setNegMarkValue(Number(e.target.value)); if (examId) autoPersist() }} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Deduction Type</label>
                <select className={styles.select} value={negMarkType} onChange={e => { setNegMarkType(e.target.value); if (examId) autoPersist() }}>
                  <option value="points">Fixed Points</option>
                  <option value="percentage">Percentage of Question</option>
                </select>
              </div>
            </div>
          )}

          <div className={styles.sectionDivider}>Score Display</div>
          <div className={styles.checkboxGroup}>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={showFinalScore} onChange={e => { setShowFinalScore(e.target.checked); if (examId) autoPersist() }} />
              <span>Show final score to candidate after submission</span>
            </label>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={showQuestionScores} onChange={e => { setShowQuestionScores(e.target.checked); if (examId) autoPersist() }} />
              <span>Show per-question score breakdown</span>
            </label>
            </div>

          <div className={styles.conductGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Test conduct controls</label>
              <div className={styles.toggleRow}>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.fullscreen_enforce} onChange={e => { setProctoring(p => ({ ...p, fullscreen_enforce: e.target.checked })); if (examId) autoPersist() }} />
                  Enforce fullscreen
                </label>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.tab_switch_detect} onChange={e => { setProctoring(p => ({ ...p, tab_switch_detect: e.target.checked })); if (examId) autoPersist() }} />
                  Detect tab switches
                </label>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.screen_capture} onChange={e => { setProctoring(p => ({ ...p, screen_capture: e.target.checked })); if (examId) autoPersist() }} />
                  Capture screen periodically
                </label>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.copy_paste_block} onChange={e => { setProctoring(p => ({ ...p, copy_paste_block: e.target.checked })); if (examId) autoPersist() }} />
                  Block copy / paste
                </label>
              </div>
              <div className={styles.helper}>These map to runtime enforcement: fullscreen prompts, visibility/tab pings, optional screen grabs, and clipboard locking.</div>
            </div>
          </div>
        </>
      )

      case 5: return (
        <>
          <h3 className={styles.panelTitle}>Certificates</h3>
          <label className={`${styles.checkItem} ${styles.certToggleRow}`}>
            <div
              className={`${styles.toggleTrack} ${certEnabled ? styles.toggleTrackOn : ''}`}
              onClick={() => { setCertEnabled(v => !v); if (examId) autoPersist() }}
            >
              <div className={styles.toggleThumb} />
            </div>
            <span className={styles.toggleLabelStrong}>Issue certificate upon passing</span>
          </label>
          {certEnabled && (
            <>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Template</label>
                  <select className={styles.select} value={certTemplate} onChange={e => { setCertTemplate(e.target.value); if (examId) autoPersist() }}>
                    {CERTIFICATE_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Orientation</label>
                  <div className={styles.orientationRow}>
                    {['landscape', 'portrait'].map(o => (
                      <label key={o} className={styles.orientationOption}>
                        <input type="radio" checked={certOrientation === o} onChange={() => { setCertOrientation(o); if (examId) autoPersist() }} />
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Certificate Title</label>
                  <input className={styles.input} value={certTitle} onChange={e => { setCertTitle(e.target.value); if (examId) autoPersist() }} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Subtitle</label>
                  <input className={styles.input} value={certSubtitle} onChange={e => { setCertSubtitle(e.target.value); if (examId) autoPersist() }} placeholder="e.g. with Distinction" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Company / Institution Name</label>
                <input className={styles.input} value={certCompany} onChange={e => { setCertCompany(e.target.value); if (examId) autoPersist() }} placeholder="e.g. SYRA Learning Institute" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Signer Name</label>
                <input className={styles.input} value={certSigner} onChange={e => { setCertSigner(e.target.value); if (examId) autoPersist() }} placeholder="e.g. Dr. Jane Doe" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Certificate Body Text</label>
                <textarea className={styles.textarea} rows={3} value={certDescription} onChange={e => { setCertDescription(e.target.value); if (examId) autoPersist() }} />
              </div>
              <div className={styles.certPreview}>
                <div className={styles.certPreviewLabel}>{certTemplate} - {certOrientation}</div>
                <div className={`${styles.certPreviewBox} ${certOrientation === 'landscape' ? styles.certPreviewLandscape : styles.certPreviewPortrait}`}>
                  <div className={styles.certPreviewTitle}>{certTitle || 'Certificate Title'}</div>
                  {certSubtitle && <div className={styles.certPreviewSub}>{certSubtitle}</div>}
                  {certCompany && <div className={styles.certPreviewCompany}>{certCompany}</div>}
                  {certSigner && <div className={styles.certPreviewCompany}>Signed by {certSigner}</div>}
                </div>
              </div>
            </>
          )}
        </>
      )

      case 6: return (
        <>
          <h3 className={styles.panelTitle}>Review</h3>
          <div className={styles.reviewGrid}>
            {reviewSections.map((section) => (
              <div key={section.key} className={styles.reviewCard}>
                <div className={styles.reviewCardHeader}>
                  <div className={styles.reviewCardTitle}>{section.title}</div>
                  <button type="button" className={styles.reviewEditBtn} onClick={() => setStep(section.editStep)}>
                    Edit Step {section.editStep + 1}
                  </button>
                </div>
                <div className={styles.reviewCardList}>
                  {section.items.map(([label, value]) => (
                    <div key={`${section.key}-${label}`} className={styles.reviewRow}>
                      <span className={styles.reviewLabel}>{label}</span>
                      <span className={styles.reviewValue}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )

      case 7: return (
        <>
          <h3 className={styles.panelTitle}>Testing Sessions</h3>
          <p className={styles.sessionIntro}>
            Assign this test to learners with a scheduled date and time.
          </p>
          {!examId ? (
            <p className={styles.sessionEmpty}>Save the test first (go back and advance through steps).</p>
          ) : (
            <>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Access Mode</label>
                  <select className={styles.select} value={accessMode} onChange={e => setAccessMode(e.target.value)}>
                    <option value="OPEN">Open (anytime)</option>
                    <option value="RESTRICTED">Restricted (by schedule)</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Scheduled Date & Time</label>
                  <input className={styles.input} type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                </div>
              </div>
              {sessionRequiresSchedule && !scheduledAt && (
                <div className={styles.sessionWarning}>Restricted access requires a scheduled date and time before assignments can be saved.</div>
              )}

              <label className={`${styles.label} ${styles.sectionLabel}`}>Select Learners</label>
              <div className={styles.helper}>Existing assigned learners are preselected. Save assignments to update their access mode or scheduled time.</div>
              <div className={styles.summaryChips}>
                <span className={styles.chip}>Learners: {totalLearners}</span>
                <span className={styles.chip}>Visible: {filteredUsers.length}</span>
                <span className={styles.chip}>Selected: {selectedUsers.length}</span>
                <span className={styles.chip}>Visible selected: {selectedVisibleLearners}</span>
              </div>
              <div className={styles.sessionBulkBar}>
                <button type="button" className={styles.btnSecondary} onClick={handleSelectAllLearners} disabled={sessionBusy || totalLearners === 0 || allLearnersSelected}>
                  {allLearnersSelected ? 'All learners selected' : `Select all learners (${totalLearners})`}
                </button>
                <button type="button" className={styles.btnSecondary} onClick={handleSelectVisibleLearners} disabled={sessionBusy || filteredUsers.length === 0 || allVisibleLearnersSelected}>
                  {allVisibleLearnersSelected ? 'Visible learners selected' : `Select visible (${filteredUsers.length})`}
                </button>
                <button type="button" className={styles.btnSecondary} onClick={handleClearLearnerSelection} disabled={sessionBusy || selectedUsers.length === 0}>
                  Clear selection
                </button>
              </div>
              <div className={styles.inlineCard}>
                <div className={styles.inlineCardHead}>
                  <div className={styles.label}>Bulk add learners</div>
                  <div className={styles.helper}>Paste learner IDs, emails, or internal IDs separated by commas or new lines.</div>
                </div>
                <textarea
                  className={styles.textarea}
                  aria-label="Bulk learners"
                  rows={3}
                  placeholder={'learner001@example.com\nLIV1772920670269\n1b2c3d4e-...'}
                  value={bulkLearnerInput}
                  onChange={(e) => setBulkLearnerInput(e.target.value)}
                />
                <div className={styles.inlineActions}>
                  <button type="button" className={styles.btnSecondary} onClick={handleBulkLearnerMatch} disabled={sessionBusy || !bulkLearnerInput.trim()}>
                    Add pasted learners
                  </button>
                </div>
                {bulkLearnerFeedback && <div className={styles.bulkSelectionMessage}>{bulkLearnerFeedback}</div>}
              </div>
              <input className={styles.userSearch} placeholder="Search learners..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <div className={styles.userList}>
                {filteredUsers.map(u => (
                  <label key={u.id} className={styles.userItem}>
                    <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    <span>{u.user_id} - {u.name || u.email || 'Learner'}</span>
                  </label>
                ))}
                {filteredUsers.length === 0 && <div className={`${styles.userItem} ${styles.emptyUserItem}`}>No learners found.</div>}
              </div>
              <button
                className={styles.btnSeed}
                onClick={handleAssignSessions}
                disabled={!canSaveAssignments}
              >
                {sessionBusy ? 'Saving...' : `Save assignments${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : assignedSessions.length > 0 ? ' (clear/update)' : ''}`}
              </button>
              {assignedSessions.length > 0 && (
                <div className={styles.sessionActions}>
                  <div className={`${styles.label} ${styles.sessionActionsTitle}`}>Assigned sessions ({assignedSessions.length})</div>
                  {assignedSessions.map((s, i) => (
                    <div key={`action-${i}`} className={styles.sessionRow}>
                      <span>{s.user} - {s.mode}{s.at ? ` @ ${new Date(s.at).toLocaleString()}` : ''}</span>
                      <button type="button" className={styles.sessionRemove} onClick={() => handleRemoveSession(s.id, s.userId)} disabled={sessionBusy}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )

      case 8: return (
        <>
          <h3 className={styles.panelTitle}>Save Test</h3>
          <p className={styles.sessionIntro}>
            Choose the initial status for this test. You can change it later from the Manage Tests page.
          </p>
          <div className={styles.summaryChips}>
            <span className={styles.chip}>Questions: {questions.length}</span>
            <span className={styles.chip}>Seed Pools: {selectedPool ? 1 : 0}</span>
            <span className={styles.chip}>Scheduled: {assignedSessions.length}</span>
            <span className={styles.chip}>Status: {publishStatus === 'OPEN' ? 'Published' : 'Draft'}</span>
          </div>
          {questions.length === 0 && (
            <div className={styles.publishWarning}>
              Drafts can be saved without questions. Publishing still requires at least one question.
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label}>Publication Status</label>
            <div className={styles.publishOptions}>
              <label className={`${styles.publishOption} ${publishStatus === 'CLOSED' ? styles.publishOptionActive : ''}`}>
                <input type="radio" checked={publishStatus === 'CLOSED'} onChange={() => setPublishStatus('CLOSED')} />
                <div className={styles.publishOptionCopy}>
                  <div className={styles.publishOptionTitle}>Draft</div>
                  <div className={styles.publishOptionSubtitle}>Not visible to candidates</div>
                </div>
              </label>
              <label className={`${styles.publishOption} ${publishStatus === 'OPEN' ? styles.publishOptionActive : ''}`}>
                <input type="radio" checked={publishStatus === 'OPEN'} onChange={() => setPublishStatus('OPEN')} />
                <div className={styles.publishOptionCopy}>
                  <div className={styles.publishOptionTitle}>Published</div>
                  <div className={styles.publishOptionSubtitle}>Visible and active for candidates</div>
                </div>
              </label>
            </div>
          </div>
          <div className={styles.publishSummary}>
            <strong className={styles.publishSummaryStrong}>Summary:</strong> "{title || 'Unnamed Test'}" with {questions.length} questions, {assignedSessions.length} sessions assigned.
          </div>
        </>
      )

      default: return null
    }
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{editId ? 'Edit Test' : 'New Test Wizard'}</h2>

      {/* Steps bar */}
      <div className={styles.stepsBar}>
        {STEPS.map(s => (
          <div
            key={s.id}
            className={`${styles.step} ${s.id === step ? styles.stepActive : ''} ${s.id < step ? styles.stepCompleted : ''}`}
            onClick={() => s.id <= step && setStep(s.id)}
          >
            <span className={`${styles.stepNum} ${s.id === step ? styles.stepNumActive : ''} ${s.id < step ? styles.stepNumCompleted : ''}`}>
              {s.id < step ? 'OK' : s.id + 1}
            </span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Panel */}
      <div className={`${styles.panel} glass`}>
        {panelError && <div className={styles.errorBanner}>{panelError}</div>}
        <div className={styles.stepOverviewGrid}>
          {cycleOverviewCards.map((card) => (
            <div
              key={card.label}
              className={`${styles.stepOverviewCard} ${
                card.tone === 'ready'
                  ? styles.stepOverviewCardReady
                  : card.tone === 'attention'
                    ? styles.stepOverviewCardAttention
                    : styles.stepOverviewCardInfo
              }`}
            >
              <div className={styles.stepOverviewLabel}>{card.label}</div>
              <div className={styles.stepOverviewValue}>{card.value}</div>
              <div className={styles.stepOverviewHelper}>{card.helper}</div>
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.btnBack} onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className={styles.btnNext} onClick={handleNext} disabled={(step === 0 && !title.trim()) || saving || editorLocked}>
            {saving ? 'Saving...' : 'Next'}
          </button>
        ) : (
          <button className={styles.btnPublish} onClick={handlePublish} disabled={saving || editorLocked || (publishStatus === 'OPEN' && questions.length === 0)}>
            {saving ? 'Saving...' : publishStatus === 'OPEN' ? 'Publish Test' : 'Save as Draft'}
          </button>
        )}
      </div>
    </div>
  )
}
