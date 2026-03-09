export function readPaginatedItems(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export function readPaginatedTotal(payload) {
  if (typeof payload?.total === 'number') return payload.total
  return readPaginatedItems(payload).length
}
