// DB 연결 전에 디자인을 확인하려고 만든 예시 데이터입니다. 현재 홈 기록은 API로 읽으므로 이 예시를 쓰지 않습니다.
import type { RecordEntry } from '../types/record'
import { today, day } from '../utils/date'

export const previewRecords: RecordEntry[] = [
 {id:1,type:'메모',date:today,title:'다시 가고 싶은 작은 책방',content:'산책하다 발견한 골목의 책방. 창가 자리가 조용해서 다음에는 책 한 권 들고 가야겠다.'},
 {id:2,type:'일기',date:day(-1),title:'조금 천천히 걸었던 하루',content:'오랜만에 이어폰을 빼고 걸었다. 매일 지나던 길에도 아직 못 보던 풍경이 많았다.'},
 {id:3,type:'메모',date:day(-2),title:'주말에 만들어 볼 것',content:'따뜻한 버섯 수프. 장 볼 때 버섯이랑 우유 사오기.'}
]
