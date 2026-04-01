import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import useLanguage from '../../hooks/useLanguage'
import styles from './ViolationToast.module.scss'

const EVENT_TYPE_KEY_MAP = {
  'FACE_MISMATCH': 'admin_wizard_alert_face_mismatch',
  'CAMERA_COVERED': 'admin_wizard_alert_camera_covered',
  'FULLSCREEN_EXIT': 'admin_wizard_alert_fullscreen_exit',
  'TAB_SWITCH': 'admin_wizard_alert_tab_switch',
  'FOCUS_LOSS': 'admin_wizard_alert_focus_loss',
  'NO_FACE': 'admin_wizard_alert_no_face',
  'MULTIPLE_FACES': 'admin_wizard_alert_multiple_faces',
  'LOUD_AUDIO': 'admin_wizard_alert_loud_audio',
  'AUDIO_ANOMALY': 'admin_wizard_alert_audio_anomaly',
  'FORBIDDEN_OBJ': 'admin_wizard_alert_forbidden_obj',
  'EYE_MOVEMENT': 'admin_wizard_alert_eye_movement',
  'HEAD_POSE': 'admin_wizard_alert_head_pose',
  'MOUTH_MOVEMENT': 'admin_wizard_alert_mouth_movement',
  'SCREEN_SHARE_LOST': 'proctor_event_SCREEN_SHARE_LOST',
  'COPY_PASTE_ATTEMPT': 'proctor_event_COPY_PASTE_ATTEMPT',
  'SHORTCUT_BLOCKED': 'proctor_event_SHORTCUT_BLOCKED',
  'SCREENSHOT_ATTEMPT': 'proctor_event_SCREENSHOT_ATTEMPT',
  'RIGHT_CLICK_ATTEMPT': 'proctor_event_RIGHT_CLICK_ATTEMPT',
  'MULTIPLE_MONITORS': 'proctor_event_MULTIPLE_MONITORS',
  'VIRTUAL_MACHINE': 'proctor_event_VIRTUAL_MACHINE',
  'DEV_TOOLS_OPEN': 'proctor_event_DEV_TOOLS_OPEN',
  'MOUSE_INACTIVE': 'proctor_event_MOUSE_INACTIVE',
  'PROCTORING_ERROR': 'proctor_event_PROCTORING_ERROR',
  'PROCTORING_ALERT': 'proctor_event_PROCTORING_ALERT',
  'RECORDING_ERROR': 'proctor_event_RECORDING_ERROR',
  'FULLSCREEN_REQUIRED': 'proctor_event_FULLSCREEN_REQUIRED',
}

const SEVERITY_KEY_MAP = {
  'HIGH': 'proctor_severity_high',
  'MEDIUM': 'proctor_severity_medium',
  'LOW': 'proctor_severity_low',
}

const DETAIL_PREFIX_MAP = [
  ['fullscreen exited while screen is being recorded', 'proctor_detail_fullscreen_exit_recording'],
  ['fullscreen mode exited during exam', 'proctor_detail_fullscreen_exit_exam'],
  ['fullscreen is required for this test', 'proctor_detail_fullscreen_required'],
  ['screen sharing was interrupted', 'proctor_detail_screen_share_lost'],
  ['camera view is blocked or too dark', 'proctor_detail_camera_blocked'],
  ['live face differs from verified identity', 'proctor_detail_face_mismatch'],
  ['too many tab switches', 'proctor_detail_tab_too_many'],
  ['tab switches:', 'proctor_detail_tab_switches'],
  ['tab hidden / switched', 'proctor_detail_tab_hidden'],
  ['automatic proctoring alert detected', 'proctor_default_detail'],
  ['a proctoring event was detected', 'notif_detail_proctoring_default'],
  ['f12 (devtools) key blocked', 'proctor_detail_f12_blocked'],
  ['ctrl+shift+', 'proctor_detail_devtools_shortcut'],
  ['ctrl+u (view source) blocked', 'proctor_detail_view_source_blocked'],
  ['printscreen key blocked', 'proctor_detail_printscreen_blocked'],
  ['context menu blocked during exam', 'proctor_detail_context_menu_blocked'],
  ['browser developer tools appear to be open', 'proctor_detail_devtools_open'],
  ['virtual machine / remote desktop', 'proctor_detail_vm_detected'],
  ['external display suspected', 'proctor_detail_multi_monitor'],
  ['no mouse movement for', 'proctor_detail_mouse_inactive'],
  ['attempt blocked during exam', 'proctor_detail_copy_blocked'],
]

function translateEventType(eventType, t) {
  const key = EVENT_TYPE_KEY_MAP[eventType]
  if (key) return t(key)
  return eventType?.replace(/_/g, ' ') || t('proctor_violation')
}

function translateSeverity(severity, t) {
  const key = SEVERITY_KEY_MAP[severity]
  return key ? t(key) : severity
}

function translateDetail(detail, t) {
  if (!detail) return t('proctor_default_detail')
  const lower = detail.toLowerCase()
  for (const [prefix, key] of DETAIL_PREFIX_MAP) {
    if (lower.startsWith(prefix) || lower.includes(prefix)) return t(key)
  }
  return detail
}

export default function ViolationToast({ event, onClose }) {
  const { t } = useLanguage()

  useEffect(() => {
    const timer = setTimeout(onClose, 7000)
    return () => clearTimeout(timer)
  }, [onClose])

  const eventLabel = translateEventType(event.event_type, t)
  const severityLabel = translateSeverity(event.severity || 'LOW', t)
  const severityClass = styles['toast' + (event.severity || 'LOW')]
  const confidence = typeof event.ai_confidence === 'number'
    ? event.ai_confidence
    : typeof event.confidence === 'number'
      ? event.confidence
      : null
  const hasConfidence = confidence != null
  const detailMessage = translateDetail(event.detail?.trim(), t)

  return (
    <motion.div
      className={styles.toastWrap}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className={`${styles.toast} ${severityClass} glass`}>
        <div className={styles.toastMain}>
          <span className={styles.severity}>{severityLabel}</span>
          <span className={styles.eventType}>{eventLabel}</span>
          {hasConfidence && (
            <span className={styles.confidence}>{t('proctor_confidence')} {Math.round(confidence * 100)}%</span>
          )}
        </div>
        <div className={styles.toastDetail}>{detailMessage}</div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('proctor_dismiss_alert')}>x</button>
      </div>
    </motion.div>
  )
}
