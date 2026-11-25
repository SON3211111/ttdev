import { calendarMonth, choice, seoulToday, shiftDay, text, validate } from '../lib/validation.mjs'

const periods = {
  today: ['오늘', /오늘/u], tomorrow: ['내일', /내일/u], yesterday: ['어제', /어제/u],
  thisWeek: ['이번 주', /이번\s*주/u], nextWeek: ['다음 주', /다음\s*주/u], lastWeek: ['지난 주', /지난\s*주/u],
  thisMonth: ['이번 달', /이번\s*(?:달|월)/u], nextMonth: ['다음 달', /다음\s*(?:달|월)/u], lastMonth: ['지난 달', /지난\s*(?:달|월)/u],
}
export const statuses = { waiting: '대기', progress: '진행 중', done: '완료', overdue: '기한 초과', open: '미완료', all: '모든 상태' }
export const dateFields = { due: '마감일', start: '시작일', overlap: '업무 기간', completed: '완료일' }
export const defaultScope = { name: null, team: null, keyword: null, exclude: null, period: null, status: 'open', dateField: 'overlap' }
const isoDate = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u
const isoMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/u
const monthPattern = /(?:(?<year>\d{4})\s*년\s*)?(?<month>1[0-2]|0?[1-9])\s*월(?!\s*\d)/u

// 업무 목록 질문임을 알려 주는 말. 이 말이 없으면 업무 조회로 보지 않는다.
const listWords = /업무|일정|실적|성과|담당|맡|건|마감|시작|완료|진행|대기|지연|밀린|할\s*일|작업|일거리|뭐\s*(?:해|하|맡)|급한|급해|우선순위|임박/u
// 근거·경위를 묻는 질문은 원문 검색과 변경 경위 처리로 보낸다.
const reasonWords = /왜|이유|배경|회의록|결정|원인|추천|방법|언제|정했|바뀌|변경|경위|미뤘/u
export const urgentWords = /급한|급해|우선순위|먼저\s*해야|가장\s*빠른|제일\s*빠른|임박/u

