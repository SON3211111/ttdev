import { ApiError } from './validation.mjs'

export function loginLimiter() {
  const attempts = new Map()
  let resetAt = 0
  let total = 0

  return (account, now = Date.now()) => {
    if (now >= resetAt) {
      attempts.clear()
      resetAt = now + 60_000
      total = 0
    }
    const count = attempts.get(account) ?? 0
    if (count >= 8 || total >= 120) {
      throw new ApiError(429, 'LOGIN_RATE_LIMIT', '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.')
    }
    attempts.set(account, count + 1)
    total += 1
  }
}
