import { calendarMonth, choice, shiftDay, text, validate } from '../lib/validation.mjs'

const periods = {
  today: ['오늘', /오늘/u], tomorrow: ['내일', /내일/u], yesterday: ['어제', /어제/u],
  thisWeek: ['이번 주', /이번\s*주/u], nextWeek: ['다음 주', /다음\s*주/u], lastWeek: ['지난 주', /지난\s*주/u],
  thisMonth: ['이번 달', /이번\s*(?:달|월)/u], nextMonth: ['다음 달', /다음\s*(?:달|월)/u], lastMonth: ['지난 달', /지난\s*(?:달|월)/u],
}
export const statuses = { waiting: '대기', progress: '진행 중', done: '완료', overdue: '기한 초과', open: '미완료', all: '모든 상태' }
export const dateFields = { due: '마감일', start: '시작일', overlap: '업무 기간', completed: '완료일' }
const defaultScope = { name: null, team: null, period: null, status: 'open', dateField: 'overlap' }
const title = /^(?<name>[\p{L}\p{N}·]{2,40}?)(?:\s*(?:프로|팀장|본부장|대표)(?:님)?|\s*님)(?:가|이|은|는|의)?\s*/u
const assignment = /^(?<name>[\p{L}\p{N}·]{2,40}?)(?:가|이|은|는|의)\s*(?=(?:지금\s*|현재\s*|요즘\s*)?(?:맡|담당|진행))/u
const teamPrefix = /^(?<team>[\p{L}\p{N}()· ]{1,48}?팀)(?:의|에서|은|는)?\s+/u
const listWords = /업무|일정|담당|맡|건|마감|시작|완료|진행|대기|지연/u

export function validateWorkContext(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaultScope, key))) validate('context')
  return {
    name: text(value.name, 'context', 80),
    team: text(value.team, 'context', 60),
    period: value.period == null ? null : choice(value.period, 'context', Object.keys(periods)),
    status: choice(value.status, 'context', Object.keys(statuses)),
    dateField: choice(value.dateField, 'context', Object.keys(dateFields)),
  }
}

export function workQuestion(question, previous = null) {
  if (/왜|이유|배경|회의록|결정|원인|추천|방법/u.test(question)) return null
  const period = Object.entries(periods).find(([, [, match]]) => match.test(question))?.[0]
  const status = /완료\s*포함|모든\s*상태/u.test(question) ? 'all'
    : /기한\s*초과|지연/u.test(question) ? 'overdue'
    : /미\s*완료|안\s*끝난/u.test(question) ? 'open'
    : /완료|끝낸|끝난/u.test(question) ? 'done'
    : /진행\s*중|진행하는/u.test(question) ? 'progress'
    : /대기/u.test(question) ? 'waiting' : undefined
  const dateField = /마감|기한/u.test(question) ? 'due' : /시작/u.test(question) ? 'start' : undefined
  const team = question.match(teamPrefix)
  const subject = (team ? question.slice(team[0].length) : question)
    .replace(/^(?:이번|다음|지난)\s*(?:주|달|월)\s+|^(?:오늘|내일|어제)\s+/u, '')
  const person = subject.match(title) ?? subject.match(assignment)
  const followup = previous && !team && !person && !/전체/u.test(question) && /^(?:그\s*중(?:에|에서)?|오늘|내일|어제|(?:이번|다음|지난)\s*(?:주|달|월)|(?:미\s*)?완료|진행\s*중|대기|마감|시작|지연)/u.test(question)
  if ((!listWords.test(question) && !(followup && (period || status))) || (!team && !person && !period && !status && !followup)) return null
  if (followup && !(period || status || dateField)) return null
  // 업체명, 특정 요일 등 구조화하지 않은 조건이 있으면 범위를 넓혀 단정하는 대신 원문 검색으로 넘깁니다.
  const remainder = (person ? subject.slice(person[0].length) : subject)
    .replace(period ? periods[period][1] : /$^/u, '')
    .replace(/그\s*중(?:에|에서)?|지금|현재|요즘|맡(?:고\s*있는|은|았던)|담당(?:하고\s*있는|하는|한)?|미\s*완료|완료(?:된|한|된\s*것|\s*포함)?|진행\s*중(?:인)?|진행하는|대기(?:\s*중인)?|모든\s*상태|기한\s*초과|지연(?:된)?|안\s*끝난|끝난|끝낸|업무|일정|마감(?:일|하는|인)?|시작(?:일|하는)?|전체|목록|정리해\s*(?:줘|주세요)|알려\s*(?:줘|주세요)|보여\s*(?:줘|주세요)|뭐(?:가|야|예요|에요)?|뭔가요|어떤|있(?:어|나요|지|습니다|는)|몇|[\s.,?!]|건|개|업|일|것|게|만|수|은|는|이|가|을|를|의|중|에|야|좀/gu, '')
  if (remainder) return null

  const base = followup ? previous : defaultScope
  return {
    name: person?.groups.name ?? base.name,
    team: team?.groups.team ?? base.team,
    period: period ?? base.period,
    status: status ?? base.status,
    dateField: dateField ?? base.dateField,
  }
}

export function workPeriod(period, today) {
  if (!period) return null
  if (period.endsWith('Month')) {
    const month = new Date(today + 'T00:00:00Z')
    month.setUTCDate(1)
    month.setUTCMonth(month.getUTCMonth() + (period === 'nextMonth' ? 1 : period === 'lastMonth' ? -1 : 0))
    return calendarMonth(new URLSearchParams({ month: month.toISOString().slice(0, 7) }))
  }
  if (period.endsWith('Week')) {
    const weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7
    const start = shiftDay(today, -weekday + (period === 'nextWeek' ? 7 : period === 'lastWeek' ? -7 : 0))
    return [start, shiftDay(start, 6)]
  }
  const day = shiftDay(today, period === 'tomorrow' ? 1 : period === 'yesterday' ? -1 : 0)
  return [day, day]
}

export const periodLabel = period => periods[period]?.[0]