const teamPattern = /(?:^|\s)(?<team>[\p{L}·]{1,30}(?:\s?\d{1,2})?팀(?:\s?\([^)]{1,20}\))?)(?![장원별])(?:의|에서는|에서|에는|에|은|는|이|가)?(?=\s|$)/u
const ownTeam = /^(?:우리|내|저희)\s*팀$/u
const titledPerson = /(?:^|\s)(?<name>[가-힣]{2,4})\s*(?:프로|팀장|본부장|대표|님|씨)(?:님)?(?:가|이|은|는|의|한테)?(?=\s|$)/u
const assigningPerson = /(?:^|\s)(?<name>[가-힣]{2,4})(?:가|이|은|는|의)\s*(?=(?:지금\s*|현재\s*|요즘\s*)?(?:맡|담당|진행|하고\s*있|하는\s))/u
// "내 업무", "내가 해야 할 일"처럼 질문한 사람 본인을 가리키는 말. "내일"의 "내"는 제외한다.
const selfWord = /(?:^|\s)(?:(?:내|제|나의|저의)\s*(?=업무|일정|담당|할\s*일|마감|건|작업)|(?:내가|제가|나는|저는|나한테|저한테|나|저)(?=\s|$))/u
const datePattern = /(?:(?<year>\d{4})\s*(?:년|[-./])\s*)?(?<month>\d{1,2})\s*(?:월|[-./])\s*(?<day>\d{1,2})\s*일?/u
const weekdayPattern = /(?:(?<week>이번|다음|지난)\s*주\s*)?(?<weekday>[월화수목금토일])요일/u
const weekdays = '월화수목금토일'
// "'삼성' 빼고", "삼성 들어간 거 제외하고"
const excludePattern = /["'‘’“”]?(?<word>[\p{L}\p{N}]{2,20})["'‘’“”]?\s*(?:이|가)?\s*(?:들어간|포함된|관련된?)?\s*(?:거|것|업무)?\s*(?:빼고|제외(?:하고|한)?)/u
const english = [[/\bmy\s+(?:tasks?|work|todos?)\b/giu, '내 업무'], [/\bthis\s+week\b/giu, '이번 주'], [/\bnext\s+week\b/giu, '다음 주'],
  [/\blast\s+week\b/giu, '지난 주'], [/\btoday\b/giu, '오늘'], [/\btomorrow\b/giu, '내일'], [/\byesterday\b/giu, '어제'],
  [/\boverdue\b/giu, '지연'], [/\b(?:done|completed)\b/giu, '완료'], [/\b(?:tasks?|work|todos?)\b/giu, '업무'],
  [/\b(?:what|are|is|the|show|me|list|please|do|i|have|any|for)\b/giu, ' ']]

const conditionPhrases = /완료\s*포함|모든\s*상태|기한\s*초과\S*|안\s*끝난|미\s*완료\S*|(?:진행|대기)\s*중\S*|(?:완료|진행|대기|지연|밀린|끝난|끝낸|마감|기한|시작|실적|성과)\S*|까지/gu
const listPhrases = /(?:하고\s*있는|하는)\s*(?=업무|작업|일(?:\s|$)|건(?:\s|$))|뭐(?:가)?\s*있는지|업무\S*|일정\S*|할\s*일|담당\S*|맡\S*|작업\S*|일거리\S*|건(?=\s|$)|(?:급한|급해|우선순위|임박)\S*|먼저\s*해야/gu
const particleOnly = /^(?:에|에서|에는|의|은|는|이|가|을|를|도|만|요|까지|부터|중|중에|중에서|및|와|과|랑)$/u
const shortFiller = /^(?:다|거|것|게|건|할|한|그|중|개|몇|좀|돼|되|된|될|있|없|나|저|뭐|뭔|뭘|또|해|했|하|제일|가장|젤)(?:어|어요|요|야|냐|나|나요|니|지|죠|는|은|이|가|을|을까|를|에|에서|만|도|들|습니까|는지|던|었어|있어|있나|있니|있는|있지|가요|인가요|건가요|든|게|개|있어요|고|고\s*있어|는\s*거|ㄴ|면)?$/u
const longFiller = /^(?:무엇|무슨|어떤|어떻게|어때|알려|보여|정리|요약|말해|확인|체크|현황|상황|목록|리스트|전체|전부|모두|모든|전사|회사|예정|잡혀|잡힌|해야|하는|지금|현재|요즘|그중|혹시|대해|관련|해줘|해주|해줄|줘|주세요|줄래|부탁|있는|있어|있나|있니|있는지|있을|상태|팀|우리|제가|내가|저희)[가-힣]{0,6}$/u
const particleTail = /(?:에서는|에서|에는|으로|에게|까지|부터|이랑|이에요|예요|이야|인가요|인지|은|는|을|를|의|에|도|만)$/u

export function validateWorkContext(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaultScope, key))) validate('context')
  const period = value.period == null ? null : isoDate.test(value.period) || isoMonth.test(value.period) ? value.period : choice(value.period, 'context', Object.keys(periods))
  return {
    name: text(value.name, 'context', 80),
    team: text(value.team, 'context', 60),
    keyword: text(value.keyword, 'context', 40),
    exclude: text(value.exclude, 'context', 40),
    period,
    status: choice(value.status, 'context', Object.keys(statuses)),
    dateField: choice(value.dateField, 'context', Object.keys(dateFields)),
  }
}

