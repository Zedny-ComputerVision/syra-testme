import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import useUnsavedChanges from '../../../hooks/useUnsavedChanges'
import { adminApi } from '../../../services/admin.service'
import {
  CERTIFICATE_ISSUE_RULE_OPTIONS,
  certificateIssueRuleLabel,
  DEFAULT_CERTIFICATE_ISSUE_RULE,
  normalizeCertificateIssueRule,
} from '../../../utils/certificates'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import { normalizeProctoringConfig } from '../../../utils/proctoringRequirements'
import { readPaginatedItems } from '../../../utils/pagination'
import AdministrationTab from './tabs/AdministrationTab'
import CandidatesTab from './tabs/CandidatesTab'
import ProctoringTab from './tabs/ProctoringTab'
import QuestionsTab from './tabs/QuestionsTab'
import ReportsTab from './tabs/ReportsTab'
import SessionsTab from './tabs/SessionsTab'
import SettingsTab from './tabs/SettingsTab'
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


const SETTINGS_MENU_GROUPS = [
  {
    group: 'General',
    items: ['Basic information', 'Test instructions dialog settings', 'Duration and layout'],
  },
  {
    group: 'Policies',
    items: ['Security settings', 'Pause, retake and reschedule settings', 'Language settings'],
  },
  {
    group: 'Results',
    items: ['Result validity settings', 'Grading configuration', 'Personal report settings', 'Score report settings'],
  },
  {
    group: 'Extras',
    items: ['Certificates', 'Coupons', 'Attachments', 'External attributes', 'Test categories'],
  },
]

const SETTINGS_MENU_ITEMS = SETTINGS_MENU_GROUPS.flatMap((group) => group.items)

const MENU_TO_SECTION = {
  'Basic information': 'basic',
  'Test instructions dialog settings': 'instructions',
  'Duration and layout': 'duration',
  'Security settings': 'security',
  'Pause, retake and reschedule settings': 'retake',
  'Language settings': 'language',
  'Result validity settings': 'result-validity',
  'Grading configuration': 'grading',
  'Personal report settings': 'personal-report',
  'Score report settings': 'score-report',
  Certificates: 'certificate',
  Coupons: 'coupons',
  Attachments: 'attachments',
  'External attributes': 'externalattrs',
  'Test categories': 'categories',
}

const SECTION_TO_MENU = Object.fromEntries(
  Object.entries(MENU_TO_SECTION).map(([label, section]) => [section, label]),
)

const DEFAULT_SETTINGS_SECTION = MENU_TO_SECTION['Basic information']
const SETTINGS_SECTION_IDS = Object.values(MENU_TO_SECTION)

const QA_ICONS = {
  preview:  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  sessions: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
  shield:   'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  reports:  'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
  review:   'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
}

const SETTINGS_PAGE_ICONS = {
  instructions: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2',
  duration: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 4h10M9 11h6M9 15h6',
  retake: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M21 12a9 9 0 0 1-3 6.7M21 20v-5h-5',
  security: 'M12 2 5 5v6c0 5 3.4 9.7 7 11 3.6-1.3 7-6 7-11V5l-7-3zm0 6v5m0 3h.01',
  validity: 'M8 2v3M16 2v3M3 7h18M5 5h14a2 2 0 0 1 2 2v11a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a2 2 0 0 1 2-2zm7 6v4l3 2',
  grading: 'M4 5h16M4 12h16M4 19h10M18 17l2 2 4-4',
  certificate: 'M6 3h12l3 4v14H3V7l3-4zm2 0v4h8V3M8 13l2.2 2.2L16 9.4',
  personalReport: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.6-4.5-8-4.5z',
  scoreReport: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  coupons: 'M20 12a2 2 0 0 1-2 2h-1v3a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3H6a2 2 0 0 1 0-4h1V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3h1a2 2 0 0 1 2 2zM9 7v10h6V7',
  language: 'M4 5h7M7.5 5A13 13 0 0 1 4 15m7.5-10A13 13 0 0 0 15 15m0 0-3-3m3 3 3-3M12 19l4 0M14 15l2 4',
  attachments: 'M8 12.5 6.6 13.9a3 3 0 0 0 4.2 4.2l6.4-6.4a4.5 4.5 0 0 0-6.4-6.4l-7 7a6 6 0 0 0 8.5 8.5l5.2-5.2',
  external: 'M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11',
  categories: 'M5 4h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm1 5h12M8 13h6M8 17h6',
}

const PROCTORING_MONITOR_KEYS = [
  'face_detection',
  'multi_face',
  'eye_tracking',
  'head_pose_detection',
  'audio_detection',
  'object_detection',
]

const LOCKDOWN_KEYS = ['fullscreen_enforce', 'tab_switch_detect', 'copy_paste_block']

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Select language preference' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
]

const REPORT_DISPLAY_OPTIONS = [
  { value: 'IMMEDIATELY_AFTER_GRADING', label: 'Immediately after grading' },
  { value: 'IMMEDIATELY_AFTER_FINISHING', label: 'Immediately after finishing' },
  { value: 'ON_MANAGER_APPROVAL', label: 'On manager approval' },
]

const REPORT_CONTENT_OPTIONS = [
  { value: 'SCORE_AND_DETAILS', label: 'Score and details' },
  { value: 'SCORE_ONLY', label: 'Score only' },
]

const PERSONAL_REPORT_LEFT_FLAGS = [
  ['show_score_report', 'Display score'],
  ['display_subscores_by_pool', 'Display sub-scores based on question pools'],
  ['display_section_scores', 'Display section scores'],
  ['display_percentage_required_to_pass', 'Display percentage required to pass'],
  ['display_employee_id', 'Display employee ID'],
  ['display_achieved_score_summary', 'Display achieved score on the summary tab'],
  ['display_score_description', 'Display score description'],
]

const PERSONAL_REPORT_RIGHT_FLAGS = [
  ['show_pass_fail_info', 'Show Passed/Failed info'],
  ['display_score_each_question', 'Display score for each question'],
  ['display_instructor_notes', 'Display notes the candidate took for instructors only'],
  ['display_candidate_groups', 'Display candidates\' user groups'],
  ['show_full_timestamps', 'Show full timestamps'],
  ['show_rounded_scores', 'Show rounded scores'],
]

const PERSONAL_REPORT_EXPORT_FLAGS = [
  ['export_personal_report_excel', 'Export personal report as Excel file'],
  ['export_personal_report_pdf', 'Export personal report as a PDF file'],
  ['enable_score_report_download', 'Enable score report download to candidates'],
  ['enable_knowledge_deficiency_report_download', 'Enable knowledge deficiency report to download'],
]

