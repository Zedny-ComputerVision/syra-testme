const TRUTHY = new Set(['1', 'true', 'yes', 'y', 'on', 'enabled', 'required'])
const FALSY = new Set(['0', 'false', 'no', 'n', 'off', 'disabled'])
const ALERT_RULE_ACTIONS = new Set(['FLAG_REVIEW', 'WARN', 'AUTO_SUBMIT'])
const ALERT_RULE_SEVERITIES = new Set(['LOW', 'MEDIUM', 'HIGH'])

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (TRUTHY.has(normalized)) return true
    if (FALSY.has(normalized)) return false
  }
  return fallback
}

function readOptionalFlag(config, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      return asBool(config[key], false)
    }
  }
  return null
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeAlertRule(rule, index) {
  if (!rule || typeof rule !== 'object') return null
  const eventType = String(rule.event_type || rule.eventType || '').trim().toUpperCase()
  const threshold = Math.max(1, asInt(rule.threshold ?? rule.count, 0))
  if (!eventType || threshold < 1) return null

  const action = String(rule.action || 'WARN').trim().toUpperCase()
  const severity = String(rule.severity || 'MEDIUM').trim().toUpperCase()
  const message = typeof rule.message === 'string' ? rule.message.trim() : ''
  const safeAction = ALERT_RULE_ACTIONS.has(action) ? action : 'WARN'
  const safeSeverity = ALERT_RULE_SEVERITIES.has(severity) ? severity : 'MEDIUM'
  const fallbackId = `${eventType}-${threshold}-${safeAction}-${index + 1}`.toLowerCase()

  return {
    id: String(rule.id || fallbackId),
    event_type: eventType,
    threshold,
    severity: safeSeverity,
    action: safeAction,
    message,
  }
}

function normalizeAlertRules(rawRules) {
  if (!Array.isArray(rawRules)) return []
  return rawRules
    .map((rule, index) => normalizeAlertRule(rule, index))
    .filter(Boolean)
}

export function getJourneyRequirements(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const faceDetection = readOptionalFlag(cfg, ['face_detection', 'multi_face'])
  const audioDetection = readOptionalFlag(cfg, ['audio_detection'])

  let cameraRequired = readOptionalFlag(cfg, ['camera_required', 'require_camera', 'camera_enforce'])
  let micRequired = readOptionalFlag(cfg, ['mic_required', 'microphone_required', 'require_microphone'])
  let fullscreenRequired = readOptionalFlag(cfg, ['fullscreen_enforce', 'fullscreen_required', 'require_fullscreen'])
  let lightingRequired = readOptionalFlag(cfg, ['lighting_required', 'require_lighting_check'])
  let identityRequired = readOptionalFlag(cfg, [
    'identity_required',
    'id_verification_required',
    'require_identity_verification',
    'require_id_verification',
    'face_verify',
    'face_verify_enabled',
    'require_id_document',
    'id_document_required',
  ])

  if (cameraRequired === null) cameraRequired = Boolean(faceDetection)
  if (micRequired === null) micRequired = Boolean(audioDetection)
  if (fullscreenRequired === null) fullscreenRequired = false
  if (lightingRequired === null) lightingRequired = Boolean(cameraRequired)
  if (identityRequired === null) identityRequired = Boolean(faceDetection)

  const systemCheckRequired = Boolean(cameraRequired || micRequired || fullscreenRequired || lightingRequired)
  return {
    identityRequired: Boolean(identityRequired),
    systemCheckRequired,
    cameraRequired: Boolean(cameraRequired),
    micRequired: Boolean(micRequired),
    fullscreenRequired: Boolean(fullscreenRequired),
    lightingRequired: Boolean(lightingRequired),
  }
}

export function normalizeProctoringConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {}
  const requirements = getJourneyRequirements(cfg)
  return {
    ...cfg,
    alert_rules: normalizeAlertRules(cfg.alert_rules),
    fullscreen_enforce: requirements.fullscreenRequired,
    identity_required: requirements.identityRequired,
    face_verify: requirements.identityRequired,
    camera_required: requirements.cameraRequired,
    mic_required: requirements.micRequired,
    fullscreen_required: requirements.fullscreenRequired,
    lighting_required: requirements.lightingRequired,
  }
}