// 특정 날짜("11월 27일", "11/27")와 요일("금요일", "다음 주 월요일")을 YYYY-MM-DD로 바꾼다.
function explicitDate(question, today) {
  const date = question.match(datePattern)
  if (date) {
    const { year, month, day } = date.groups
    const value = `${year ?? today.slice(0, 4)}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    if (isoDate.test(value) && new Date(value + 'T00:00:00Z').toISOString().startsWith(value)) return [value, date[0]]
  }
  const weekday = question.match(weekdayPattern)
  if (weekday) {
    const monday = shiftDay(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7))
    const offset = { 다음: 7, 지난: -7 }[weekday.groups.week] ?? 0
    return [shiftDay(monday, offset + weekdays.indexOf(weekday.groups.weekday)), weekday[0]]
  }
  // "11월 실적"처럼 달만 말하면 그 달 전체(YYYY-MM)다.
  const month = question.match(monthPattern)
  if (month) return [`${month.groups.year ?? today.slice(0, 4)}-${month.groups.month.padStart(2, '0')}`, month[0]]
  return null
}

export const normalizeQuestion = question => english.reduce((value, [pattern, word]) => value.replace(pattern, word), question)
  .replace(/(우리|내|저희)\s+팀(?![장원])/gu, '$1팀')

// 질문에서 팀·사람·본인·기간·날짜·제외어를 뽑고, 군더더기를 버린 나머지 단어를 돌려준다.
// extraFiller는 회의 질문처럼 호출하는 쪽에서 더 버릴 말이다.
export function extractConditions(question, { viewerName = null, today = seoulToday(), extraFiller = null } = {}) {
  let rest = ' ' + normalizeQuestion(question).replace(/[?!.,？！。]+/gu, ' ') + ' '
  const take = match => { if (match) rest = rest.replace(match[0], ' '); return match }
  const exclude = take(rest.match(excludePattern))?.groups.word ?? null
  const teamText = take(rest.match(teamPattern))?.groups.team
  const team = teamText ? (ownTeam.test(teamText) ? '우리팀' : teamText) : null
  const person = (take(rest.match(titledPerson)) ?? take(rest.match(assigningPerson)))?.groups.name ?? null
  const self = viewerName && take(rest.match(selfWord)) ? viewerName : null
  const dated = explicitDate(rest, today)
  if (dated) rest = rest.replace(dated[1], ' ')
  const periodKey = dated ? null : Object.entries(periods).find(([, [, match]]) => match.test(rest))?.[0]
  if (periodKey) rest = rest.replace(periods[periodKey][1], ' ')
  if (extraFiller) rest = rest.replace(extraFiller, ' ')
  const words = rest.replace(conditionPhrases, ' ').replace(listPhrases, ' ')
    .split(/\s+/u).filter(Boolean)
    .map(word => particleOnly.test(word) || shortFiller.test(word) || longFiller.test(word) ? '' : word)
    .map(word => { const stripped = word.replace(particleTail, ''); return stripped.length >= 2 ? stripped : word })
    .filter(word => word && !particleOnly.test(word) && !shortFiller.test(word) && !longFiller.test(word))
  return { team, person, self, period: dated?.[0] ?? periodKey ?? null, exclude, words }
}

// 업무 목록 질문을 조건으로 바꾼다. 남은 단어가 1~2개면 키워드(사람 이름 또는 제목·내용 검색어)로 쓴다.
export function workQuestion(question, previous = null, viewerName = null, today = seoulToday()) {
  const normalized = normalizeQuestion(question)
  if (reasonWords.test(normalized)) return null
  const { team, person, self, period, exclude, words } = extractConditions(normalized, { viewerName, today })
  if (words.length > 2 || words.some(word => word.length < 2)) return null
  const keyword = words.length ? words.join(' ') : null

  const status = /완료\s*포함|모든\s*상태/u.test(normalized) ? 'all'
    : /기한\s*초과|지연|밀린/u.test(normalized) ? 'overdue'
    : /미\s*완료|안\s*끝난/u.test(normalized) ? 'open'
    : /완료|끝낸|끝난|실적|성과/u.test(normalized) ? 'done'
    : /진행\s*중|진행하는/u.test(normalized) ? 'progress'
    : /대기/u.test(normalized) ? 'waiting' : undefined
  const dateField = /마감|기한|까지/u.test(normalized) ? 'due' : /시작/u.test(normalized) ? 'start' : undefined
  const urgent = urgentWords.test(normalized)

  const followup = previous && !team && !person && !self && !keyword && !/전체/u.test(normalized)
    && /^(?:그\s*중(?:에|에서)?|오늘|내일|어제|(?:이번|다음|지난)\s*(?:주|달|월)|\d{1,2}\s*월|[월화수목금토일]요일|(?:미\s*)?완료|진행\s*중|대기|마감|시작|지연|(?:제일|가장)?\s*급한)/u.test(normalized.trim())
  // "이번주", "오늘"처럼 기간만 말해도 그 기간의 업무로 본다.
  const periodOnly = period && !words.length && normalized.replace(/[\s?!.]/gu, '').length <= 8
  if (!listWords.test(normalized) && !(followup && (period || status)) && !periodOnly) return null
  if (!team && !person && !self && !keyword && !exclude && !period && !status && !followup) return null
  if (followup && !(period || status || dateField || urgent || exclude)) return null

  const base = followup ? previous : defaultScope
  return {
    name: self ?? person ?? base.name,
    team: team ?? base.team,
    keyword: keyword ?? base.keyword ?? null,
    exclude: exclude ?? base.exclude ?? null,
    period: period ?? base.period,
    status: status ?? base.status,
    dateField: dateField ?? base.dateField,
  }
}

export function workPeriod(period, today) {
  if (!period) return null
  if (isoDate.test(period)) return [period, period]
  if (isoMonth.test(period)) return calendarMonth(new URLSearchParams({ month: period }))
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

export const periodLabel = period => isoDate.test(period ?? '') ? `${+period.slice(5, 7)}월 ${+period.slice(8, 10)}일`
  : isoMonth.test(period ?? '') ? `${+period.slice(5, 7)}월` : periods[period]?.[0]
