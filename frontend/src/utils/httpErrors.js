function parseTextMessage(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return ''
  try {
    const parsed = JSON.parse(normalized)
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim()
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
    }
  } catch {
    // fall back to plain text
  }
  return normalized
}

export async function readBlobErrorMessage(error, fallback = 'Request failed.') {
  const responseData = error?.response?.data

  if (typeof responseData === 'string') {
    return parseTextMessage(responseData) || fallback
  }

  if (responseData && typeof responseData === 'object' && !(typeof Blob !== 'undefined' && responseData instanceof Blob)) {
    if (typeof responseData.detail === 'string' && responseData.detail.trim()) return responseData.detail.trim()
    if (typeof responseData.message === 'string' && responseData.message.trim()) return responseData.message.trim()
  }

  if (typeof Blob !== 'undefined' && responseData instanceof Blob) {
    try {
      const text = await responseData.text()
      return parseTextMessage(text) || fallback
    } catch {
      return fallback
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }

  return fallback
}