const ATTACHMENT_TYPE_OPTIONS = [
  { value: 'LINK', label: 'Link' },
  { value: 'PDF', label: 'PDF' },
  { value: 'DOC', label: 'Document' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' },
]

const DEFAULT_SCORE_REPORT_SETTINGS = {
  heading: 'Score report',
  intro: '',
  include_candidate_summary: true,
  include_section_breakdown: true,
  include_proctoring_summary: false,
  include_certificate_status: false,
  include_pass_fail_badge: true,
}

const EMPTY_TRANSLATION_DRAFT = {
  language: 'ar',
  title: '',
  description: '',
  instructions_body: '',
  completion_message: '',
}

const EMPTY_ATTACHMENT_DRAFT = {
  title: '',
  url: '',
  type: 'LINK',
}

const EMPTY_COUPON_GENERATOR = {
  prefix: 'SAVE',
  count: '5',
  discount_type: 'percentage',
  amount: '10',
  expiration_time: '',
}

const EMPTY_COUPON_FILTERS = {
  code: '',
  discount_type: '',
  amount: '',
  status: '',
  expiration_time: '',
  used_by: '',
  date_of_use: '',
  created_by: '',
}

const EMPTY_CATEGORY_DRAFT = {
  name: '',
  description: '',
}

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
  screen_capture: 'Screen Recording',
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

function normalizeSettingsSectionParam(search) {
  const raw = new URLSearchParams(search).get('section')
  return SETTINGS_SECTION_IDS.includes(raw) ? raw : DEFAULT_SETTINGS_SECTION
}

function isManageRoutePath(pathname) {
  return /^\/admin\/tests\/[^/]+\/manage$/.test(pathname || '')
}

function isCanceledRequest(error) {
  return error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED'
}

function readRequestError(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (typeof error?.message === 'string' && error.message.trim() && !isCanceledRequest(error)) {
    return error.message.trim()
  }
  return fallback
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

function clampVideoUploadPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeVideoUploadSourceSummary(item) {
  if (!item || typeof item !== 'object') return null
  const source = String(item.source || 'camera').trim().toLowerCase() || 'camera'
  const progressPercent = clampVideoUploadPercent(item.progress_percent)
  return {
    source,
    label: String(item.label || `${source.charAt(0).toUpperCase()}${source.slice(1)}`),
    progressPercent,
    remainingPercent: Math.max(0, 100 - progressPercent),
    status: String(item.status || 'not_started').trim().toLowerCase() || 'not_started',
    hasSavedVideo: Boolean(item.has_saved_video),
  }
}

function normalizeVideoUploadStatus(item) {
  const sources = Array.isArray(item?.sources)
    ? item.sources.map((entry) => normalizeVideoUploadSourceSummary(entry)).filter(Boolean)
    : []
  const fallbackPercent = sources.length > 0
    ? Math.round(sources.reduce((sum, source) => sum + source.progressPercent, 0) / sources.length)
    : 0
  const uploadPercent = clampVideoUploadPercent(item?.upload_percent ?? fallbackPercent)
  const requiredSources = Array.isArray(item?.required_sources)
    ? item.required_sources.map((source) => String(source || '').trim().toLowerCase()).filter(Boolean)
    : []

  return {
    hasVideo: Boolean(item?.has_video),
    savedVideoCount: Number(item?.saved_video_count || 0),
    uploadPercent,
    remainingPercent: Math.max(0, 100 - uploadPercent),
    uploading: Boolean(item?.uploading),
    uploadStatus: String(item?.status || 'not_started').trim().toLowerCase() || 'not_started',
    uploadStatusLabel: String(item?.status_label || (uploadPercent > 0 ? 'Uploading in background' : 'Not started')),
    uploadSources: sources,
    requiredVideoSources: requiredSources,
    allRequiredVideosUploaded: Boolean(item?.all_required_uploaded),
  }
}

function defaultVideoUploadStatus() {
  return {
    hasVideo: false,
    savedVideoCount: 0,
    uploadPercent: 0,
    remainingPercent: 100,
    uploading: false,
    uploadStatus: 'not_started',
    uploadStatusLabel: 'Not started',
    uploadSources: [],
    requiredVideoSources: [],
    allRequiredVideosUploaded: false,
  }
}

function applyVideoUploadStatus(row, rawStatus) {
  const status = rawStatus || defaultVideoUploadStatus()
  return {
    ...row,
    hasVideo: status.hasVideo,
    savedVideoCount: status.savedVideoCount,
    uploadPercent: status.uploadPercent,
    remainingPercent: status.remainingPercent,
    uploading: status.uploading,
    uploadStatus: status.uploadStatus,
    uploadStatusLabel: status.uploadStatusLabel,
    uploadSources: status.uploadSources,
    requiredVideoSources: status.requiredVideoSources,
    allRequiredVideosUploaded: status.allRequiredVideosUploaded,
  }
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

function formatMetadataDate(value) {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getBrandInitials(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'SY'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase()
}

function buildLocalId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function languageLabelOf(value) {
  return LANGUAGE_OPTIONS.find((option) => option.value === value)?.label || String(value || '').trim() || 'Custom'
}

function attachmentTitleFromUrl(url, fallbackIndex = 1) {
  const raw = String(url || '').trim()
  if (!raw) return `Attachment ${fallbackIndex}`
  try {
    const parsed = new URL(raw)
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()
    return decodeURIComponent(lastSegment || parsed.hostname || `Attachment ${fallbackIndex}`)
  } catch {
    const lastSegment = raw.split('/').filter(Boolean).pop()
    return decodeURIComponent(lastSegment || `Attachment ${fallbackIndex}`)
  }
}

function normalizeCertificatePayload(value) {
  const payload = {
    title: String(value?.title || '').trim(),
    subtitle: String(value?.subtitle || '').trim(),
    issuer: String(value?.issuer || '').trim(),
    signer: String(value?.signer || '').trim(),
    issue_rule: normalizeCertificateIssueRule(value?.issue_rule),
  }
  const hasContent = Object.entries(payload).some(([key, item]) => key !== 'issue_rule' && Boolean(item))
  return hasContent ? payload : null
}

function normalizeTranslationEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const normalized = {
    id: String(entry.id || buildLocalId('translation')),
    language: String(entry.language || '').trim(),
    title: String(entry.title || '').trim(),
    description: String(entry.description || '').trim(),
    instructions_body: String(entry.instructions_body || '').trim(),
    completion_message: String(entry.completion_message || '').trim(),
  }
  if (!normalized.language) return null
  if (!normalized.title && !normalized.description && !normalized.instructions_body && !normalized.completion_message) {
    return null
  }
  return normalized
}

function normalizeAttachmentEntry(entry, fallbackIndex = 1) {
  if (!entry || typeof entry !== 'object') return null
  const url = String(entry.url || '').trim()
  if (!url) return null
  const type = ATTACHMENT_TYPE_OPTIONS.some((option) => option.value === entry.type) ? entry.type : 'LINK'
  return {
    id: String(entry.id || buildLocalId('attachment')),
    title: String(entry.title || '').trim() || attachmentTitleFromUrl(url, fallbackIndex),
    url,
    type,
  }
}

function normalizeAttachmentEntries(rawItems, legacyUrls) {
  if (Array.isArray(rawItems) && rawItems.length) {
    return rawItems
      .map((entry, index) => normalizeAttachmentEntry(entry, index + 1))
      .filter(Boolean)
  }
  const urls = Array.isArray(legacyUrls)
    ? legacyUrls
    : String(legacyUrls || '')
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
  return urls
    .map((url, index) => normalizeAttachmentEntry({ url }, index + 1))
    .filter(Boolean)
}

function normalizeCouponEntry(entry, fallbackIndex = 1) {
  if (!entry || typeof entry !== 'object') return null
  const code = String(entry.code || '').trim().toUpperCase()
  if (!code) return null
  const amount = Number(entry.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const discountType = entry.discount_type === 'fixed' ? 'fixed' : 'percentage'
  return {
    id: String(entry.id || buildLocalId('coupon')),
    code,
    discount_type: discountType,
    amount,
    status: String(entry.status || 'Draft').trim() || 'Draft',
    expiration_time: String(entry.expiration_time || '').trim(),
    used_by: String(entry.used_by || '').trim(),
    date_of_use: String(entry.date_of_use || '').trim(),
    created_by: String(entry.created_by || `Admin ${fallbackIndex}`).trim(),
  }
}

function normalizeCouponEntries(rawEntries, legacyCode, legacyType, legacyValue, createdBy) {
  if (Array.isArray(rawEntries) && rawEntries.length) {
    return rawEntries
      .map((entry, index) => normalizeCouponEntry(entry, index + 1))
      .filter(Boolean)
  }
  const code = String(legacyCode || '').trim()
  const amount = Number(legacyValue)
  if (!code || !Number.isFinite(amount) || amount <= 0) return []
  return [
    normalizeCouponEntry({
      code,
      discount_type: legacyType === 'fixed' ? 'fixed' : 'percentage',
      amount,
      status: 'Draft',
      created_by: createdBy || 'Admin',
    }, 1),
  ].filter(Boolean)
}

function normalizeScoreReportSettings(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    heading: String(raw.heading || DEFAULT_SCORE_REPORT_SETTINGS.heading),
    intro: String(raw.intro || DEFAULT_SCORE_REPORT_SETTINGS.intro),
    include_candidate_summary: raw.include_candidate_summary == null
      ? DEFAULT_SCORE_REPORT_SETTINGS.include_candidate_summary
      : Boolean(raw.include_candidate_summary),
    include_section_breakdown: raw.include_section_breakdown == null
      ? DEFAULT_SCORE_REPORT_SETTINGS.include_section_breakdown
      : Boolean(raw.include_section_breakdown),
    include_proctoring_summary: Boolean(raw.include_proctoring_summary),
    include_certificate_status: Boolean(raw.include_certificate_status),
    include_pass_fail_badge: raw.include_pass_fail_badge == null
      ? DEFAULT_SCORE_REPORT_SETTINGS.include_pass_fail_badge
      : Boolean(raw.include_pass_fail_badge),
  }
}

function sanitizeCouponPrefix(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10) || 'SAVE'
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
    runtime_status: testData?.runtime_status || examData?.status || 'CLOSED',
    code: testData?.code || '',
    course_id: testData?.course_id || examData?.course_id || '',
    course_title: testData?.course_title || examData?.course_title || '',
    time_limit_minutes: testData?.time_limit_minutes ?? examData?.time_limit_minutes ?? examData?.time_limit ?? '',
    max_attempts: testData?.attempts_allowed ?? testData?.max_attempts ?? examData?.max_attempts ?? 1,
    attempts_allowed: testData?.attempts_allowed ?? testData?.max_attempts ?? examData?.max_attempts ?? 1,
    passing_score: testData?.passing_score ?? examData?.passing_score ?? null,
    grading_scale_id: testData?.grading_scale_id ?? examData?.grading_scale_id ?? '',
    report_content: testData?.report_content || examData?.report_content || 'SCORE_AND_DETAILS',
    report_displayed: testData?.report_displayed || examData?.report_displayed || 'IMMEDIATELY_AFTER_GRADING',
    settings,
    proctoring_config: normalizeProctoringConfig(testData?.proctoring_config || examData?.proctoring_config || {}),
    certificate: testData?.certificate || examData?.certificate || null,
  }
}

export default function AdminManageTestPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [tab, setTab] = useState(() => normalizeTabParam(location.search))
  const [settingsSection, setSettingsSection] = useState(() => normalizeSettingsSectionParam(location.search))
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

  const [settingsForm, setSettingsFormState] = useState({
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
    completion_message: '',
    instructions_require_acknowledgement: false,
    show_test_instructions: true,
    show_test_duration: true,
    show_passing_mark: true,
    show_question_count: true,
    show_remaining_retakes: false,
    show_score_report: false,
    show_answer_review: false,
    show_correct_answers: false,
    email_result_on_submit: false,
    report_displayed: 'IMMEDIATELY_AFTER_GRADING',
    report_content: 'SCORE_AND_DETAILS',
    duration_type: 'Time defined in each section',
    hide_assignment_metadata: false,
    hide_finish_until_last_question: false,
    enforce_section_order: false,
    calculator_type: 'No calculator',
    settings_json: '',
    certificate_json: '',
    certificate_title: '',
    certificate_subtitle: '',
    certificate_issuer: '',
    certificate_signer: '',
    certificate_issue_rule: DEFAULT_CERTIFICATE_ISSUE_RULE,
    allow_pause: false,
    pause_duration_minutes: '',
    allow_retake: false,
    retake_cooldown_hours: '',
    reschedule_policy: 'NOT_ALLOWED',
    limited_free_reschedules: false,
    network_access: 'ALL_NETWORKS',
    auto_logout_after_finish_or_pause: false,
    require_profile_update: false,
    result_validity_period_enabled: false,
    result_validity_days: '',
    passing_mark_inclusive: true,
    require_positive_proctoring_report: false,
    show_advanced_grading: false,
    custom_score_report_enabled: false,
    score_report_heading: DEFAULT_SCORE_REPORT_SETTINGS.heading,
    score_report_intro: DEFAULT_SCORE_REPORT_SETTINGS.intro,
    score_report_include_candidate_summary: DEFAULT_SCORE_REPORT_SETTINGS.include_candidate_summary,
    score_report_include_section_breakdown: DEFAULT_SCORE_REPORT_SETTINGS.include_section_breakdown,
    score_report_include_proctoring_summary: DEFAULT_SCORE_REPORT_SETTINGS.include_proctoring_summary,
    score_report_include_certificate_status: DEFAULT_SCORE_REPORT_SETTINGS.include_certificate_status,
    score_report_include_pass_fail_badge: DEFAULT_SCORE_REPORT_SETTINGS.include_pass_fail_badge,
    report_lifespan_enabled: false,
    report_access_duration_enabled: false,
    display_subscores_by_pool: false,
    display_section_scores: false,
    display_percentage_required_to_pass: false,
    display_employee_id: false,
    display_achieved_score_summary: false,
    display_score_description: false,
    show_pass_fail_info: false,
    display_score_each_question: false,
    display_instructor_notes: false,
    display_candidate_groups: false,
    show_full_timestamps: false,
    show_rounded_scores: false,
    export_personal_report_excel: false,
    export_personal_report_pdf: false,
    enable_score_report_download: false,
    enable_knowledge_deficiency_report_download: false,
    coupons_enabled: false,
    coupon_code: '',
    coupon_discount_type: 'percentage',
    coupon_discount_value: '',
    coupon_entries: [],
    language: 'en',
    allow_language_override: false,
    attachment_urls: '',
    attachment_items: [],
    test_translations: [],
    external_attributes_json: '',
    external_id: '',
    category_id: '',
    descriptive_label: '',
    creation_type: 'Test with sections',
    section_count: '0',
    allow_section_selection: false,
  })
  const settingsFormRef = useRef(settingsForm)
  const settingsBaselineRef = useRef(JSON.stringify(settingsForm))
  const examRef = useRef(exam)
  const usersRef = useRef(users)
  const sessionsRef = useRef(sessions)
  const loadAbortRef = useRef(null)
  const setSettingsForm = useCallback((updater) => {
    setSettingsFormState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      settingsFormRef.current = next
      return next
    })
  }, [])
  const serializeSettingsForm = useCallback((form) => JSON.stringify(form), [])

  const [editingAccomId, setEditingAccomId] = useState(null)
  const [editingAccomForm, setEditingAccomForm] = useState({ access_mode: 'OPEN', notes: '', scheduled_at: '' })
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState(EMPTY_CATEGORY_DRAFT)
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [translationDraft, setTranslationDraft] = useState(EMPTY_TRANSLATION_DRAFT)
  const [editingTranslationId, setEditingTranslationId] = useState(null)
  const [translationError, setTranslationError] = useState('')
  const [showTranslationEditor, setShowTranslationEditor] = useState(false)
  const [attachmentDraft, setAttachmentDraft] = useState(EMPTY_ATTACHMENT_DRAFT)
  const [editingAttachmentId, setEditingAttachmentId] = useState(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [showAttachmentEditor, setShowAttachmentEditor] = useState(false)
  const [attachmentImportText, setAttachmentImportText] = useState('')
  const [attachmentImportError, setAttachmentImportError] = useState('')
  const [showAttachmentImporter, setShowAttachmentImporter] = useState(false)
  const [couponGenerator, setCouponGenerator] = useState(EMPTY_COUPON_GENERATOR)
  const [couponFilters, setCouponFilters] = useState(EMPTY_COUPON_FILTERS)
  const [couponError, setCouponError] = useState('')
  const [showCouponGenerator, setShowCouponGenerator] = useState(false)
  const [certificateView, setCertificateView] = useState('detail')
  const [showCertificateEditor, setShowCertificateEditor] = useState(false)
  const [showCertificateSync, setShowCertificateSync] = useState(false)
  const [certificateSyncSourceId, setCertificateSyncSourceId] = useState('')
  const [certificateSyncOptions, setCertificateSyncOptions] = useState([])
  const [certificateSyncLoading, setCertificateSyncLoading] = useState(false)
  const [certificateSyncError, setCertificateSyncError] = useState('')

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

  useEffect(() => {
    const normalized = normalizeSettingsSectionParam(location.search)
    if (normalized !== settingsSection) {
      setSettingsSection(normalized)
    }
  }, [location.search, settingsSection])

  useEffect(() => {
    settingsFormRef.current = settingsForm
  }, [settingsForm])

  useEffect(() => {
    examRef.current = exam
  }, [exam])

  useEffect(() => {
    usersRef.current = users
  }, [users])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const handleTabChange = useCallback((nextTab, nextSection = settingsSection) => {
    if (!TABS.some((item) => item.id === nextTab)) return
    const resolvedSection = SETTINGS_SECTION_IDS.includes(nextSection) ? nextSection : DEFAULT_SETTINGS_SECTION
    setTab(nextTab)
    const params = new URLSearchParams(location.search)
    if (nextTab === 'settings') params.delete('tab')
    else params.set('tab', nextTab)
    if (resolvedSection === DEFAULT_SETTINGS_SECTION) params.delete('section')
    else params.set('section', resolvedSection)
    const search = params.toString()
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : '',
      },
      { replace: true },
    )
  }, [location.pathname, location.search, navigate, settingsSection])

  const hydrateSettingsForm = useCallback((ex) => {
    const cfg = normalizeProctoringConfig(ex?.proctoring_config || {})
    const s = ex?.runtime_settings ?? stripAdminMeta(ex?.settings)
    const certificate = normalizeCertificatePayload(ex?.certificate)
    const scoreReportSettings = normalizeScoreReportSettings(s?.score_report_settings)
    const attachmentItems = normalizeAttachmentEntries(s?.attachment_items, s?.attachment_urls)
    const couponEntries = normalizeCouponEntries(s?.coupon_entries, s?.coupon_code, s?.coupon_discount_type, s?.coupon_discount_value, 'Admin')
    const translationItems = Array.isArray(s?.test_translations)
      ? s.test_translations.map((entry) => normalizeTranslationEntry(entry)).filter(Boolean)
      : []
    const externalAttributes = s?.external_attributes && typeof s.external_attributes === 'object' && !Array.isArray(s.external_attributes)
      ? s.external_attributes
      : null
    const nextForm = {
      title: ex?.title || '',
      description: ex?.description || '',
      code: ex?.code || '',
      time_limit_minutes: String(ex?.time_limit_minutes ?? ex?.time_limit ?? ''),
      max_attempts: String(ex?.max_attempts ?? 1),
      passing_score: ex?.passing_score == null ? '' : String(ex.passing_score),
      proctoring_config: cfg,
      instructions: s.instructions || '',
      instructions_heading: s.instructions_heading || '',
      instructions_body: s.instructions_body || s.instructions || '',
      completion_message: s.completion_message || '',
      instructions_require_acknowledgement: Boolean(s.instructions_require_acknowledgement),
      show_test_instructions: s?.show_test_instructions == null ? true : Boolean(s.show_test_instructions),
      show_test_duration: s?.show_test_duration == null ? true : Boolean(s.show_test_duration),
      show_passing_mark: s?.show_passing_mark == null ? true : Boolean(s.show_passing_mark),
      show_question_count: s?.show_question_count == null ? true : Boolean(s.show_question_count),
      show_remaining_retakes: Boolean(s.show_remaining_retakes),
      show_score_report: Boolean(s.show_score_report),
      show_answer_review: Boolean(s.show_answer_review),
      show_correct_answers: Boolean(s.show_correct_answers),
      email_result_on_submit: Boolean(s.email_result_on_submit),
      report_displayed: ex?.report_displayed || 'IMMEDIATELY_AFTER_GRADING',
      report_content: ex?.report_content || 'SCORE_AND_DETAILS',
      duration_type: s?.duration_type || 'Time defined in each section',
      hide_assignment_metadata: Boolean(s.hide_assignment_metadata),
      hide_finish_until_last_question: Boolean(s.hide_finish_until_last_question),
      enforce_section_order: Boolean(s.enforce_section_order),
      calculator_type: s?.calculator_type || 'No calculator',
      settings_json: Object.keys(s || {}).length ? JSON.stringify(s, null, 2) : '',
      certificate_json: certificate ? JSON.stringify(certificate, null, 2) : '',
      certificate_title: certificate?.title || '',
      certificate_subtitle: certificate?.subtitle || '',
      certificate_issuer: certificate?.issuer || '',
      certificate_signer: certificate?.signer || '',
      certificate_issue_rule: normalizeCertificateIssueRule(certificate?.issue_rule),
      allow_pause: Boolean(s?.allow_pause),
      pause_duration_minutes: s?.pause_duration_minutes != null ? String(s.pause_duration_minutes) : '',
      allow_retake: Boolean(s?.allow_retake),
      retake_cooldown_hours: s?.retake_cooldown_hours != null ? String(s.retake_cooldown_hours) : '',
      reschedule_policy: s?.reschedule_policy || 'NOT_ALLOWED',
      limited_free_reschedules: Boolean(s?.limited_free_reschedules),
      network_access: s?.network_access || 'ALL_NETWORKS',
      auto_logout_after_finish_or_pause: Boolean(s?.auto_logout_after_finish_or_pause),
      require_profile_update: Boolean(s?.require_profile_update),
      result_validity_period_enabled: Boolean(s?.result_validity_period_enabled),
      result_validity_days: s?.result_validity_days != null ? String(s.result_validity_days) : '',
      passing_mark_inclusive: s?.passing_mark_inclusive == null ? true : Boolean(s.passing_mark_inclusive),
      require_positive_proctoring_report: Boolean(s?.require_positive_proctoring_report),
      show_advanced_grading: Boolean(s?.show_advanced_grading),
      custom_score_report_enabled: Boolean(s?.custom_score_report_enabled),
      score_report_heading: scoreReportSettings.heading,
      score_report_intro: scoreReportSettings.intro,
      score_report_include_candidate_summary: scoreReportSettings.include_candidate_summary,
      score_report_include_section_breakdown: scoreReportSettings.include_section_breakdown,
      score_report_include_proctoring_summary: scoreReportSettings.include_proctoring_summary,
      score_report_include_certificate_status: scoreReportSettings.include_certificate_status,
      score_report_include_pass_fail_badge: scoreReportSettings.include_pass_fail_badge,
      report_lifespan_enabled: Boolean(s?.report_lifespan_enabled),
      report_access_duration_enabled: Boolean(s?.report_access_duration_enabled),
      display_subscores_by_pool: Boolean(s?.display_subscores_by_pool),
      display_section_scores: Boolean(s?.display_section_scores),
      display_percentage_required_to_pass: Boolean(s?.display_percentage_required_to_pass),
      display_employee_id: Boolean(s?.display_employee_id),
      display_achieved_score_summary: Boolean(s?.display_achieved_score_summary),
      display_score_description: Boolean(s?.display_score_description),
      show_pass_fail_info: Boolean(s?.show_pass_fail_info),
      display_score_each_question: Boolean(s?.display_score_each_question),
      display_instructor_notes: Boolean(s?.display_instructor_notes),
      display_candidate_groups: Boolean(s?.display_candidate_groups),
      show_full_timestamps: Boolean(s?.show_full_timestamps),
      show_rounded_scores: Boolean(s?.show_rounded_scores),
      export_personal_report_excel: Boolean(s?.export_personal_report_excel),
      export_personal_report_pdf: Boolean(s?.export_personal_report_pdf),
      enable_score_report_download: Boolean(s?.enable_score_report_download),
      enable_knowledge_deficiency_report_download: Boolean(s?.enable_knowledge_deficiency_report_download),
      coupons_enabled: Boolean(s?.coupons_enabled),
      coupon_code: couponEntries[0]?.code || s?.coupon_code || '',
      coupon_discount_type: couponEntries[0]?.discount_type || s?.coupon_discount_type || 'percentage',
      coupon_discount_value: couponEntries[0]?.amount != null ? String(couponEntries[0].amount) : (s?.coupon_discount_value != null ? String(s.coupon_discount_value) : ''),
      coupon_entries: couponEntries,
      language: s?.language || 'en',
      allow_language_override: Boolean(s?.allow_language_override),
      attachment_urls: attachmentItems.map((item) => item.url).join('\n'),
      attachment_items: attachmentItems,
      test_translations: translationItems,
      external_attributes_json: externalAttributes ? JSON.stringify(externalAttributes, null, 2) : '',
      external_id: externalAttributes?.external_id || s?.external_id || '',
      category_id: String(ex?.category_id || ''),
      descriptive_label: s?.descriptive_label || '',
      creation_type: s?.creation_type || 'Test with sections',
      section_count: s?.section_count != null ? String(s.section_count) : String(ex?.question_count ?? 0),
      allow_section_selection: Boolean(s?.allow_section_selection),
    }
    setSettingsForm(nextForm)
    settingsBaselineRef.current = serializeSettingsForm(nextForm)
    setShowCategoryPicker(false)
    setCategoryDraft(EMPTY_CATEGORY_DRAFT)
    setCategoryError('')
    setShowTranslationEditor(false)
    setTranslationDraft(EMPTY_TRANSLATION_DRAFT)
    setEditingTranslationId(null)
    setTranslationError('')
    setShowAttachmentEditor(false)
    setAttachmentDraft(EMPTY_ATTACHMENT_DRAFT)
    setEditingAttachmentId(null)
    setAttachmentError('')
    setShowAttachmentImporter(false)
    setAttachmentImportText('')
    setAttachmentImportError('')
    setShowCouponGenerator(false)
    setCouponGenerator(EMPTY_COUPON_GENERATOR)
    setCouponError('')
    setShowCertificateEditor(Boolean(certificate))
    setShowCertificateSync(false)
    setCertificateSyncSourceId('')
    setCertificateSyncOptions([])
    setCertificateSyncError('')
  }, [])

  useEffect(() => () => {
    if (loadAbortRef.current) loadAbortRef.current.abort()
  }, [])

  const buildAttemptRows = useCallback((attemptItems, userItems, examSessions, uploadStatusMap = new Map()) => {
    const userMap = new Map((userItems || []).map((user) => [String(user.id), user]))
    const sessionByUserId = new Map((examSessions || []).map((session) => [String(session.user_id), session]))

    return (attemptItems || []).map((attempt) => {
      const user = userMap.get(String(attempt.user_id))
      const session = sessionByUserId.get(String(attempt.user_id))
      const uploadStatus = uploadStatusMap.get(String(attempt.id)) || defaultVideoUploadStatus()
      const highAlerts = Number(attempt.high_violations || 0)
      const mediumAlerts = Number(attempt.med_violations || 0)
      const score = highAlerts * 3 + mediumAlerts
      const needsManualReview = attempt.status === 'SUBMITTED' && (attempt.score == null)

      return applyVideoUploadStatus({
        id: String(attempt.id),
        attemptIdFull: String(attempt.id),
        attemptId: String(attempt.id).slice(0, 8),
        username: attempt.user_student_id || user?.user_id || attempt.user_name || user?.name || String(attempt.user_id).slice(0, 8),
        sessionName: session ? `Session ${String(session.id).slice(0, 6)}` : '-',
        status: attempt.status || '-',
        score: typeof attempt.score === 'number' ? attempt.score : null,
        needsManualReview,
        reviewState: needsManualReview
          ? 'Awaiting manual grading'
          : attempt.status === 'GRADED'
            ? 'Finalized'
            : attempt.status === 'SUBMITTED'
              ? 'Auto-scored'
              : 'In progress',
        paused: Boolean(attempt.paused),
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        userGroup: session?.access_mode || '-',
        comment: attempt.paused
          ? 'Paused by proctor'
          : (needsManualReview ? 'Manual grading required' : (attempt.status === 'GRADED' ? 'Reviewed' : attempt.status === 'SUBMITTED' ? 'Submitted' : '')),
        proctorRate: score,
        sessionId: session?.id || '',
        highAlerts,
        mediumAlerts,
      }, uploadStatus)
    })
  }, [])

  const loadVideoUploadStatusMap = useCallback(async (signal) => {
    if (!id || id === 'undefined' || id === 'null') return new Map()
    const { data } = await adminApi.listExamVideoUploadStatus(id, signal ? { signal } : {})
    const items = Array.isArray(data) ? data : []
    return new Map(
      items.map((item) => [String(item.attempt_id), normalizeVideoUploadStatus(item)]),
    )
  }, [id])

  const loadAll = useCallback(async (showSpinner = true) => {
    if (!id || id === 'undefined' || id === 'null') {
      if (isManageRoutePath(location.pathname)) {
        navigate('/admin/tests', { replace: true })
      }
      return
    }
    if (loadAbortRef.current) loadAbortRef.current.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller
    if (showSpinner || !examRef.current) setLoading(true)
    setLoadError('')
    setError('')
    try {
      const requestOptions = { signal: controller.signal }
      const { data: testData } = await adminApi.getTest(id, requestOptions)
      if (controller.signal.aborted) return

      const mergedExam = mergeExamAndTest(null, testData)
      setExam(mergedExam)
      hydrateSettingsForm(mergedExam)

      const needsCategories = tab === 'settings' && settingsSection === 'categories'
      const needsQuestions = tab === 'sections'
      const needsSessions = tab === 'sessions' || tab === 'proctoring'
      const needsUsers = tab === 'sessions' || tab === 'candidates' || tab === 'proctoring'
      const needsAttempts = tab === 'candidates' || tab === 'proctoring' || tab === 'administration' || tab === 'reports'
      const needsUploadStatus = tab === 'proctoring'

      const tasks = []
      if (needsCategories) tasks.push(['categories', adminApi.categories(requestOptions)])
      if (needsQuestions) tasks.push(['questions', adminApi.getQuestions(id, requestOptions)])
      if (needsSessions) tasks.push(['sessions', adminApi.schedules(requestOptions)])
      if (needsUsers) tasks.push(['users', adminApi.users({ role: 'LEARNER', skip: 0, limit: 200 }, requestOptions)])
      if (needsAttempts) tasks.push(['attempts', adminApi.attempts({ exam_id: id, skip: 0, limit: 200 }, requestOptions)])
      if (needsUploadStatus) tasks.push(['uploadStatus', loadVideoUploadStatusMap(controller.signal)])

      if (tasks.length === 0) return

      const results = await Promise.allSettled(tasks.map(([, promise]) => promise))
      if (controller.signal.aborted) return

      const payloads = {}
      const failures = []
      tasks.forEach(([key], index) => {
        const result = results[index]
        if (result.status === 'fulfilled') {
          payloads[key] = result.value?.data ?? result.value
        } else if (!isCanceledRequest(result.reason)) {
          failures.push(readRequestError(result.reason, `Failed to load ${key}.`))
        }
      })

      if (needsCategories) setCategories(payloads.categories || [])
      if (needsQuestions) setQuestions(payloads.questions || [])

      const resolvedUsers = payloads.users != null ? readPaginatedItems(payloads.users) : usersRef.current
      if (needsUsers) setUsers(resolvedUsers)

      const resolvedSessions = payloads.sessions != null
        ? (payloads.sessions || []).filter((session) => String(session.exam_id) === String(id))
        : sessionsRef.current
      if (needsSessions) setSessions(resolvedSessions)

      if (needsAttempts) {
        const resolvedAttempts = payloads.attempts != null ? readPaginatedItems(payloads.attempts) : []
        const uploadStatusMap = payloads.uploadStatus instanceof Map ? payloads.uploadStatus : new Map()
        setAttemptRows(buildAttemptRows(resolvedAttempts, resolvedUsers, resolvedSessions, uploadStatusMap))
      } else if (needsUploadStatus && payloads.uploadStatus instanceof Map) {
        setAttemptRows((prev) => prev.map((row) => applyVideoUploadStatus(row, payloads.uploadStatus.get(String(row.id)))))
      }

      if (failures.length > 0) {
        setLoadError(failures[0])
      }
    } catch (e) {
      if (!isCanceledRequest(e)) {
        setLoadError(readRequestError(e, 'Failed to load test data.'))
      }
    } finally {
      if (!controller.signal.aborted && loadAbortRef.current === controller) {
        loadAbortRef.current = null
        setLoading(false)
      }
    }
  }, [id, location.pathname, navigate, hydrateSettingsForm, loadVideoUploadStatusMap, tab, settingsSection, buildAttemptRows])

  const loadAllRef = useRef(loadAll)
  useEffect(() => {
    loadAllRef.current = loadAll
  }, [loadAll])

  useEffect(() => {
    const shouldShowSpinner = !examRef.current || String(examRef.current.id) !== String(id)
    void loadAllRef.current(shouldShowSpinner)
  }, [id, tab, settingsSection])

  const refreshAttemptVideoUploadStatus = useCallback(async () => {
    if (!id || id === 'undefined' || id === 'null') return
    try {
      const uploadStatusMap = await loadVideoUploadStatusMap()
      setAttemptRows((prev) => prev.map((row) => applyVideoUploadStatus(row, uploadStatusMap.get(String(row.id)))))
    } catch (refreshError) {
      console.warn('Failed to refresh admin video upload status.', refreshError)
    }
  }, [id, loadVideoUploadStatusMap])

  useEffect(() => {
    if (tab !== 'proctoring' || view !== 'candidate_monitoring') return undefined
    void refreshAttemptVideoUploadStatus()
    const intervalId = window.setInterval(() => {
      void refreshAttemptVideoUploadStatus()
    }, 5000)
    return () => window.clearInterval(intervalId)
  }, [refreshAttemptVideoUploadStatus, tab, view])

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
  const couponRows = Array.isArray(settingsForm.coupon_entries) ? settingsForm.coupon_entries : []
  const couponStatusOptions = useMemo(
    () => Array.from(new Set(couponRows.map((row) => String(row.status || 'Draft').trim()).filter(Boolean))),
    [couponRows],
  )
  const filteredCouponRows = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(couponFilters).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]),
    )
    return couponRows.filter((row) => {
      const discountTypeMatches = !normalizedFilters.discount_type || row.discount_type === normalizedFilters.discount_type
      const statusMatches = !normalizedFilters.status || String(row.status || 'Draft').trim().toLowerCase() === normalizedFilters.status
      if (!discountTypeMatches || !statusMatches) return false
      return [
        ['code', row.code],
        ['amount', row.amount],
        ['expiration_time', row.expiration_time],
        ['used_by', row.used_by],
        ['date_of_use', row.date_of_use],
        ['created_by', row.created_by],
      ].every(([field, value]) => {
        const filterValue = normalizedFilters[field]
        if (!filterValue) return true
        return String(value || '').toLowerCase().includes(filterValue)
      })
    })
  }, [couponFilters, couponRows])
  const couponHasActiveFilters = Object.values(couponFilters).some((value) => String(value || '').trim())
  const candidateRows = useMemo(() => {
    const sessionOnlyRows = sessions
      .filter((session) => !attemptRows.some((attempt) => String(attempt.sessionId) === String(session.id)))
      .map((session) => {
        const learner = users.find((user) => String(user.id) === String(session.user_id))
        return applyVideoUploadStatus({
          id: `scheduled-${session.id}`,
          attemptIdFull: null,
          attemptId: '-',
          username: learner?.user_id || learner?.name || String(session.user_id).slice(0, 8),
          status: 'NOT_STARTED',
          score: null,
          needsManualReview: false,
          reviewState: 'Scheduled, not started',
          paused: false,
          startedAt: null,
          submittedAt: null,
          userGroup: session.access_mode || '-',
          comment: session.notes || 'Waiting for learner to start',
          proctorRate: 0,
          sessionId: session.id,
          sessionName: `Session ${String(session.id).slice(0, 6)}`,
          highAlerts: 0,
          mediumAlerts: 0,
        }, defaultVideoUploadStatus())
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
    const url = `/admin/attempts/${row.attemptIdFull}/videos`
    window.open(url, '_blank', 'noopener,noreferrer')
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
        if (!r.attemptIdFull) continue
        if (toPause && !r.paused) await adminApi.pauseAttempt(r.attemptIdFull)
        if (!toPause && r.paused) await adminApi.resumeAttempt(r.attemptIdFull)
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
    await Promise.resolve()
    const form = settingsFormRef.current
    const trimmedTitle = form.title.trim()
    const trimmedCode = form.code.trim()
    const parsedSettings = safeJsonParse(form.settings_json, null)
    if (parsedSettings === '__INVALID__') return withError('Invalid JSON in settings block.')

    const timeLimit = form.time_limit_minutes === '' ? null : Number(form.time_limit_minutes)
    const maxAttempts = form.max_attempts === '' ? 1 : Number(form.max_attempts)
    const passingScore = form.passing_score === '' ? null : Number(form.passing_score)
    const pauseDurationMinutes = form.pause_duration_minutes === '' ? null : Number(form.pause_duration_minutes)
    const retakeCooldownHours = form.retake_cooldown_hours === '' ? null : Number(form.retake_cooldown_hours)
    const sectionCount = form.section_count === '' ? 0 : Number(form.section_count)
    const resultValidityDays = form.result_validity_days === '' ? null : Number(form.result_validity_days)
    const certificatePayload = normalizeCertificatePayload({
      title: form.certificate_title,
      subtitle: form.certificate_subtitle,
      issuer: form.certificate_issuer,
      signer: form.certificate_signer,
      issue_rule: form.certificate_issue_rule,
    })
    const attachmentItems = normalizeAttachmentEntries(form.attachment_items, form.attachment_urls)
    const attachmentUrls = attachmentItems.map((item) => item.url)
    const couponEntries = normalizeCouponEntries(
      form.coupon_entries,
      form.coupon_code,
      form.coupon_discount_type,
      form.coupon_discount_value,
      couponCreatedBy,
    )
    const translationEntries = (Array.isArray(form.test_translations) ? form.test_translations : [])
      .map((entry) => normalizeTranslationEntry(entry))
      .filter(Boolean)
    const scoreReportSettings = normalizeScoreReportSettings({
      heading: form.score_report_heading,
      intro: form.score_report_intro,
      include_candidate_summary: form.score_report_include_candidate_summary,
      include_section_breakdown: form.score_report_include_section_breakdown,
      include_proctoring_summary: form.score_report_include_proctoring_summary,
      include_certificate_status: form.score_report_include_certificate_status,
      include_pass_fail_badge: form.score_report_include_pass_fail_badge,
    })

    if (!trimmedTitle) return withError('Title is required.')
    if (timeLimit != null && (!Number.isFinite(timeLimit) || timeLimit <= 0)) return withError('Time limit must be positive.')
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) return withError('Max attempts must be between 1 and 20.')
    if (maxAttempts > 1 && !form.allow_retake) return withError('Enable retakes or reduce max attempts to 1.')
    if (passingScore != null && (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100)) return withError('Passing score must be between 0 and 100.')
    if (!Number.isFinite(sectionCount) || sectionCount < 0 || sectionCount > 99) return withError('Test sections must be between 0 and 99.')
    if (form.allow_pause && pauseDurationMinutes != null && (!Number.isFinite(pauseDurationMinutes) || pauseDurationMinutes <= 0)) {
      return withError('Pause duration must be a positive number of minutes.')
    }
    if (form.allow_retake && retakeCooldownHours != null && (!Number.isFinite(retakeCooldownHours) || retakeCooldownHours < 0)) {
      return withError('Retake cooldown must be zero or greater.')
    }
    if (form.result_validity_period_enabled && resultValidityDays != null && (!Number.isFinite(resultValidityDays) || resultValidityDays <= 0)) {
      return withError('Result validity days must be a positive number.')
    }

    let parsedExternalAttrs = null
    if (form.external_attributes_json) {
      try { parsedExternalAttrs = JSON.parse(form.external_attributes_json) }
      catch { return withError('Invalid JSON in external attributes.') }
    }
    if (parsedExternalAttrs != null && (typeof parsedExternalAttrs !== 'object' || Array.isArray(parsedExternalAttrs))) {
      return withError('External attributes must be a JSON object.')
    }
    if (form.external_id.trim()) {
      parsedExternalAttrs = { ...(parsedExternalAttrs || {}), external_id: form.external_id.trim() }
    }

    const runtimeSettings = {
      ...(parsedSettings || {}),
      instructions: form.instructions || '',
      instructions_heading: form.instructions_heading || '',
      instructions_body: form.instructions_body || '',
      completion_message: form.completion_message || '',
      instructions_require_acknowledgement: form.instructions_require_acknowledgement,
      show_test_instructions: form.show_test_instructions,
      show_test_duration: form.show_test_duration,
      show_passing_mark: form.show_passing_mark,
      show_question_count: form.show_question_count,
      show_remaining_retakes: form.show_remaining_retakes,
      show_score_report: form.show_score_report,
      show_answer_review: form.show_answer_review,
      show_correct_answers: form.show_correct_answers,
      email_result_on_submit: form.email_result_on_submit,
      duration_type: form.duration_type,
      hide_assignment_metadata: form.hide_assignment_metadata,
      hide_finish_until_last_question: form.hide_finish_until_last_question,
      enforce_section_order: form.enforce_section_order,
      calculator_type: form.calculator_type,
      allow_pause: form.allow_pause,
      pause_duration_minutes: form.allow_pause ? pauseDurationMinutes : null,
      allow_retake: form.allow_retake,
      retake_cooldown_hours: form.allow_retake ? retakeCooldownHours : null,
      reschedule_policy: form.reschedule_policy,
      limited_free_reschedules: form.limited_free_reschedules,
      network_access: form.network_access,
      auto_logout_after_finish_or_pause: form.auto_logout_after_finish_or_pause,
      require_profile_update: form.require_profile_update,
      result_validity_period_enabled: form.result_validity_period_enabled,
      result_validity_days: form.result_validity_period_enabled ? resultValidityDays : null,
      passing_mark_inclusive: form.passing_mark_inclusive,
      require_positive_proctoring_report: form.require_positive_proctoring_report,
      show_advanced_grading: form.show_advanced_grading,
      custom_score_report_enabled: form.custom_score_report_enabled,
      report_lifespan_enabled: form.report_lifespan_enabled,
      report_access_duration_enabled: form.report_access_duration_enabled,
      display_subscores_by_pool: form.display_subscores_by_pool,
      display_section_scores: form.display_section_scores,
      display_percentage_required_to_pass: form.display_percentage_required_to_pass,
      display_employee_id: form.display_employee_id,
      display_achieved_score_summary: form.display_achieved_score_summary,
      display_score_description: form.display_score_description,
      show_pass_fail_info: form.show_pass_fail_info,
      display_score_each_question: form.display_score_each_question,
      display_instructor_notes: form.display_instructor_notes,
      display_candidate_groups: form.display_candidate_groups,
      show_full_timestamps: form.show_full_timestamps,
      show_rounded_scores: form.show_rounded_scores,
      export_personal_report_excel: form.export_personal_report_excel,
      export_personal_report_pdf: form.export_personal_report_pdf,
      enable_score_report_download: form.enable_score_report_download,
      enable_knowledge_deficiency_report_download: form.enable_knowledge_deficiency_report_download,
      coupons_enabled: couponEntries.length > 0,
      coupon_entries: couponEntries,
      coupon_code: couponEntries[0]?.code || null,
      coupon_discount_type: couponEntries[0]?.discount_type || form.coupon_discount_type,
      coupon_discount_value: couponEntries[0]?.amount ?? null,
      language: form.language,
      allow_language_override: form.allow_language_override,
      attachment_items: attachmentItems,
      attachment_urls: attachmentUrls,
      test_translations: translationEntries,
      score_report_settings: scoreReportSettings,
      external_attributes: parsedExternalAttrs,
      descriptive_label: form.descriptive_label.trim(),
      creation_type: form.creation_type || 'Test with sections',
      section_count: Math.floor(sectionCount),
      allow_section_selection: form.allow_section_selection,
    }
    const adminPayload = isPublished
      ? {
          name: trimmedTitle,
          description: form.description || null,
        }
      : {
          code: trimmedCode || null,
          name: trimmedTitle,
          description: form.description || null,
          type: exam.type,
          node_id: exam.node_id || undefined,
          category_id: form.category_id || exam.category_id || undefined,
          grading_scale_id: exam.grading_scale_id || undefined,
          report_displayed: form.report_displayed,
          report_content: form.report_content,
          time_limit_minutes: timeLimit,
          attempts_allowed: Math.floor(maxAttempts),
          passing_score: passingScore,
          runtime_settings: runtimeSettings,
          proctoring_config: normalizeProctoringConfig(form.proctoring_config || {}),
          certificate: certificatePayload,
        }

    setSavingSettings(true)
    let saved = false
    try {
      await adminApi.updateTest(exam.id, adminPayload)
      saved = true
      withNotice('Settings saved.')
    } catch (e) {
      withError(e.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setSavingSettings(false)
    }
    if (saved) {
      void loadAll(false)
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
    const section = MENU_TO_SECTION[item] || DEFAULT_SETTINGS_SECTION
    handleTabChange('settings', section)
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

  const settingsDirty = !loading && Boolean(exam) && serializeSettingsForm(settingsForm) !== settingsBaselineRef.current

  useUnsavedChanges(tab === 'settings' && settingsDirty && !savingSettings)

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
  const createdByUser = users.find((user) => String(user.id) === String(exam.created_by_id || ''))
  const createdByLabel = createdByUser?.user_id || createdByUser?.name || 'Unavailable'
  const couponCreatedBy = createdByLabel !== 'Unavailable' ? createdByLabel : 'Admin'
  const updatedByLabel = createdByUser?.user_id || createdByUser?.name || 'Unavailable'
  const basicPageInitials = getBrandInitials(settingsForm.title || exam.title)
  const basicPageStatus = isPublished ? 'Published' : isArchived ? 'Archived' : 'Draft'
  const openCycleTab = (nextTab, nextSection = null) => {
    handleTabChange(nextTab, nextSection || settingsSection)
  }
  const handleSettingsCancel = () => {
    if (!exam) return
    hydrateSettingsForm(exam)
    setError('')
    setNotice('')
  }

  const isBrowserLockdownEnabled = LOCKDOWN_KEYS.some((key) => Boolean(settingsForm.proctoring_config?.[key]))
  const isProctoringEnabled = [...PROCTORING_MONITOR_KEYS, 'lighting_required', 'screen_capture']
    .some((key) => Boolean(settingsForm.proctoring_config?.[key]))
  const translationRows = Array.isArray(settingsForm.test_translations) ? settingsForm.test_translations : []
  const attachmentRows = Array.isArray(settingsForm.attachment_items) ? settingsForm.attachment_items : []
  const selectedCategory = categories.find((category) => String(category.id) === String(settingsForm.category_id || ''))
  const certificatePreview = normalizeCertificatePayload({
    title: settingsForm.certificate_title,
    subtitle: settingsForm.certificate_subtitle,
    issuer: settingsForm.certificate_issuer,
    signer: settingsForm.certificate_signer,
    issue_rule: settingsForm.certificate_issue_rule,
  })

  const setCheckboxField = (field) => (e) => setSettingsForm((prev) => ({ ...prev, [field]: e.target.checked }))
  const setTextField = (field) => (e) => setSettingsForm((prev) => ({ ...prev, [field]: e.target.value }))
  const setCouponFilterField = (field) => (event) => {
    const value = event.target.value
    setCouponFilters((prev) => ({ ...prev, [field]: value }))
  }
  const setCertificateField = (field) => (e) => {
    const value = e.target.value
    setSettingsForm((prev) => {
      const next = { ...prev, [field]: value }
      next.certificate_json = JSON.stringify(normalizeCertificatePayload({
        title: field === 'certificate_title' ? value : next.certificate_title,
        subtitle: field === 'certificate_subtitle' ? value : next.certificate_subtitle,
        issuer: field === 'certificate_issuer' ? value : next.certificate_issuer,
        signer: field === 'certificate_signer' ? value : next.certificate_signer,
        issue_rule: field === 'certificate_issue_rule' ? value : next.certificate_issue_rule,
      }) || {}, null, 2)
      return next
    })
  }
  const setBrowserLockdownEnabled = (checked) => {
    setSettingsForm((prev) => ({
      ...prev,
      proctoring_config: {
        ...(prev.proctoring_config || {}),
        ...Object.fromEntries(LOCKDOWN_KEYS.map((key) => [key, checked])),
      },
    }))
  }
  const setProctoringEnabled = (checked) => {
    setSettingsForm((prev) => ({
      ...prev,
      proctoring_config: {
        ...(prev.proctoring_config || {}),
        ...Object.fromEntries([...PROCTORING_MONITOR_KEYS, 'lighting_required', 'screen_capture'].map((key) => [key, checked])),
      },
    }))
  }
  const setProctoringConfigField = (field) => (event) => {
    const checked = event.target.checked
    setSettingsForm((prev) => ({
      ...prev,
      proctoring_config: {
        ...(prev.proctoring_config || {}),
        [field]: checked,
      },
    }))
  }
  const startCreateTranslation = () => {
    setTranslationDraft({
      ...EMPTY_TRANSLATION_DRAFT,
      language: settingsForm.language || 'ar',
    })
    setEditingTranslationId(null)
    setTranslationError('')
    setShowTranslationEditor(true)
  }
  const startEditTranslation = (translation) => {
    setTranslationDraft({
      language: translation.language || settingsForm.language || 'ar',
      title: translation.title || '',
      description: translation.description || '',
      instructions_body: translation.instructions_body || '',
      completion_message: translation.completion_message || '',
    })
    setEditingTranslationId(translation.id)
    setTranslationError('')
    setShowTranslationEditor(true)
  }
  const cancelTranslationEditor = () => {
    setShowTranslationEditor(false)
    setEditingTranslationId(null)
    setTranslationDraft({
      ...EMPTY_TRANSLATION_DRAFT,
      language: settingsForm.language || 'ar',
    })
    setTranslationError('')
  }
  const saveTranslationDraft = () => {
    const normalized = normalizeTranslationEntry({
      ...translationDraft,
      id: editingTranslationId || buildLocalId('translation'),
    })
    if (!normalized) {
      setTranslationError('Choose a language and add at least one translated field.')
      return
    }
    const duplicateLanguage = translationRows.some((entry) => (
      entry.id !== normalized.id
      && String(entry.language).toLowerCase() === String(normalized.language).toLowerCase()
    ))
    if (duplicateLanguage) {
      setTranslationError('A translation for this language already exists.')
      return
    }
    setSettingsForm((prev) => {
      const current = Array.isArray(prev.test_translations) ? prev.test_translations : []
      const nextTranslations = editingTranslationId
        ? current.map((entry) => (entry.id === editingTranslationId ? normalized : entry))
        : [...current, normalized]
      return { ...prev, test_translations: nextTranslations }
    })
    cancelTranslationEditor()
    withNotice('Translation updated. Save settings to persist it.')
  }
  const removeTranslationEntry = (translationId) => {
    setSettingsForm((prev) => ({
      ...prev,
      test_translations: (Array.isArray(prev.test_translations) ? prev.test_translations : [])
        .filter((entry) => entry.id !== translationId),
    }))
    if (editingTranslationId === translationId) {
      cancelTranslationEditor()
    }
    withNotice('Translation removed from this draft.')
  }
  const startCreateAttachment = () => {
    setAttachmentDraft(EMPTY_ATTACHMENT_DRAFT)
    setEditingAttachmentId(null)
    setAttachmentError('')
    setShowAttachmentEditor(true)
  }
  const startEditAttachment = (attachment) => {
    setAttachmentDraft({
      title: attachment.title || '',
      url: attachment.url || '',
      type: attachment.type || 'LINK',
    })
    setEditingAttachmentId(attachment.id)
    setAttachmentError('')
    setShowAttachmentEditor(true)
  }
  const cancelAttachmentEditor = () => {
    setAttachmentDraft(EMPTY_ATTACHMENT_DRAFT)
    setEditingAttachmentId(null)
    setAttachmentError('')
    setShowAttachmentEditor(false)
  }
  const saveAttachmentDraft = () => {
    const normalized = normalizeAttachmentEntry({
      ...attachmentDraft,
      id: editingAttachmentId || buildLocalId('attachment'),
    }, attachmentRows.length + 1)
    if (!normalized) {
      setAttachmentError('Attachment URL is required.')
      return
    }
    setSettingsForm((prev) => {
      const current = Array.isArray(prev.attachment_items) ? prev.attachment_items : []
      const nextItems = editingAttachmentId
        ? current.map((entry) => (entry.id === editingAttachmentId ? normalized : entry))
        : [...current, normalized]
      return {
        ...prev,
        attachment_items: nextItems,
        attachment_urls: nextItems.map((entry) => entry.url).join('\n'),
      }
    })
    cancelAttachmentEditor()
    withNotice('Attachment updated. Save settings to persist it.')
  }
  const removeAttachmentItem = (attachmentId) => {
    setSettingsForm((prev) => {
      const nextItems = (Array.isArray(prev.attachment_items) ? prev.attachment_items : [])
        .filter((entry) => entry.id !== attachmentId)
      return {
        ...prev,
        attachment_items: nextItems,
        attachment_urls: nextItems.map((entry) => entry.url).join('\n'),
      }
    })
    if (editingAttachmentId === attachmentId) {
      cancelAttachmentEditor()
    }
    withNotice('Attachment removed from this draft.')
  }
  const importAttachmentRows = () => {
    const lines = attachmentImportText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length) {
      setAttachmentImportError('Paste at least one attachment URL or "Title | URL" row.')
      return
    }
    const imported = lines
      .map((line, index) => {
        const [left, right] = line.includes('|')
          ? line.split('|').map((value) => value.trim())
          : ['', line]
        return normalizeAttachmentEntry({
          id: buildLocalId('attachment'),
          title: left,
          url: right || left,
          type: 'LINK',
        }, attachmentRows.length + index + 1)
      })
      .filter(Boolean)
    if (!imported.length) {
      setAttachmentImportError('No valid attachment rows were found.')
      return
    }
    setSettingsForm((prev) => {
      const nextItems = [...(Array.isArray(prev.attachment_items) ? prev.attachment_items : []), ...imported]
      return {
        ...prev,
        attachment_items: nextItems,
        attachment_urls: nextItems.map((entry) => entry.url).join('\n'),
      }
    })
    setAttachmentImportText('')
    setAttachmentImportError('')
    setShowAttachmentImporter(false)
    withNotice(`${imported.length} attachment${imported.length === 1 ? '' : 's'} added. Save settings to persist them.`)
  }
  const handleGenerateCoupons = () => {
    const prefix = sanitizeCouponPrefix(couponGenerator.prefix)
    const count = Number(couponGenerator.count)
    const amount = Number(couponGenerator.amount)
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      setCouponError('Coupon count must be between 1 and 100.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setCouponError('Coupon amount must be greater than 0.')
      return
    }
    if (couponGenerator.discount_type === 'percentage' && amount > 100) {
      setCouponError('Percentage discounts cannot exceed 100.')
      return
    }
    const nextRows = Array.from({ length: count }).map((_, index) => normalizeCouponEntry({
      id: buildLocalId('coupon'),
      code: `${prefix}-${String(couponRows.length + index + 1).padStart(3, '0')}`,
      discount_type: couponGenerator.discount_type,
      amount,
      status: 'Draft',
      expiration_time: couponGenerator.expiration_time,
      used_by: '',
      date_of_use: '',
      created_by: couponCreatedBy,
    }, couponRows.length + index + 1)).filter(Boolean)
    setSettingsForm((prev) => {
      const current = Array.isArray(prev.coupon_entries) ? prev.coupon_entries : []
      const merged = [...current, ...nextRows]
      return {
        ...prev,
        coupons_enabled: merged.length > 0,
        coupon_entries: merged,
        coupon_code: merged[0]?.code || '',
        coupon_discount_type: merged[0]?.discount_type || 'percentage',
        coupon_discount_value: merged[0]?.amount != null ? String(merged[0].amount) : '',
      }
    })
    setCouponError('')
    setShowCouponGenerator(false)
    setCouponGenerator(EMPTY_COUPON_GENERATOR)
    withNotice(`${nextRows.length} coupon${nextRows.length === 1 ? '' : 's'} generated. Save settings to persist them.`)
  }
  const removeCouponEntry = (couponId) => {
    setSettingsForm((prev) => {
      const merged = (Array.isArray(prev.coupon_entries) ? prev.coupon_entries : [])
        .filter((entry) => entry.id !== couponId)
      return {
        ...prev,
        coupons_enabled: merged.length > 0,
        coupon_entries: merged,
        coupon_code: merged[0]?.code || '',
        coupon_discount_type: merged[0]?.discount_type || 'percentage',
        coupon_discount_value: merged[0]?.amount != null ? String(merged[0].amount) : '',
      }
    })
    withNotice('Coupon removed from this draft.')
  }
  const clearCertificateDraft = () => {
    setSettingsForm((prev) => ({
      ...prev,
      certificate_title: '',
      certificate_subtitle: '',
      certificate_issuer: '',
      certificate_signer: '',
      certificate_issue_rule: DEFAULT_CERTIFICATE_ISSUE_RULE,
      certificate_json: '',
    }))
    setShowCertificateEditor(false)
    withNotice('Certificate cleared from this draft.')
  }
  const toggleCertificateSync = async () => {
    if (showCertificateSync) {
      setShowCertificateSync(false)
      return
    }
    setShowCertificateSync(true)
    setCertificateSyncError('')
    if (certificateSyncOptions.length) return
    setCertificateSyncLoading(true)
    try {
      const { data } = await adminApi.allTests()
      const options = (data?.items || [])
        .filter((item) => String(item.id) !== String(exam?.id) && normalizeCertificatePayload(item.certificate))
      setCertificateSyncOptions(options)
      if (options[0]) {
        setCertificateSyncSourceId(String(options[0].id))
      }
      if (!options.length) {
        setCertificateSyncError('No other tests with certificate settings were found.')
      }
    } catch (e) {
      setCertificateSyncError(e.response?.data?.detail || 'Failed to load certificate sources.')
    } finally {
      setCertificateSyncLoading(false)
    }
  }
  const applySyncedCertificate = () => {
    const source = certificateSyncOptions.find((item) => String(item.id) === String(certificateSyncSourceId))
    const normalized = normalizeCertificatePayload(source?.certificate)
    if (!normalized) {
      setCertificateSyncError('Choose a test with a valid certificate configuration.')
      return
    }
    setSettingsForm((prev) => ({
      ...prev,
      certificate_title: normalized.title || '',
      certificate_subtitle: normalized.subtitle || '',
      certificate_issuer: normalized.issuer || '',
      certificate_signer: normalized.signer || '',
      certificate_issue_rule: normalizeCertificateIssueRule(normalized.issue_rule),
      certificate_json: JSON.stringify(normalized, null, 2),
    }))
    setShowCertificateEditor(true)
    setShowCertificateSync(false)
    setCertificateSyncError('')
    withNotice(`Certificate synchronized from ${source?.name || 'the selected test'}. Save settings to persist it.`)
  }
  const handleCreateCategory = async () => {
    const payload = {
      name: categoryDraft.name.trim(),
      type: 'TEST',
      description: categoryDraft.description.trim(),
    }
    if (!payload.name) {
      setCategoryError('Category name is required.')
      return
    }
    setCategoryBusy(true)
    setCategoryError('')
    try {
      const { data: created } = await adminApi.createCategory(payload)
      const { data: categoryRows } = await adminApi.categories()
      const nextCategories = categoryRows || []
      const resolvedCategory = created?.id
        ? created
        : nextCategories.find((category) => String(category.name || '').toLowerCase() === payload.name.toLowerCase())
      setCategories(nextCategories)
      setSettingsForm((prev) => ({ ...prev, category_id: String(resolvedCategory?.id || '') }))
      setShowCategoryPicker(true)
      setCategoryDraft(EMPTY_CATEGORY_DRAFT)
      withNotice('Category created and assigned to this test draft.')
    } catch (e) {
      setCategoryError(e.response?.data?.detail || 'Failed to create category.')
    } finally {
      setCategoryBusy(false)
    }
  }
  const renderSettingsPageIcon = (iconPath) => (
    <span className={styles.settingsPageIcon} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d={iconPath} />
      </svg>
    </span>
  )
  const renderSettingsPageHeader = (title, description, iconPath, actions = null) => (
    <div className={styles.settingsPageIntro}>
      <div>
        <div className={styles.settingsPageTitle}>
          {renderSettingsPageIcon(iconPath)}
          <h3>{title}</h3>
        </div>
        {description ? <p className={styles.settingsPageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.settingsPageActions}>{actions}</div> : null}
    </div>
  )
  const renderSettingsFooter = (saveLabel = 'Save') => (
    <div className={styles.settingsPageFooter}>
      <button type="button" className={styles.blueBtn} disabled={savingSettings || isArchived} onClick={handleSettingsSave}>
        {savingSettings ? 'Saving...' : saveLabel}
      </button>
      <button type="button" className={styles.ghostBtn} onClick={handleSettingsCancel}>Cancel</button>
    </div>
  )

  const renderSettingsPanel = () => {
    switch (settingsSection) {
      case 'instructions':
        return (
          <>
            {renderSettingsPageHeader(
              'Test instructions dialog settings',
              'Define retake options and the ability to pause or resume during the testing session availability period. These settings must be defined in each section separately.',
              SETTINGS_PAGE_ICONS.instructions,
            )}
            <div id="settings-instructions" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.instructions)}
                  <h4>Test overview options</h4>
                </div>
                <div className={styles.settingsCheckboxList}>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.instructions_require_acknowledgement)} onChange={setCheckboxField('instructions_require_acknowledgement')} />
                    <span>Require acknowledgment of instructions</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.show_test_instructions)} onChange={setCheckboxField('show_test_instructions')} />
                    <span>Show test instructions</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.show_test_duration)} onChange={setCheckboxField('show_test_duration')} />
                    <span>Show test duration</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.show_passing_mark)} onChange={setCheckboxField('show_passing_mark')} />
                    <span>Show passing mark</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.show_question_count)} onChange={setCheckboxField('show_question_count')} />
                    <span>Show the number of questions</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.show_remaining_retakes)} onChange={setCheckboxField('show_remaining_retakes')} />
                    <span>Show remaining number of retakes</span>
                  </label>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <label className={styles.settingsFieldGroup}>
                  <span>Instructions heading</span>
                  <input value={settingsForm.instructions_heading || ''} disabled={lockedExamFields} onChange={setTextField('instructions_heading')} />
                </label>
              </div>

              <div className={styles.sectionCard}>
                <label className={styles.settingsFieldGroup}>
                  <span>Instructions body</span>
                  <textarea className={styles.settingsEditor} value={settingsForm.instructions_body || ''} disabled={lockedExamFields} onChange={setTextField('instructions_body')} rows={8} />
                </label>
              </div>

              <div className={styles.sectionCard}>
                <label className={styles.settingsFieldGroup}>
                  <span>Test completion message</span>
                  <textarea className={styles.settingsEditor} value={settingsForm.completion_message || ''} disabled={lockedExamFields} onChange={setTextField('completion_message')} rows={5} />
                </label>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'duration':
        return (
          <>
            {renderSettingsPageHeader(
              'Duration and layout',
              'Configure the test duration and layout settings. Choose whether questions appear on a single page or separate pages, hide assignment metadata from the My Tests page, restrict the Finish test button until the last question, and enable a calculator during the test-taking process.',
              SETTINGS_PAGE_ICONS.duration,
            )}
            <div id="settings-duration" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <div className={styles.settingsFormStack}>
                  <label className={styles.settingsFieldGroup}>
                    <span>Duration type</span>
                    <select disabled={lockedExamFields} value={settingsForm.duration_type} onChange={setTextField('duration_type')}>
                      <option value="Time defined in each section">Time defined in each section</option>
                      <option value="Single timer for full test">Single timer for full test</option>
                    </select>
                  </label>
                  <label className={styles.settingsFieldGroup}>
                    <span>Page format *</span>
                    <div className={styles.inlineReadOnlyField}>
                      <span>Page format must be set in each section separately.</span>
                      <button type="button" className={styles.inlineLinkButton} onClick={() => openCycleTab('sections')}>Go to test sections</button>
                    </div>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.hide_assignment_metadata)} onChange={setCheckboxField('hide_assignment_metadata')} />
                    <span>Hide assignment metadata</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.hide_finish_until_last_question)} onChange={setCheckboxField('hide_finish_until_last_question')} />
                    <span>Hide "Finish test" button until last question</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.enforce_section_order)} onChange={setCheckboxField('enforce_section_order')} />
                    <span>Enforce section order</span>
                  </label>
                  <label className={styles.settingsFieldGroup}>
                    <span>Calculator type</span>
                    <select disabled={lockedExamFields} value={settingsForm.calculator_type} onChange={setTextField('calculator_type')}>
                      <option value="No calculator">No calculator</option>
                      <option value="Simple calculator">Simple calculator</option>
                      <option value="Advanced calculator">Advanced calculator</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'security':
        return (
          <>
            {renderSettingsPageHeader(
              'Security settings',
              'Configure security settings by enabling the Lockdown Browser to enforce full-screen mode and prevent navigation outside the test, and by activating proctoring to monitor candidates and prevent cheating. You can also restrict access to specific internal networks or allow all networks, require candidates to update their profiles before starting the survey, and automatically log them out after completion.',
              SETTINGS_PAGE_ICONS.security,
            )}
            <div id="settings-security" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <label className={styles.settingsInlineCheck}>
                  <input type="checkbox" disabled={lockedExamFields} checked={isBrowserLockdownEnabled} onChange={(e) => setBrowserLockdownEnabled(e.target.checked)} />
                  <span>Enable browser lockdown by default</span>
                </label>
              </div>
              <div className={styles.sectionCard}>
                <label className={styles.settingsInlineCheck}>
                  <input type="checkbox" disabled={lockedExamFields} checked={isProctoringEnabled} onChange={(e) => setProctoringEnabled(e.target.checked)} />
                  <span>Enable proctoring</span>
                </label>
              </div>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.review)}
                  <h4>Proctoring checks</h4>
                </div>
                <p className={styles.sectionDescription}>Choose which live checks the system enforces while candidates are taking the test.</p>
                <div className={styles.settingsTwoColumnChecks}>
                  <div className={styles.settingsCheckboxList}>
                    {['lighting_required', 'face_detection', 'multi_face', 'eye_tracking'].map((field) => (
                      <label key={field} className={styles.settingsInlineCheck}>
                        <input
                          type="checkbox"
                          disabled={lockedExamFields}
                          checked={Boolean(settingsForm.proctoring_config?.[field])}
                          onChange={setProctoringConfigField(field)}
                        />
                        <span>{PROCTOR_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  <div className={styles.settingsCheckboxList}>
                    {['head_pose_detection', 'audio_detection', 'object_detection', 'screen_capture'].map((field) => (
                      <label key={field} className={styles.settingsInlineCheck}>
                        <input
                          type="checkbox"
                          disabled={lockedExamFields}
                          checked={Boolean(settingsForm.proctoring_config?.[field])}
                          onChange={setProctoringConfigField(field)}
                        />
                        <span>{PROCTOR_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.sectionCard}>
                <label className={styles.settingsFieldGroup}>
                  <span>Network access *</span>
                  <select disabled={lockedExamFields} value={settingsForm.network_access} onChange={setTextField('network_access')}>
                    <option value="ALL_NETWORKS">All networks</option>
                    <option value="INTERNAL_ONLY">Internal networks only</option>
                    <option value="ALLOWLIST_ONLY">Allowlist only</option>
                  </select>
                </label>
              </div>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCheckboxList}>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.auto_logout_after_finish_or_pause)} onChange={setCheckboxField('auto_logout_after_finish_or_pause')} />
                    <span>Automatically log out candidate after finishing or pausing</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.require_profile_update)} onChange={setCheckboxField('require_profile_update')} />
                    <span>Require updating user profile</span>
                  </label>
                </div>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'retake':
        return (
          <>
            {renderSettingsPageHeader(
              'Pause, retake and reschedule settings',
              'Define retake options and the ability to pause or resume during the testing session availability period.',
              SETTINGS_PAGE_ICONS.retake,
            )}
            <div id="settings-retake" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCheckboxList}>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.allow_pause)} onChange={setCheckboxField('allow_pause')} />
                    <span>Allow test continuation</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.allow_retake)} onChange={setCheckboxField('allow_retake')} />
                    <span>Allow test retaking</span>
                  </label>
                </div>
              </div>
              {settingsForm.allow_pause ? (
                <div className={styles.sectionCard}>
                  <label className={styles.settingsFieldGroup}>
                    <span>Pause duration (minutes)</span>
                    <input type="number" min="1" value={settingsForm.pause_duration_minutes} disabled={lockedExamFields} onChange={setTextField('pause_duration_minutes')} />
                  </label>
                </div>
              ) : null}
              {settingsForm.allow_retake ? (
                <div className={styles.sectionCard}>
                  <label className={styles.settingsFieldGroup}>
                    <span>Retake cooldown (hours)</span>
                    <input type="number" min="0" step="1" value={settingsForm.retake_cooldown_hours} disabled={lockedExamFields} onChange={setTextField('retake_cooldown_hours')} />
                  </label>
                </div>
              ) : null}
              <div className={styles.sectionCard}>
                <label className={styles.settingsInlineCheck}>
                  <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.limited_free_reschedules)} onChange={setCheckboxField('limited_free_reschedules')} />
                  <span>Enable limited number of free reschedules</span>
                </label>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'language':
        return (
          <>
            {renderSettingsPageHeader(
              'Language settings',
              'Set the test\'s default interface language and add translations for specific fields in other languages.',
              SETTINGS_PAGE_ICONS.language,
            )}
            <div id="settings-language" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.language)}
                  <h4>Language preference</h4>
                </div>
                <p className={styles.sectionDescription}>The default language for the test-taking screen interface when this specific test is accessed.</p>
                <label className={styles.settingsFieldGroup}>
                  <span>Language preference</span>
                  <select disabled={lockedExamFields} value={settingsForm.language} onChange={setTextField('language')}>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.categories)}
                  <h4>Translation settings</h4>
                </div>
                <p className={styles.sectionDescription}>
                  Add translations for specific fields of the test in any supported language. If the language preference is selected or the candidate has the language set on their profile, the fields with translations will be displayed in the selected language.
                </p>
                <div className={styles.tableCard}>
                  <div className={styles.tableToolbar}>
                    <div className={styles.settingsSubtableTitle}>Translations</div>
                    <div className={styles.tableActions}>
                      <button type="button" className={styles.blueBtn} disabled={lockedExamFields} onClick={startCreateTranslation}>
                        Add translation
                      </button>
                    </div>
                  </div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Language</th>
                        <th style={{ width: '180px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {translationRows.length === 0 ? (
                        <tr>
                          <td colSpan={2} className={styles.tableEmptyCell}>No translations added.</td>
                        </tr>
                      ) : translationRows.map((translation) => (
                        <tr key={translation.id}>
                          <td>
                            <div className={styles.inlineDetailTitle}>{languageLabelOf(translation.language)}</div>
                            <div className={styles.inlineDetailCopy}>
                              {translation.title || translation.description || translation.instructions_body || translation.completion_message || 'Translation drafted'}
                            </div>
                          </td>
                          <td>
                            <div className={styles.inlineActions}>
                              <button type="button" className={styles.blueBtn} disabled={lockedExamFields} onClick={() => startEditTranslation(translation)}>
                                Edit
                              </button>
                              <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={() => removeTranslationEntry(translation.id)}>
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {showTranslationEditor ? (
                  <div className={styles.editorCard}>
                    <div className={styles.editorHeader}>
                      <h5>{editingTranslationId ? 'Edit translation' : 'Add translation'}</h5>
                      <p>Draft translated values for this test. They will be saved with the rest of the test settings.</p>
                    </div>
                    {translationError ? <div className={styles.error}>{translationError}</div> : null}
                    <div className={styles.inlineFormGrid}>
                      <label className={styles.settingsFieldGroup}>
                        <span>Language</span>
                        <select value={translationDraft.language} onChange={(event) => setTranslationDraft((prev) => ({ ...prev, language: event.target.value }))}>
                          {LANGUAGE_OPTIONS.filter((option) => option.value).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Translated title</span>
                        <input value={translationDraft.title} onChange={(event) => setTranslationDraft((prev) => ({ ...prev, title: event.target.value }))} />
                      </label>
                      <label className={`${styles.settingsFieldGroup} ${styles.editorWideField}`}>
                        <span>Translated description</span>
                        <textarea rows={4} value={translationDraft.description} onChange={(event) => setTranslationDraft((prev) => ({ ...prev, description: event.target.value }))} />
                      </label>
                      <label className={`${styles.settingsFieldGroup} ${styles.editorWideField}`}>
                        <span>Translated instructions</span>
                        <textarea rows={4} value={translationDraft.instructions_body} onChange={(event) => setTranslationDraft((prev) => ({ ...prev, instructions_body: event.target.value }))} />
                      </label>
                      <label className={`${styles.settingsFieldGroup} ${styles.editorWideField}`}>
                        <span>Translated completion message</span>
                        <textarea rows={3} value={translationDraft.completion_message} onChange={(event) => setTranslationDraft((prev) => ({ ...prev, completion_message: event.target.value }))} />
                      </label>
                    </div>
                    <div className={styles.inlineActions}>
                      <button type="button" className={styles.blueBtn} onClick={saveTranslationDraft}>
                        Save translation
                      </button>
                      <button type="button" className={styles.ghostBtn} onClick={cancelTranslationEditor}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'result-validity':
        return (
          <>
            {renderSettingsPageHeader(
              'Result validity settings',
              'Set how many days test results remain valid after completion. When results expire, they become invalid, which can be useful for managing recertification periods.',
              SETTINGS_PAGE_ICONS.validity,
            )}
            <div id="settings-result-validity" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <label className={styles.settingsInlineCheck}>
                  <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.result_validity_period_enabled)} onChange={setCheckboxField('result_validity_period_enabled')} />
                  <span>Set result validity period</span>
                </label>
                {settingsForm.result_validity_period_enabled ? (
                  <label className={styles.settingsFieldGroup}>
                    <span>Validity period in days</span>
                    <input type="number" min="1" disabled={lockedExamFields} value={settingsForm.result_validity_days} onChange={setTextField('result_validity_days')} />
                  </label>
                ) : null}
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'grading':
        return (() => {
          const sectionCount = Math.max(0, Number(settingsForm.section_count || 0))
          return (
            <>
              {renderSettingsPageHeader(
                'Grading configuration',
                'Define the passing criteria for your test. If needed, configure advanced grading options, such as setting passing scores for individual sections or groups of sections. You can also select a previously created grading scale to display test results as letter grades.',
                SETTINGS_PAGE_ICONS.grading,
              )}
              <div id="settings-grading" className={styles.settingsPageStack}>
                <div className={styles.sectionCard}>
                  <div className={styles.settingsCardHeader}>
                    {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.validity)}
                    <h4>To pass the test, a candidate has to:</h4>
                  </div>
                  <div className={styles.gradingRuleList}>
                    <p>- Achieve more or equal to {settingsForm.passing_score || '0.00'}% on the entire test.</p>
                    <p>- Pass the required test sections</p>
                    {sectionCount > 0 ? (
                      <ol>
                        {Array.from({ length: sectionCount }).map((_, index) => (
                          <li key={`grading-section-${index}`}>
                            Achieve more or equal to {settingsForm.passing_score || '0.00'}% on test section {index + 1}.
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.settingsCardHeader}>
                    {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.grading)}
                    <h4>Define passing mark for the test</h4>
                  </div>
                  <p className={styles.sectionDescription}>Define the percentage required to pass the test.</p>
                  <div className={styles.settingsCompactFieldRow}>
                    <label className={styles.settingsFieldGroup}>
                      <span>Passing mark</span>
                      <input type="number" min="0" max="100" disabled={lockedExamFields} value={settingsForm.passing_score} onChange={setTextField('passing_score')} />
                    </label>
                  </div>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.passing_mark_inclusive)} onChange={setCheckboxField('passing_mark_inclusive')} />
                    <span>Make the passing mark inclusive</span>
                  </label>
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.settingsCardHeader}>
                    {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.security)}
                    <h4>Proctoring report</h4>
                  </div>
                  <p className={styles.sectionDescription}>
                    Enable the option to require candidates to obtain a positive proctoring grade in order to pass the test. Otherwise, the proctoring report will not affect the final score on the test.
                  </p>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.require_positive_proctoring_report)} onChange={setCheckboxField('require_positive_proctoring_report')} />
                    <span>Require positive proctoring report</span>
                  </label>
                </div>

                <div className={styles.sectionCard}>
                  <label className={styles.settingsSwitchRow}>
                    <span>Show advanced settings</span>
                    <span className={styles.settingsSwitch}>
                      <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.show_advanced_grading)} onChange={setCheckboxField('show_advanced_grading')} />
                      <span />
                    </span>
                  </label>
                </div>
              </div>
              {renderSettingsFooter()}
            </>
          )
        })()
      case 'personal-report':
        return (
          <>
            {renderSettingsPageHeader(
              'Personal report settings',
              'Customize what candidates see in their reports. Changes affect only candidates; test managers will still see the full report.',
              SETTINGS_PAGE_ICONS.personalReport,
            )}
            <div id="settings-personal-report" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.duration)}
                  <h4>Timing and access</h4>
                </div>
                <label className={styles.settingsFieldGroup}>
                  <span>Show report</span>
                  <select value={settingsForm.report_displayed} disabled={reportSettingsLocked} onChange={setTextField('report_displayed')}>
                    {REPORT_DISPLAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className={styles.settingsCheckboxList}>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.report_lifespan_enabled)} onChange={setCheckboxField('report_lifespan_enabled')} />
                    <span>Configure report lifespan</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.report_access_duration_enabled)} onChange={setCheckboxField('report_access_duration_enabled')} />
                    <span>Configure report access duration</span>
                  </label>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.scoreReport)}
                  <h4>Report content</h4>
                </div>
                <label className={styles.settingsFieldGroup}>
                  <span>Report content *</span>
                  <select value={settingsForm.report_content} disabled={reportSettingsLocked} onChange={setTextField('report_content')}>
                    {REPORT_CONTENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className={styles.settingsTwoColumnChecks}>
                  <div className={styles.settingsCheckboxList}>
                    {PERSONAL_REPORT_LEFT_FLAGS.map(([field, label]) => (
                      <label key={field} className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm[field])} onChange={setCheckboxField(field)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className={styles.settingsCheckboxList}>
                    {PERSONAL_REPORT_RIGHT_FLAGS.map(([field, label]) => (
                      <label key={field} className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm[field])} onChange={setCheckboxField(field)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.review)}
                  <h4>Review options</h4>
                </div>
                <div className={styles.settingsCheckboxList}>
                  <label className={styles.settingsInlineCheck}>
                    <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm.show_answer_review)} onChange={setCheckboxField('show_answer_review')} />
                    <span>Allow answer review after submission</span>
                  </label>
                  <label className={styles.settingsInlineCheck}>
                    <input
                      type="checkbox"
                      disabled={reportSettingsLocked || !settingsForm.show_answer_review}
                      checked={Boolean(settingsForm.show_correct_answers)}
                      onChange={setCheckboxField('show_correct_answers')}
                    />
                    <span>Show correct answers in review</span>
                  </label>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.settingsCardHeader}>
                  {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.attachments)}
                  <h4>Export options</h4>
                </div>
                <div className={styles.settingsCheckboxList}>
                  {PERSONAL_REPORT_EXPORT_FLAGS.map(([field, label]) => (
                    <label key={field} className={styles.settingsInlineCheck}>
                      <input type="checkbox" disabled={reportSettingsLocked} checked={Boolean(settingsForm[field])} onChange={setCheckboxField(field)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'score-report':
        return (
          <>
            {renderSettingsPageHeader(
              'Score report settings',
              'The score report is an advanced version of the personal report designed for export. Customize the content of the score report for the test. These settings will override the global configuration for score reports.',
              SETTINGS_PAGE_ICONS.scoreReport,
            )}
            <div id="settings-score-report" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <p className={styles.sectionDescription}>
                  To view the global configuration, navigate to System &gt; Settings and customization &gt; Score report setup under the System Preferences section.
                </p>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.blueBtn}
                    disabled={lockedExamFields}
                    onClick={() => {
                      setSettingsForm((prev) => ({ ...prev, custom_score_report_enabled: true }))
                      withNotice('Custom score report settings enabled for this test.')
                    }}
                  >
                    Create custom settings
                  </button>
                  {settingsForm.custom_score_report_enabled ? (
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      disabled={lockedExamFields}
                      onClick={() => {
                        setSettingsForm((prev) => ({
                          ...prev,
                          custom_score_report_enabled: false,
                          score_report_heading: DEFAULT_SCORE_REPORT_SETTINGS.heading,
                          score_report_intro: DEFAULT_SCORE_REPORT_SETTINGS.intro,
                          score_report_include_candidate_summary: DEFAULT_SCORE_REPORT_SETTINGS.include_candidate_summary,
                          score_report_include_section_breakdown: DEFAULT_SCORE_REPORT_SETTINGS.include_section_breakdown,
                          score_report_include_proctoring_summary: DEFAULT_SCORE_REPORT_SETTINGS.include_proctoring_summary,
                          score_report_include_certificate_status: DEFAULT_SCORE_REPORT_SETTINGS.include_certificate_status,
                          score_report_include_pass_fail_badge: DEFAULT_SCORE_REPORT_SETTINGS.include_pass_fail_badge,
                        }))
                        withNotice('Custom score report settings reset for this draft.')
                      }}
                    >
                      Reset custom settings
                    </button>
                  ) : null}
                </div>
                {settingsForm.custom_score_report_enabled ? (
                  <div className={styles.editorCard}>
                    <div className={styles.editorHeader}>
                      <h5>Custom score report layout</h5>
                      <p>These settings are stored on the test draft and used when the score report is exported.</p>
                    </div>
                    <div className={styles.inlineFormGrid}>
                      <label className={styles.settingsFieldGroup}>
                        <span>Report heading</span>
                        <input value={settingsForm.score_report_heading} disabled={lockedExamFields} onChange={setTextField('score_report_heading')} />
                      </label>
                      <label className={`${styles.settingsFieldGroup} ${styles.editorWideField}`}>
                        <span>Report introduction</span>
                        <textarea rows={4} value={settingsForm.score_report_intro} disabled={lockedExamFields} onChange={setTextField('score_report_intro')} />
                      </label>
                    </div>
                    <div className={styles.settingsCheckboxList}>
                      <label className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.score_report_include_candidate_summary)} onChange={setCheckboxField('score_report_include_candidate_summary')} />
                        <span>Include candidate summary block</span>
                      </label>
                      <label className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.score_report_include_section_breakdown)} onChange={setCheckboxField('score_report_include_section_breakdown')} />
                        <span>Include section breakdown</span>
                      </label>
                      <label className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.score_report_include_proctoring_summary)} onChange={setCheckboxField('score_report_include_proctoring_summary')} />
                        <span>Include proctoring summary</span>
                      </label>
                      <label className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.score_report_include_certificate_status)} onChange={setCheckboxField('score_report_include_certificate_status')} />
                        <span>Include certificate status</span>
                      </label>
                      <label className={styles.settingsInlineCheck}>
                        <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.score_report_include_pass_fail_badge)} onChange={setCheckboxField('score_report_include_pass_fail_badge')} />
                        <span>Include pass / fail badge</span>
                      </label>
                    </div>
                    <div className={styles.previewList}>
                      <div className={styles.previewListTitle}>{settingsForm.score_report_heading || DEFAULT_SCORE_REPORT_SETTINGS.heading}</div>
                      <ul>
                        {settingsForm.score_report_intro ? <li>{settingsForm.score_report_intro}</li> : null}
                        {settingsForm.score_report_include_candidate_summary ? <li>Candidate summary</li> : null}
                        {settingsForm.score_report_include_section_breakdown ? <li>Section breakdown</li> : null}
                        {settingsForm.score_report_include_proctoring_summary ? <li>Proctoring summary</li> : null}
                        {settingsForm.score_report_include_certificate_status ? <li>Certificate status</li> : null}
                        {settingsForm.score_report_include_pass_fail_badge ? <li>Pass / fail badge</li> : null}
                      </ul>
                    </div>
                  </div>
                ) : null}
                {!settingsForm.custom_score_report_enabled ? (
                  <div className={styles.settingsStatusNote}>No custom score report overrides are currently enabled for this test.</div>
                ) : null}
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'certificate':
        return (
          <>
            {renderSettingsPageHeader(
              'Certificates',
              'Include certificates in the test that will be awarded to candidates upon passing or meeting specifically defined completion conditions.',
              SETTINGS_PAGE_ICONS.certificate,
              <>
                <button type="button" className={styles.blueBtn} disabled={lockedExamFields} onClick={() => setShowCertificateEditor(true)}>Add certificate</button>
                <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={() => void toggleCertificateSync()}>Synchronize certificates</button>
                <button type="button" className={`${styles.iconGhostBtn} ${certificateView === 'detail' ? styles.iconGhostBtnActive : ''}`} aria-label="Certificate board view" onClick={() => setCertificateView('detail')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v14H4zM9 5v14M15 5v14M4 12h16" /></svg>
                </button>
                <button type="button" className={`${styles.iconGhostBtn} ${certificateView === 'compact' ? styles.iconGhostBtnActive : ''}`} aria-label="Certificate grid view" onClick={() => setCertificateView('compact')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>
                </button>
              </>,
            )}
            <div id="settings-certificate" className={styles.settingsPageStack}>
              {showCertificateSync ? (
                <div className={styles.editorCard}>
                  <div className={styles.editorHeader}>
                    <h5>Synchronize certificate</h5>
                    <p>Copy certificate settings from another test in the system.</p>
                  </div>
                  {certificateSyncError ? <div className={styles.error}>{certificateSyncError}</div> : null}
                  <label className={styles.settingsFieldGroup}>
                    <span>Source test</span>
                    <select value={certificateSyncSourceId} disabled={certificateSyncLoading || lockedExamFields} onChange={(event) => setCertificateSyncSourceId(event.target.value)}>
                      <option value="">{certificateSyncLoading ? 'Loading certificate sources...' : 'Select a test'}</option>
                      {certificateSyncOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.inlineActions}>
                    <button type="button" className={styles.blueBtn} disabled={lockedExamFields || !certificateSyncSourceId || certificateSyncLoading} onClick={applySyncedCertificate}>
                      Apply synced certificate
                    </button>
                    <button type="button" className={styles.ghostBtn} onClick={() => setShowCertificateSync(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {(showCertificateEditor || certificatePreview) ? (
                <div className={styles.settingsSplitLayout}>
                  <div className={styles.sectionCard}>
                    <div className={styles.settingsCardHeader}>
                      {renderSettingsPageIcon(SETTINGS_PAGE_ICONS.certificate)}
                      <h4>Certificate content</h4>
                    </div>
                    <div className={styles.inlineFormGrid}>
                      <label className={styles.settingsFieldGroup}>
                        <span>Issue rule</span>
                        <select value={settingsForm.certificate_issue_rule} disabled={lockedExamFields} onChange={setCertificateField('certificate_issue_rule')}>
                          {CERTIFICATE_ISSUE_RULE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Certificate title</span>
                        <input value={settingsForm.certificate_title} disabled={lockedExamFields} onChange={setCertificateField('certificate_title')} placeholder="Certificate of Completion" />
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Subtitle</span>
                        <input value={settingsForm.certificate_subtitle} disabled={lockedExamFields} onChange={setCertificateField('certificate_subtitle')} placeholder="Awarded for successful completion" />
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Issuer</span>
                        <input value={settingsForm.certificate_issuer} disabled={lockedExamFields} onChange={setCertificateField('certificate_issuer')} placeholder="SYRA Learning Institute" />
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Signer</span>
                        <input value={settingsForm.certificate_signer} disabled={lockedExamFields} onChange={setCertificateField('certificate_signer')} placeholder="Dr. Jane Doe" />
                      </label>
                    </div>
                    <div className={styles.inlineActions}>
                      <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={clearCertificateDraft}>
                        Remove certificate
                      </button>
                    </div>
                  </div>
                  <div className={`${styles.certificatePreviewCard} ${certificateView === 'compact' ? styles.certificatePreviewCompact : ''}`}>
                    <div className={styles.certificatePreviewInner}>
                      <div className={styles.certificateBadge}>{certificateIssueRuleLabel(certificatePreview?.issue_rule)}</div>
                      <div className={styles.certificateHeading}>{certificatePreview?.title || 'Certificate of Completion'}</div>
                      <div className={styles.certificateSubtitle}>
                        {certificatePreview?.subtitle || `Awarded for successfully completing ${settingsForm.title || exam.title}.`}
                      </div>
                      <div className={styles.certificateMetaRow}>
                        <div>
                          <span>Test</span>
                          <strong>{settingsForm.title || exam.title}</strong>
                        </div>
                        <div>
                          <span>Issuer</span>
                          <strong>{certificatePreview?.issuer || 'Not set yet'}</strong>
                        </div>
                      </div>
                      <div className={styles.certificateSignerRow}>
                        <span>Signed by</span>
                        <strong>{certificatePreview?.signer || 'Awaiting signer'}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.settingsEmptyState}>
                  This test does not have any certificates added.
                </div>
              )}
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'coupons':
        return (
          <>
            {renderSettingsPageHeader(
              'Coupons',
              'Create coupons to give users a discounted access to testing sessions. Each coupon is valid for all sessions in the test, can be used only once, and applies only to sessions with a set purchase price.',
              SETTINGS_PAGE_ICONS.coupons,
            )}
            <div id="settings-coupons" className={styles.settingsPageStack}>
              <div className={styles.tableCard}>
                <div className={styles.tableToolbar}>
                  <div className={styles.settingsSubtableTitle}>List of coupons</div>
                  <div className={styles.tableActions}>
                    <button
                      type="button"
                      className={styles.blueBtn}
                      disabled={lockedExamFields}
                      onClick={() => {
                        setShowCouponGenerator((prev) => !prev)
                        setCouponError('')
                      }}
                    >
                      Generate coupons
                    </button>
                  </div>
                </div>
                {showCouponGenerator ? (
                  <div className={styles.editorCard}>
                    <div className={styles.editorHeader}>
                      <h5>Coupon generator</h5>
                      <p>Create one or more draft coupons for this test and save the page to persist them.</p>
                    </div>
                    {couponError ? <div className={styles.error}>{couponError}</div> : null}
                    <div className={styles.inlineFormGrid}>
                      <label className={styles.settingsFieldGroup}>
                        <span>Code prefix</span>
                        <input value={couponGenerator.prefix} onChange={(event) => setCouponGenerator((prev) => ({ ...prev, prefix: event.target.value }))} />
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Count</span>
                        <input type="number" min="1" max="100" value={couponGenerator.count} onChange={(event) => setCouponGenerator((prev) => ({ ...prev, count: event.target.value }))} />
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Discount type</span>
                        <select value={couponGenerator.discount_type} onChange={(event) => setCouponGenerator((prev) => ({ ...prev, discount_type: event.target.value }))}>
                          <option value="percentage">Percentage</option>
                          <option value="fixed">Fixed amount</option>
                        </select>
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Amount</span>
                        <input type="number" min="1" value={couponGenerator.amount} onChange={(event) => setCouponGenerator((prev) => ({ ...prev, amount: event.target.value }))} />
                      </label>
                      <label className={styles.settingsFieldGroup}>
                        <span>Expiration time</span>
                        <input type="datetime-local" value={couponGenerator.expiration_time} onChange={(event) => setCouponGenerator((prev) => ({ ...prev, expiration_time: event.target.value }))} />
                      </label>
                    </div>
                    <div className={styles.inlineActions}>
                      <button type="button" className={styles.blueBtn} onClick={handleGenerateCoupons}>
                        Create coupon rows
                      </button>
                      <button type="button" className={styles.ghostBtn} onClick={() => setShowCouponGenerator(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Coupon code</th>
                      <th>Discount type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Expiration time</th>
                      <th>Used by</th>
                      <th>Date of use</th>
                      <th>Created by</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={styles.tableFilterRow}>
                      <td><input aria-label="Coupon code filter" placeholder="Search" value={couponFilters.code} onChange={setCouponFilterField('code')} /></td>
                      <td>
                        <select aria-label="Discount type filter" value={couponFilters.discount_type} onChange={setCouponFilterField('discount_type')}>
                          <option value="">All</option>
                          <option value="percentage">Percentage</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </td>
                      <td><input aria-label="Amount filter" placeholder="Search" value={couponFilters.amount} onChange={setCouponFilterField('amount')} /></td>
                      <td>
                        <select aria-label="Status filter" value={couponFilters.status} onChange={setCouponFilterField('status')}>
                          <option value="">All</option>
                          {couponStatusOptions.map((status) => (
                            <option key={status} value={String(status).toLowerCase()}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td><input aria-label="Expiration time filter" placeholder="Search" value={couponFilters.expiration_time} onChange={setCouponFilterField('expiration_time')} /></td>
                      <td><input aria-label="Used by filter" placeholder="Search" value={couponFilters.used_by} onChange={setCouponFilterField('used_by')} /></td>
                      <td><input aria-label="Date of use filter" placeholder="Search" value={couponFilters.date_of_use} onChange={setCouponFilterField('date_of_use')} /></td>
                      <td><input aria-label="Created by filter" placeholder="Search" value={couponFilters.created_by} onChange={setCouponFilterField('created_by')} /></td>
                      <td />
                    </tr>
                    {couponRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={styles.tableEmptyCell}>No coupons created.</td>
                      </tr>
                    ) : filteredCouponRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={styles.tableEmptyCell}>No coupons match the current filters.</td>
                      </tr>
                    ) : (
                      filteredCouponRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.code}</td>
                          <td>{row.discount_type === 'percentage' ? 'Percentage' : 'Fixed'}</td>
                          <td>{row.discount_type === 'percentage' ? `${row.amount}%` : row.amount}</td>
                          <td>{row.status || 'Draft'}</td>
                          <td>{row.expiration_time || '-'}</td>
                          <td>{row.used_by || '-'}</td>
                          <td>{row.date_of_use || '-'}</td>
                          <td>{row.created_by || 'Admin'}</td>
                          <td className={styles.actionsCell}>
                            <button type="button" disabled={lockedExamFields} onClick={() => removeCouponEntry(row.id)}>Delete</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className={styles.settingsTableFooter}>
                  <span>{couponHasActiveFilters ? `Rows: ${filteredCouponRows.length} / ${couponRows.length}` : `Rows: ${couponRows.length}`}</span>
                </div>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'attachments':
        return (
          <>
            {renderSettingsPageHeader(
              'Attachments',
              'Import existing attachments from the library or create new ones.',
              SETTINGS_PAGE_ICONS.attachments,
            )}
            <div id="settings-attachments" className={styles.settingsPageStack}>
              <div className={styles.inlineActions}>
                <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={startCreateAttachment}>Create new</button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={lockedExamFields}
                  onClick={() => {
                    setShowAttachmentImporter((prev) => !prev)
                    setAttachmentImportError('')
                  }}
                >
                  Import from library
                </button>
              </div>
              {showAttachmentEditor ? (
                <div className={styles.editorCard}>
                  <div className={styles.editorHeader}>
                    <h5>{editingAttachmentId ? 'Edit attachment' : 'Create attachment'}</h5>
                    <p>Add a saved attachment row to this test draft.</p>
                  </div>
                  {attachmentError ? <div className={styles.error}>{attachmentError}</div> : null}
                  <div className={styles.inlineFormGrid}>
                    <label className={styles.settingsFieldGroup}>
                      <span>Title</span>
                      <input value={attachmentDraft.title} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, title: event.target.value }))} />
                    </label>
                    <label className={styles.settingsFieldGroup}>
                      <span>Attachment URL</span>
                      <input value={attachmentDraft.url} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, url: event.target.value }))} />
                    </label>
                    <label className={styles.settingsFieldGroup}>
                      <span>Attachment type</span>
                      <select value={attachmentDraft.type} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, type: event.target.value }))}>
                        {ATTACHMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={styles.inlineActions}>
                    <button type="button" className={styles.blueBtn} onClick={saveAttachmentDraft}>
                      Save attachment
                    </button>
                    <button type="button" className={styles.ghostBtn} onClick={cancelAttachmentEditor}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {showAttachmentImporter ? (
                <div className={styles.editorCard}>
                  <div className={styles.editorHeader}>
                    <h5>Import attachment rows</h5>
                    <p>Paste one URL per line, or use the format: <code>Title | URL</code>.</p>
                  </div>
                  {attachmentImportError ? <div className={styles.error}>{attachmentImportError}</div> : null}
                  <label className={`${styles.settingsFieldGroup} ${styles.editorWideField}`}>
                    <span>Attachment rows</span>
                    <textarea rows={5} value={attachmentImportText} onChange={(event) => setAttachmentImportText(event.target.value)} />
                  </label>
                  <div className={styles.inlineActions}>
                    <button type="button" className={styles.blueBtn} onClick={importAttachmentRows}>
                      Import rows
                    </button>
                    <button type="button" className={styles.ghostBtn} onClick={() => setShowAttachmentImporter(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {attachmentRows.length === 0 ? (
                <div className={styles.settingsEmptyState}>No attachments linked to this test yet.</div>
              ) : (
                <div className={styles.tableCard}>
                  <div className={styles.tableToolbar}>
                    <div className={styles.settingsSubtableTitle}>Linked attachments</div>
                    <div className={styles.tableMeta}>{attachmentRows.length} attachment{attachmentRows.length === 1 ? '' : 's'}</div>
                  </div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>URL</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachmentRows.map((attachment) => (
                        <tr key={attachment.id}>
                          <td>{attachment.title}</td>
                          <td>{ATTACHMENT_TYPE_OPTIONS.find((option) => option.value === attachment.type)?.label || attachment.type}</td>
                          <td className={styles.urlCell}><a href={attachment.url} target="_blank" rel="noreferrer">{attachment.url}</a></td>
                          <td className={styles.actionsCell}>
                            <button type="button" disabled={lockedExamFields} onClick={() => startEditAttachment(attachment)}>Edit</button>
                            <button type="button" disabled={lockedExamFields} onClick={() => removeAttachmentItem(attachment.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'externalattrs':
        return (
          <>
            {renderSettingsPageHeader(
              'External attributes',
              'Fill in these fields if this test is referenced in another software (external system). External ID represents the external system\'s unique identifier for this test.',
              SETTINGS_PAGE_ICONS.external,
            )}
            <div id="settings-externalattrs" className={styles.settingsPageStack}>
              <div className={styles.sectionCard}>
                <label className={styles.settingsFieldGroup}>
                  <span>External ID</span>
                  <input disabled={lockedExamFields} value={settingsForm.external_id} onChange={setTextField('external_id')} />
                </label>
              </div>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'categories':
        return (
          <>
            {renderSettingsPageHeader(
              'Test categories',
              'Test categories are used to simplify searches and group tests with shared characteristics such as subjects, difficulty levels, or other criteria.',
              SETTINGS_PAGE_ICONS.categories,
            )}
            <div id="settings-categories" className={styles.settingsPageStack}>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={lockedExamFields}
                  onClick={() => {
                    setShowCategoryPicker(true)
                    setCategoryError('')
                  }}
                >
                  Add category
                </button>
                {selectedCategory ? (
                  <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={() => setSettingsForm((prev) => ({ ...prev, category_id: '' }))}>
                    Remove category
                  </button>
                ) : null}
              </div>
              {(showCategoryPicker || selectedCategory) ? (
                <div className={styles.sectionCard}>
                  <label className={styles.settingsFieldGroup}>
                    <span>Assigned category</span>
                    <select disabled={lockedExamFields} value={settingsForm.category_id} onChange={setTextField('category_id')}>
                      <option value="">Uncategorized</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </label>
                  {selectedCategory ? <div className={styles.inlineDetailCopy}>Current category: {selectedCategory.name}</div> : null}
                </div>
              ) : null}
              <div className={styles.editorCard}>
                <div className={styles.editorHeader}>
                  <h5>Create a new category</h5>
                  <p>Create and immediately assign a new test category without leaving this page.</p>
                </div>
                {categoryError ? <div className={styles.error}>{categoryError}</div> : null}
                <div className={styles.inlineFormGrid}>
                  <label className={styles.settingsFieldGroup}>
                    <span>Category name</span>
                    <input value={categoryDraft.name} disabled={lockedExamFields || categoryBusy} onChange={(event) => setCategoryDraft((prev) => ({ ...prev, name: event.target.value }))} />
                  </label>
                  <label className={`${styles.settingsFieldGroup} ${styles.editorWideField}`}>
                    <span>Description</span>
                    <textarea rows={3} value={categoryDraft.description} disabled={lockedExamFields || categoryBusy} onChange={(event) => setCategoryDraft((prev) => ({ ...prev, description: event.target.value }))} />
                  </label>
                </div>
                <div className={styles.inlineActions}>
                  <button type="button" className={styles.blueBtn} disabled={lockedExamFields || categoryBusy} onClick={() => void handleCreateCategory()}>
                    {categoryBusy ? 'Creating...' : 'Create category'}
                  </button>
                </div>
              </div>
              <p className={styles.sectionDescription}>
                Tests that don&apos;t belong to any category will be added to &quot;Uncategorized&quot; category once test settings changes are saved.
              </p>
            </div>
            {renderSettingsFooter()}
          </>
        )
      case 'basic':
      default:
        return (
          <div id="settings-basic" className={`${styles.sectionCard} ${styles.basicInfoCard}`}>
            <div className={styles.basicInfoHero}>
              <div className={styles.basicInfoHeroCopy}>
                <div className={styles.basicInfoHeading}>
                  <span className={styles.basicInfoIcon} aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 10v6" />
                      <path d="M12 7h.01" />
                    </svg>
                  </span>
                  <div>
                    <h3>Basic information</h3>
                    <p>This section contains essential test information and primary actions.</p>
                  </div>
                </div>
              </div>
              <div className={styles.basicInfoActions}>
                <button type="button" className={styles.greenBtn} onClick={handlePreview}>Preview</button>
                {!isPublished && !isArchived ? <button type="button" className={styles.blueBtn} onClick={handlePublish}>Publish test</button> : null}
                <button type="button" className={styles.ghostBtn} disabled={lockedExamFields} onClick={() => navigate(`/admin/tests/${exam.id}/edit`)}>
                  Options
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={styles.basicInfoLayout}>
              <div className={styles.basicInfoMain}>
                <div className={styles.basicInfoTopRow}>
                  <label className={styles.basicInfoWideField}>Test name *<input value={settingsForm.title} disabled={isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, title: e.target.value }))} /></label>
                  <label>Test status<input value={basicPageStatus} readOnly /></label>
                  <label>Test ID<input value={settingsForm.code || String(exam.id).slice(0, 6)} readOnly /></label>
                </div>

                <label>Test description<textarea className={styles.basicDescriptionField} value={settingsForm.description} disabled={isArchived} onChange={(e) => setSettingsForm((p) => ({ ...p, description: e.target.value }))} rows={8} /></label>

                <label>Descriptive label<input value={settingsForm.descriptive_label} disabled={lockedExamFields} onChange={(e) => setSettingsForm((p) => ({ ...p, descriptive_label: e.target.value }))} placeholder="Optional short label shown in listings" /></label>

                <div className={styles.row}>
                  <label>Creation type
                    <select value={settingsForm.creation_type} disabled={lockedExamFields} onChange={(e) => setSettingsForm((p) => ({ ...p, creation_type: e.target.value }))}>
                      <option value="Test with sections">Test with sections</option>
                      <option value="Single flow test">Single flow test</option>
                      <option value="Adaptive test">Adaptive test</option>
                    </select>
                  </label>
                  <label>Test sections<input type="number" min="0" max="99" value={settingsForm.section_count} disabled={lockedExamFields} onChange={(e) => setSettingsForm((p) => ({ ...p, section_count: e.target.value }))} /></label>
                </div>

                <div className={styles.basicToggleRow}>
                  <label className={styles.toggleItem}>
                    <input type="checkbox" disabled={lockedExamFields} checked={Boolean(settingsForm.allow_section_selection)} onChange={(e) => setSettingsForm((p) => ({ ...p, allow_section_selection: e.target.checked }))} />
                    <span>Enable section selection</span>
                  </label>
                </div>

                <div className={styles.row}>
                  <label>Created by<input value={createdByLabel} readOnly /></label>
                  <label>Creation time<input value={formatMetadataDate(exam.created_at)} readOnly /></label>
                </div>
                <div className={styles.row}>
                  <label>Updated by<input value={updatedByLabel} readOnly /></label>
                  <label>Update time<input value={formatMetadataDate(exam.updated_at)} readOnly /></label>
                </div>
              </div>

              <aside className={styles.basicInfoBrandPanel}>
                <div className={styles.basicInfoBrandBadge} aria-hidden="true">
                  <span>{basicPageInitials}</span>
                </div>
                <button
                  type="button"
                  className={styles.basicInfoBrandEdit}
                  disabled={lockedExamFields}
                  aria-label="Edit test branding"
                  onClick={() => navigate(`/admin/tests/${exam.id}/edit`)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <div className={styles.basicInfoBrandMeta}>
                  <div className={styles.basicInfoBrandTitle}>{settingsForm.title || exam.title}</div>
                  <div className={styles.basicInfoBrandCopy}>
                    {settingsForm.creation_type || 'Test with sections'} with {settingsForm.section_count || 0} configured section{String(settingsForm.section_count || '0') === '1' ? '' : 's'}.
                  </div>
                </div>
              </aside>
            </div>
            {renderSettingsFooter()}
          </div>
        )
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/admin/tests')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          All Tests
        </button>
        <span className={styles.breadcrumbSep}>›</span>
        <span className={styles.breadcrumbCurrent}>{exam.title}</span>
        <span className={`${styles.statusBadge} ${isPublished ? styles.statusPublished : isArchived ? styles.statusArchived : styles.statusDraft}`}>
          {isPublished ? 'Published' : isArchived ? 'Archived' : 'Draft'}
        </span>
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

      {tab !== 'settings' && (
        <>
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
            {[
              { label: 'Preview flow',    iconKey: 'preview',  onClick: handlePreview,                             primary: true },
              { label: 'Sessions',        iconKey: 'sessions', onClick: () => openCycleTab('sessions') },
              { label: 'Proctoring',      iconKey: 'shield',   onClick: () => openCycleTab('proctoring') },
              { label: 'Reports',         iconKey: 'reports',  onClick: () => openCycleTab('reports') },
              { label: 'Learner review',  iconKey: 'review',   onClick: () => openCycleTab('settings', 'reports') },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                className={`${styles.quickAction} ${action.primary ? styles.quickActionPrimary : ''}`}
                onClick={action.onClick}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={QA_ICONS[action.iconKey]} />
                </svg>
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? styles.tabActive : ''}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'settings' && (
          <SettingsTab
            settingsMenuItems={SETTINGS_MENU_ITEMS}
            menuToSection={MENU_TO_SECTION}
            settingsSection={settingsSection}
            handleSettingsMenuClick={handleSettingsMenuClick}
            renderSettingsPanel={renderSettingsPanel}
          />
        )}

        {tab === 'sections' && (
          <QuestionsTab
            questions={questions}
            questionSearch={questionSearch}
            setQuestionSearch={setQuestionSearch}
            questionForm={questionForm}
            lockedExamFields={lockedExamFields}
            handleQuestionTypeChange={handleQuestionTypeChange}
            setQuestionForm={setQuestionForm}
            questionTypes={QUESTION_TYPES}
            questionBusy={questionBusy}
            editingQuestionId={editingQuestionId}
            resetQuestionForm={resetQuestionForm}
            handleQuestionSubmit={handleQuestionSubmit}
            filteredQuestions={filteredQuestions}
            questionTypeOf={questionTypeOf}
            deletingQuestionBusyId={deletingQuestionBusyId}
            deleteQuestionId={deleteQuestionId}
            setDeleteQuestionId={setDeleteQuestionId}
            startEditQuestion={startEditQuestion}
            handleDeleteQuestion={handleDeleteQuestion}
          />
        )}

        {false && tab === 'sections' && (
          <section className={styles.full}>
            <h3 className={styles.tabPanelHeader}>Test Sections — Questions <span className={styles.countPill}>{questions.length}</span></h3>
            <div className={styles.row}>
              <label>Search questions<input placeholder="Search text or type" value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} /></label>
              <label>Total questions<input readOnly value={String(questions.length)} /></label>
            </div>
            <form className={styles.sectionCard} onSubmit={handleQuestionSubmit}>
              <div className={styles.sectionHeader}>{editingQuestionId ? 'Edit question' : 'Add question'}</div>
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
          <SessionsTab
            sessions={sessions}
            sessionForm={sessionForm}
            setSessionForm={setSessionForm}
            learners={learners}
            isArchived={isArchived}
            sessionFormReady={sessionFormReady}
            sessionBusy={sessionBusy}
            handleCreateSession={handleCreateSession}
            users={users}
            deleteSessionId={deleteSessionId}
            deletingSessionBusyId={deletingSessionBusyId}
            setDeleteSessionId={setDeleteSessionId}
            handleDeleteSession={handleDeleteSession}
          />
        )}

        {false && tab === 'sessions' && (
          <section className={styles.full}>
            <h3 className={styles.tabPanelHeader}>Testing Sessions <span className={styles.countPill}>{sessions.length}</span></h3>
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
          <CandidatesTab
            candidateRows={candidateRows}
            formatAttemptStatus={formatAttemptStatus}
            formatScore={formatScore}
            gradeDrafts={gradeDrafts}
            setGradeDrafts={setGradeDrafts}
            rowBusy={rowBusy}
            handleSaveGrade={handleSaveGrade}
            handleOpenResult={handleOpenResult}
            navigate={navigate}
            handlePauseResume={handlePauseResume}
            handleOpenVideo={handleOpenVideo}
            handleOpenReport={handleOpenReport}
          />
        )}

        {false && tab === 'candidates' && (
          <section className={styles.full}>
            <h3 className={styles.tabPanelHeader}>Candidates <span className={styles.countPill}>{candidateRows.length}</span></h3>
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
          <ProctoringTab
            exam={exam}
            sessions={sessions}
            selectedSession={selectedSession}
            setSelectedSession={setSelectedSession}
            monitoringSummaryCards={monitoringSummaryCards}
            view={view}
            setView={setView}
            filteredRows={filteredRows}
            attemptRows={attemptRows}
            bulkBusy={bulkBusy}
            bulkAction={bulkAction}
            handleBulkPauseResume={handleBulkPauseResume}
            loadAll={loadAll}
            loading={loading}
            clearMonitoringFilters={clearMonitoringFilters}
            monitoringHasFilters={monitoringHasFilters}
            navigate={navigate}
            examId={id}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            search={search}
            setSearch={setSearch}
            rowBusy={rowBusy}
            handlePauseResume={handlePauseResume}
            handleOpenReport={handleOpenReport}
            handleOpenVideo={handleOpenVideo}
            users={users}
            editingAccomId={editingAccomId}
            editingAccomForm={editingAccomForm}
            setEditingAccomForm={setEditingAccomForm}
            savingAccomId={savingAccomId}
            handleSaveAccom={handleSaveAccom}
            setEditingAccomId={setEditingAccomId}
            isArchived={isArchived}
            startEditAccom={startEditAccom}
          />
        )}

        {false && tab === 'proctoring' && (
          <section className={styles.full}>
            <h3 className={styles.tabPanelHeader}>Proctoring</h3>
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
          <AdministrationTab
            exam={exam}
            attemptRows={attemptRows}
            isArchived={isArchived}
            deletingExamBusy={deletingExamBusy}
            handleSettingsSave={handleSettingsSave}
            isPublished={isPublished}
            handlePublish={handlePublish}
            handleClose={handleClose}
            lockedExamFields={lockedExamFields}
            navigate={navigate}
            deleteExamConfirm={deleteExamConfirm}
            setDeleteExamConfirm={setDeleteExamConfirm}
            handleDeleteExam={handleDeleteExam}
          />
        )}

        {false && tab === 'administration' && (
          <section className={styles.full}>
            <h3 className={styles.tabPanelHeader}>Test Administration</h3>
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
          <ReportsTab
            reportsBusy={reportsBusy}
            downloadExamCsv={downloadExamCsv}
            downloadExamPdf={downloadExamPdf}
            attemptRows={attemptRows}
            rowBusy={rowBusy}
            handleOpenReport={handleOpenReport}
            handleOpenVideo={handleOpenVideo}
          />
        )}

        {false && tab === 'reports' && (
          <section className={styles.full}>
            <h3 className={styles.tabPanelHeader}>Reports</h3>
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
