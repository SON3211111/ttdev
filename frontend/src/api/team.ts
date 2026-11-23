import { apiRequest } from './request'

export type Role = 'ADMIN' | 'LEAD' | 'MEMBER'
export type TeamKind = 'SALES' | 'DEV' | 'SUPPORT'
// 관리자(ADMIN)는 소속 팀이 없어서 teamId·teamName·teamKind가 null입니다.
export type TeamUser = { id: number; name: string; email: string; role: Role; teamId: number | null; teamName: string | null; teamKind: TeamKind | null }
export type TeamMember = Pick<TeamUser, 'id' | 'name' | 'role'> & { email?: string }
export type TeamSession = { user: TeamUser | null; setupRequired: boolean }
export type Team = { id: number; name: string; kind: TeamKind; location: string; leadName: string | null; memberCount: number }

export const roleLabels: Record<Role, string> = { ADMIN: '관리자', LEAD: '팀장', MEMBER: '팀원' }
export const teamKindLabels: Record<TeamKind, string> = { SALES: '영업형', DEV: '개발형', SUPPORT: '지원형' }

// 관리자는 팀이 없으므로 조회할 팀을 ?team=ID로 지정합니다. 팀원·팀장 요청에는 붙이지 않습니다.
export function withTeam(path: string, teamId?: number | null) {
  return teamId ? path + (path.includes('?') ? '&' : '?') + 'team=' + teamId : path
}

export function teamGet<T>(path: string, signal?: AbortSignal) {
  return apiRequest<T>('/api/team/' + path, { signal })
}

export function teamWrite<T>(path: string, method: string, value?: object) {
  return apiRequest<T>('/api/team/' + path, { method, body: value === undefined ? undefined : JSON.stringify(value) })
}
