import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/request'
import { taskError } from '../../api/tasks'

// 경로와 갱신 번호를 조회 키로 씁니다. 키가 바뀌면 이전 요청을 취소하고 새 응답 전까지 로딩 상태를 반환합니다.
export default function useTaskQuery<T>(path: string, revision: number) {
  const key = `${path}:${revision}`
  const [result, setResult] = useState<{ key: string; data: T | null; error: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    apiRequest<T>(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, data: null, error: taskError(error) }) })
    return () => controller.abort()
  }, [path, key])
  return result?.key === key ? result : null
}
