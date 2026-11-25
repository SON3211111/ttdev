import { query } from '../db/db.mjs'
import { canViewAll } from './team-auth.mjs'

const dateInText = /\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[-./]\s*\d{1,2}[-./]\s*\d{1,2}|\d{1,2}\/\d{1,2}/u
const schedule = /일정|납품|납기|출고|배송|마감|기한|일자|날짜|시작|종료/u
const statedReason = /(?:변경|연기|지연|조정|이동)(?:의)?\s*(?:이유|사유|원인)|때문에|때문입니다/u
const missingReason = /기록.{0,16}(?:없|않|미기록)|(?:이유|사유|원인)\s*[:：]?\s*(?:없음|미기록|미확인)|기재.{0,12}(?:않|없)|확인.{0,10}(?:않|없)/u
const decisionSentence = sentence => schedule.test(sentence) && dateInText.test(sentence) && /확정|결정|합의/u.test(sentence)
  && !/미확정|보류|미정|(?:확정|결정|합의).{0,12}(?:않|못)|필요/u.test(sentence)

export function decisionHistoryQuestion(question) {
  return /변경\s*(?:경위|이유|사유)|어떻게\s*(?:바뀌|달라|변경|조정)|왜.{0,12}(?:변경|바뀌|미뤘|연기|조정)/u.test(question)
}

export function decisionEvidence(work, meetings) {
  const notes = meetings.map(meeting => ({
    ...meeting,
    sentences: [meeting.decisions, meeting.agenda, meeting.followups]
      .flatMap(section => (section ?? '').split(/\r?\n+|(?<=[.!?])\s+(?=[^\d\s])/u))
      .map(sentence => sentence.trim())
      .filter(sentence => sentence && (meeting.linkedCount === 1 || sentence.includes(work.title))),
  }))
  const approved = notes.filter(meeting => meeting.approvalStatus === 'APPROVED'
    && meeting.sentences.some(decisionSentence))
  const decisionDate = approved.map(meeting => meeting.date).sort().at(-1)
  const finalRecords = approved.filter(meeting => meeting.date === decisionDate)
  const priorRecords = notes.filter(meeting => meeting.approvalStatus !== 'APPROVED'
    && (!decisionDate || meeting.date < decisionDate))

  const quotes = (records, matches) => records.flatMap(meeting => [...new Set(meeting.sentences.filter(matches))]
    .map(text => ({ route: meeting.route, title: meeting.title, date: meeting.date, approvalStatus: meeting.approvalStatus, text }))).slice(0, 4)
  const final = quotes(finalRecords, decisionSentence)
  const prior = quotes(priorRecords, sentence => schedule.test(sentence) && dateInText.test(sentence) && /제안|초안|후보|검토/u.test(sentence))
  const reasons = quotes(finalRecords, sentence => statedReason.test(sentence) && !missingReason.test(sentence))

  return [
    { title: '최종 결정', quotes: final, message: final.length ? null : '연결된 승인 기록에서 확정 내용을 확인할 수 없습니다.' },
    { title: '이전 제안', quotes: prior, message: prior.length ? null : '연결된 기록에서 이전 제안을 확인할 수 없습니다.' },
    { title: '변경 이유', quotes: reasons.length ? reasons : quotes(finalRecords, sentence => statedReason.test(sentence) && missingReason.test(sentence)),
      message: reasons.length ? null : '확정 기록에 변경 이유가 확인되지 않습니다.' },
  ]
}

export async function readDecisionHistory(db, user, question, workId, reference) {
  const workRoute = reference?.route
  const referencedId = workRoute?.match(/^(?:work|personal-work)\/(\d+)/u)?.[1]
  const targetId = workId ?? (referencedId ? Number(referencedId) : null)
  const matches = await query(db, `SELECT TOP (2) w.id,w.team_id AS team,w.title,w.company,
    COALESCE(t.name,N'개인 캘린더') AS context,CONVERT(char(10),w.due_date,23) AS [date],
    CASE WHEN w.personal_owner_id IS NULL THEN CONCAT('work/',w.id,'?team=',w.team_id)
      ELSE CONCAT('personal-work/',w.id) END AS route
    FROM team_work w LEFT JOIN teams t ON t.id=w.team_id
    WHERE (w.personal_owner_id=@owner OR (w.personal_owner_id IS NULL AND (@allTeams=1 OR w.team_id=@team)))
      AND ((@target IS NOT NULL AND w.id=@target) OR (@target IS NULL AND
        ((LEN(w.title)>=2 AND CHARINDEX(REPLACE(w.title,N' ',N''),@question)>0)
          OR (LEN(w.company)>=2 AND CHARINDEX(REPLACE(w.company,N' ',N''),@question)>0))))
    ORDER BY w.id`, { owner: user.id, team: user.teamId, allTeams: canViewAll(user) ? 1 : 0,
    target: targetId, question: question.replace(/\s/gu, '') })
  if (matches.length !== 1) {
    return { sources: [], answer: '어느 업무의 변경 경위를 볼까요? 업무 제목이나 TSK 업무 번호를 알려주세요.', unavailable: false }
  }

  const work = matches[0]
  const meetings = work.team == null ? [] : await query(db, `SELECT
    CONCAT('team-reports?kind=',m.kind,'&date=',CONVERT(char(10),m.meeting_date,23),'&team=',m.team_id) AS route,
    CONCAT(CONVERT(char(10),m.meeting_date,23),CASE m.kind WHEN 'daily' THEN N' 일일회의' ELSE N' 주간회의' END) AS title,
    CONVERT(char(10),m.meeting_date,23) AS [date],m.approval_status AS approvalStatus,
    m.decisions,m.agenda,m.followups,(SELECT COUNT(*) FROM OPENJSON(m.work_ids)) AS linkedCount
    FROM team_meetings m WHERE m.team_id=@team AND EXISTS (
      SELECT 1 FROM OPENJSON(m.work_ids) WHERE TRY_CONVERT(int,value)=@work
    ) ORDER BY m.meeting_date DESC,m.kind`, { team: work.team, work: work.id })
  const { route, title, context, date } = work
  return {
    kind: 'history', sources: [{ route, title, context, date, excerpt: '' }],
    answer: meetings.length ? `${title}의 변경 경위입니다.` : `${title}에 연결된 회의 기록을 찾지 못했습니다.`,
    evidence: decisionEvidence(work, meetings), unavailable: false,
  }
}
