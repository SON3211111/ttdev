import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarMonth } from './validation.mjs'

test('calendar bounds cover leap years and the last supported month', () => {
  assert.deepEqual(calendarMonth(new URLSearchParams('month=2024-02')), ['2024-02-01', '2024-02-29'])
  assert.deepEqual(calendarMonth(new URLSearchParams('month=9999-12')), ['9999-12-01', '9999-12-31'])
  assert.throws(() => calendarMonth(new URLSearchParams('month=2024-02&month=2024-03')))
})
