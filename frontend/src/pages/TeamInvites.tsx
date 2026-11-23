import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { roleLabels, teamGet, teamWrite, type Role, type TeamUser } from '../api/team'

type Invite = { email: string; role: Role; teamId: number; teamName: string; expiresAt: string }

function inviteLink(token: string) {
  const url = new URL(location.pathname, location.origin)
  url.searchParams.set('invite', token)
  return url.toString()
}

function message(error: unknown) {
  return error instanceof Error ? error.message : '다시 시도해 주세요.'
}

// 만든 초대 링크를 보여주고 복사합니다. 메일 서버가 없으므로 링크를 직접 전달합니다.
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return <div className="ttech-form">
    <label>7일 동안 유효한 초대 링크<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
    <button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? '복사됨' : '링크 복사'}</button>
  </div>
}

// 수락 대기 중인 초대 목록과 재발송. 관리자는 전체, 팀장은 자기 팀만 봅니다. 재발송하면 새 링크가 나오고 이전 링크는 무효입니다.
export function PendingInvites({ admin, version = 0, heading }: { admin: boolean; version?: number; heading?: ReactNode }) {
  const [invites, setInvites] = useState<Invite[]>()
  const [error, setError] = useState('')
  const [resent, setResent] = useState<{ email: string; url: string }>()
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    teamGet<Invite[]>('auth/invites', controller.signal).then(setInvites).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [version, reload])

  async function resend(invite: Invite) {
    setError('')
    try {
      const input = admin ? { email: invite.email, teamId: invite.teamId, role: invite.role } : { email: invite.email }
      const { token } = await teamWrite<{ token: string }>('auth/invite', 'POST', input)
      setResent({ email: invite.email, url: inviteLink(token) })
      setReload(value => value + 1)
    } catch (error) {
      setError(message(error))
    }
  }

  return <section className="sw-card sw-invites" aria-label="초대 수락 대기">
    <h2>{heading ?? '초대 수락 대기'} {invites && <span className="sw-count-chip">{invites.length}건</span>}<small>유효기간 7일</small></h2>
    {error && <p role="alert" className="sw-error">{error}</p>}
    {!invites && !error && <p role="status">초대 현황을 불러오는 중입니다.</p>}
    {invites?.length === 0 && <p className="ttech-muted">수락을 기다리는 초대가 없습니다.</p>}
    <ul>{invites?.map(invite => <li key={invite.email}>
      <span><strong>{invite.email}</strong><small>{invite.teamName} · {roleLabels[invite.role]} · {invite.expiresAt.slice(0, 10)}까지</small></span>
      <button type="button" className="sw-secondary" onClick={() => void resend(invite)} aria-label={invite.email + ' 재발송'}>재발송</button>
    </li>)}</ul>
    {resent && <><p role="status">{resent.email} 초대 링크를 다시 만들었습니다.</p><InviteLink url={resent.url} /></>}
  </section>
}

// 팀장 설정 화면: 자기 팀 팀원 초대, 초대 대기 목록, (기존 설치에서 관리자가 없을 때) 관리자 계정 만들기.
// 팀장의 자기 팀 팀원 초대 폼. 링크를 만들면 onInvited로 알려 초대 대기 목록을 새로 읽게 합니다.
export function TeamInviteForm({ user, onInvited }: { user: TeamUser; onInvited: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = new FormData(event.currentTarget).get('email')
    setUrl('')
    setError('')
    setPending(true)
    teamWrite<{ token: string }>('auth/invite', 'POST', { email }).then(({ token }) => {
      setUrl(inviteLink(token))
      onInvited()
    }).catch(error => setError(message(error))).finally(() => setPending(false))
  }

  return <section className="sw-card sw-invites" aria-labelledby="team-invite-title">
    <h2 id="team-invite-title">{user.teamName} 팀원 초대</h2>
    {error && <p role="alert" className="sw-error">{error}</p>}
    <form onSubmit={invite} className="ttech-form">
      <label>초대할 이메일<input name="email" type="email" required maxLength={254} /></label>
      <button type="submit" disabled={pending}>초대 링크 만들기</button>
    </form>
    {url && <InviteLink url={url} />}
  </section>
}

// 팀장 설정 화면: 자기 팀 팀원 초대와 초대 대기 목록.
export default function TeamInvites({ user }: { user: TeamUser }) {
  const [version, setVersion] = useState(0)
  return <div className="sw-settings-stack">
    <TeamInviteForm user={user} onInvited={() => setVersion(value => value + 1)} />
    <PendingInvites admin={false} version={version} />
  </div>
}
