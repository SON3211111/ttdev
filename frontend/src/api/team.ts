import { apiRequest } from './request'

export type Role = 'LEAD' | 'MEMBER'
export type Title = '대표' | '본부장' | '팀장' | '프로'
export type TeamKind = 'SALES' | 'DEV' | 'TECH' | 'SUPPORT'
// 관리자는 별도 계정이 아니라 팀 구성원에게 주는 권한(isAdmin)입니다. 직급(title)은 가입할 때 본인이 고르는 표시용입니다.
export type TeamUser = {
  id: number; name: string; email: string; role: Role; isAdmin: boolean; title: Title
  teamId: number | null; membershipTeamId: number | null; managedTeamId: number | null; teamName: string; teamKind: TeamKind
}
export type TeamMember = Pick<TeamUser, 'id' | 'name' | 'role'> & { email?: string; title?: Title; isAdmin?: boolean }
// setupRequired는 처음 설치(사용자 없음)이고, 이때 첫 사용자가 고를 팀 목록(teams)을 함께 받습니다.
// takenTitles는 이미 사용 중인 대표·본부장입니다(회사 전체에 각각 1명).
export type TeamSession = { user: TeamUser | null; setupRequired: boolean; setupTokenRequired?: boolean; teams?: { id: number; name: string }[]; takenTitles?: Title[] }
export type Team = {
  id: number; name: string; kind: TeamKind; location: string; leadName: string | null; memberCount: number
  todayCount: number; overdueCount: number
}

export const titles: Title[] = ['대표', '본부장', '팀장', '프로']
export const uniqueTitles: Title[] = ['대표', '본부장']
export const roleLabels: Record<Role, string> = { LEAD: '팀장', MEMBER: '팀원' }
// 화면 표기: 기술(기술영업), 개발(솔루션개발), 연구(기업부설연구소), 경영(경영지원). 내부 코드는 SALES·DEV·TECH·SUPPORT입니다.
export const teamKindLabels: Record<TeamKind, string> = { SALES: '기술', DEV: '개발', TECH: '연구', SUPPORT: '경영' }

// 관리자와 팀장 이상(팀장·본부장·대표)은 다른 팀을 읽기 전용으로 볼 수 있습니다.
export function canViewAll(user?: Pick<TeamUser, 'isAdmin' | 'title' | 'role'> | null) {
  return !!user?.isAdmin
}

// 화면에 보여줄 직급 표기. 관리자 권한이 있으면 "(관리자)"를 붙입니다.
export function titleLabel(user: { title?: Title; isAdmin?: boolean; role?: Role }) {
  return (user.title ?? (user.role === 'LEAD' ? '팀장' : '프로')) + (user.isAdmin ? ' (관리자)' : '')
}

// 다른 팀을 조회할 때만 ?team=ID를 붙입니다. 자기 팀 요청에는 붙이지 않습니다.
export function withTeam(path: string, teamId?: number | null) {
  return teamId ? path + (path.includes('?') ? '&' : '?') + 'team=' + teamId : path
}

export function teamGet<T>(path: string, signal?: AbortSignal) {
  return apiRequest<T>('/api/team/' + path, { signal })
}

export function teamWrite<T>(path: string, method: string, value?: object) {
  return apiRequest<T>('/api/team/' + path, { method, body: value === undefined ? undefined : JSON.stringify(value) })
}
