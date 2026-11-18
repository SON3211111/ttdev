import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/request'
import { taskError } from '../../api/tasks'

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
