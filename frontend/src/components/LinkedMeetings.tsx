import { useEffect, useState } from 'react'
import { teamGet, withTeam } from '../api/team'

type MeetingLink = { kind: 'daily' | 'weekly'; day: string }

export default function LinkedMeetings({ workId, teamId }: { workId: string; teamId?: number }) {
  const [meetings, setMeetings] = useState<MeetingLink[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    teamGet<MeetingLink[]>(withTeam('work/' + workId + '/meetings', teamId), controller.signal).then(setMeetings).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '연결된 회의를 읽지 못했습니다.')
    })
    return () => controller.abort()
  }, [workId, teamId])

  return <section className="sw-work-files" aria-label="연계 회의">
    <h3>연계 회의</h3>
    {error && <p role="alert" className="sw-error">{error}</p>}
    {meetings?.length === 0 && <p>연결된 회의가 없습니다.</p>}
    {!!meetings?.length && <div className="sw-buttons sw-meeting-links">{meetings.map(({ kind, day }) =>
      <a key={kind + day} className="sw-secondary" href={`#team-reports?kind=${kind}&date=${day}${teamId ? '&team=' + teamId : ''}`}>
        {day} {kind === 'daily' ? '일일회의' : '주간회의'}
      </a>)}
    </div>}
  </section>
}
