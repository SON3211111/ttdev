import { useEffect, useState, type ReactNode } from 'react'
import { teamGet, type TeamSession } from '../api/team'

// 기존 개인 기능(메모·일기·약속·할 일) API는 팀 계정 로그인이 필요합니다.
// 로그인 전에는 API 오류 대신 로그인 안내를 보여줍니다.
export default function LegacyGate({ children, signIn }: { children: ReactNode; signIn: () => void }) {
  const [state, setState] = useState<'checking' | 'in' | 'out' | 'error'>('checking')

  useEffect(() => {
    const controller = new AbortController()
    teamGet<TeamSession>('auth/session', controller.signal)
      .then(session => setState(session.user ? 'in' : 'out'))
      .catch(() => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [])

  if (state === 'in') return <>{children}</>
  if (state === 'checking') return <p role="status" className="legacy-gate">로그인 상태를 확인하는 중입니다…</p>
  return <section className="legacy-gate" aria-labelledby="legacy-gate-title">
    <h1 id="legacy-gate-title">로그인이 필요합니다</h1>
    <p>{state === 'error' ? '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' : '나의 하루 기록·일정은 팀 계정으로 로그인한 뒤 사용할 수 있습니다.'}</p>
    <button className="back" type="button" onClick={signIn}>로그인하러 가기</button>
  </section>
}
