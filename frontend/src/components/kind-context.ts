import { createContext } from 'react'
import type { TeamKind } from '../api/team'

// 지금 보고 있는 공간의 팀 유형입니다. 업무 구분 라벨과 선택지가 이 값을 따릅니다.
export const KindContext = createContext<TeamKind>('SALES')
