// 날짜 입력칸/API가 사용할 'YYYY-MM-DD' 문자열을 만듭니다. 사용자가 해외에 있어도 한국 날짜를 사용합니다.
export const dateString = (date: Date) => {
  // UTC는 세계 표준 시각이고 한국은 UTC+9입니다. 한국 새벽에는 UTC 날짜가 아직 어제일 수 있습니다.
  // toISOString으로 자르지 않고 Asia/Seoul에서 연/월/일을 따로 꺼내 하루가 달라지는 문제를 피합니다.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (name: string) => parts.find(value => value.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
// 모듈을 처음 불러온 순간의 오늘입니다. 계속 열린 화면에서 자정에 자동으로 바뀌는 타이머는 없습니다.
export const today = dateString(new Date())
export const day = (offset: number) => {
  const value = new Date(`${today}T12:00:00+09:00`)
  // offset=1이면 내일입니다. 브라우저 현지 시간 대신 UTC 날짜를 더한 뒤 다시 한국 날짜로 바꿉니다.
  value.setUTCDate(value.getUTCDate() + offset)
  return dateString(value)
}
