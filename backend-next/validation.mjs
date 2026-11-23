export class ApiError extends Error {
  constructor(status, code, message, field = null) {
    super(message)
    Object.assign(this, { status, code, field })
  }
}

export function invalid(message = '잘못된 요청입니다.') {
  throw new ApiError(400, 'INVALID_REQUEST', message)
}

export function validate(field, message = '입력값을 확인해주세요.') {
  throw new ApiError(400, 'VALIDATION_ERROR', message, field)
}

export function queryKeys(params, allowed) {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid()
  }
}

export function text(value, field, max, required = false) {
  if (value != null && typeof value !== 'string') invalid()
  const normalized = value?.trim() || null
  if ((required && !normalized) || normalized?.length > max) validate(field)
  return normalized
}

export function choice(value, field, options) {
  if (!options.includes(value)) validate(field)
  return value
}

export function date(value, field, optional = false) {
  if (value == null && optional) return null
  if (value == null) validate(field)
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) invalid()
  const parsed = new Date(value)
  if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== value) invalid()
  if (value < '1000-01-01') validate(field)
  return value
}

export function seoulToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export function shiftDay(value, days) {
  const parsed = new Date(value)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function calendarMonth(params) {
  queryKeys(params, ['month'])
  const month = params.get('month')
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month ?? '')) invalid()
  const [year, number] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return [month + '-01', month + '-' + last]
}

export function recordInput(input, type, today = seoulToday()) {
  const title = text(input.title, 'title', 100)
  const content = text(input.content, 'content', 10000, true).replace(/\r\n?/g, '\n')
  const recordDate = date(input.recordDate, 'recordDate')
  if (title && type === 'MEMO') validate('title')
  if (recordDate > today) validate('recordDate')
  return { title, content, recordDate }
}

export function pageNumber(value, fallback, field, min, max) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) validate(field)
  const number = Number(value)
  if (number < min || number > max) validate(field)
  return number
}

export async function body(request, allowed) {
  const value = await request.json().catch(() => invalid())
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid()
  return value
}
