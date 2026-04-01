/**
 * Shared translation helpers for proctoring event types and severity labels.
 * Reuses existing locale keys (admin_wizard_alert_*, proctor_event_*, proctor_severity_*).
 */

const EVENT_TYPE_KEY_MAP = {
  'FACE_MISMATCH': 'admin_wizard_alert_face_mismatch',
  'CAMERA_COVERED': 'admin_wizard_alert_camera_covered',
  'FULLSCREEN_EXIT': 'admin_wizard_alert_fullscreen_exit',
  'TAB_SWITCH': 'admin_wizard_alert_tab_switch',
  'FOCUS_LOSS': 'admin_wizard_alert_focus_loss',
  'NO_FACE': 'admin_wizard_alert_no_face',
  'FACE_DISAPPEARED': 'admin_wizard_alert_no_face',
  'FACE_REAPPEARED': 'admin_wizard_alert_no_face',
  'MULTIPLE_FACES': 'admin_wizard_alert_multiple_faces',
  'LOUD_AUDIO': 'admin_wizard_alert_loud_audio',
  'AUDIO_ANOMALY': 'admin_wizard_alert_audio_anomaly',
  'FORBIDDEN_OBJ': 'admin_wizard_alert_forbidden_obj',
  'FORBIDDEN_OBJECT': 'admin_wizard_alert_forbidden_obj',
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
  'VIDEO_UPLOAD_PROGRESS': 'proctor_event_VIDEO_UPLOAD_PROGRESS',
  'VIDEO_SAVED': 'proctor_event_VIDEO_SAVED',
  'VIDEO_BATCH_ANALYSIS_QUEUED': 'proctor_event_VIDEO_BATCH_ANALYSIS_QUEUED',
  'VIDEO_BATCH_ANALYSIS_COMPLETED': 'proctor_event_VIDEO_BATCH_ANALYSIS_COMPLETED',
  'FACE_DISAPPEARED': 'proctor_event_FACE_DISAPPEARED',
  'FACE_REAPPEARED': 'proctor_event_FACE_REAPPEARED',
  'FACE_MATCH_RECOVERED': 'proctor_event_FACE_MATCH_RECOVERED',
  'VIDEO_UPLOAD_QUEUED': 'proctor_event_VIDEO_UPLOAD_QUEUED',
}

const SEVERITY_KEY_MAP = {
  'HIGH': 'proctor_severity_high',
  'MEDIUM': 'proctor_severity_medium',
  'LOW': 'proctor_severity_low',
}

export function translateEventType(eventType, t) {
  if (!eventType) return eventType
  const normalized = eventType.trim().toUpperCase().replace(/\s+/g, '_')
  const key = EVENT_TYPE_KEY_MAP[normalized]
  if (key) return t(key)
  return eventType.replace(/_/g, ' ')
}

export function translateSeverity(severity, t) {
  if (!severity) return severity
  const key = SEVERITY_KEY_MAP[severity.toUpperCase()]
  return key ? t(key) : severity
}
