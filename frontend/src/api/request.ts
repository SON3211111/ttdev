// API 공통 요청 함수입니다. 각 화면에서 쓰는 응답 타입을 호출자가 지정합니다.
export async function apiRequest<T>(path: string, options: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  try {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      // 기본 15초를 기다립니다. 화면의 취소 신호나 시간 제한 중 먼저 발생하는 쪽으로 요청을 중단합니다.
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      // fieldErrors는 '본문이 비었음'처럼 입력 항목별 오류입니다. 여러 개면 한 문장으로 합칩니다.
      // 응답이 JSON이 아니거나 항목별 오류가 없다면 서버 메시지 또는 기본 문구를 사용합니다.
      const message = error?.fieldErrors?.map((field: { message: string }) => field.message).join(' ')
      throw new Error(message || error?.message || '요청을 처리하지 못했습니다.')
    }
    // 204는 '성공했지만 돌려줄 내용 없음'입니다. 없는 본문을 JSON으로 읽으면 오류가 나므로 건너뜁니다.
    return response.status === 204 ? undefined as T : await response.json() as T
  } catch (error) {
    // 화면 이동 때문에 취소한 조회는 서버 장애가 아닙니다. 원래 오류를 넘기면 화면이 취소 여부를 보고 무시합니다.
    if (options.signal?.aborted) throw error
    if (error instanceof TypeError || (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))) {
      // 인터넷이 끊겨 응답을 못 받아도 서버는 이미 저장했을 수 있습니다.
      // POST(등록)를 자동 반복하면 메모가 두 번 생길 수 있어 목록 확인을 안내합니다.
      // cause에는 원래 오류를 남깁니다. 사용자는 쉬운 안내를 보고 개발자는 원인을 추적할 수 있습니다.
      throw new Error(options.method && options.method !== 'GET'
        ? '응답을 확인하지 못했습니다. 변경이 반영됐을 수 있으니 목록을 확인한 뒤 다시 시도해주세요.'
        : '서버에 연결하지 못했습니다. 잠시 후 다시 조회해주세요.', { cause: error })
    }
    throw error
  }
}
