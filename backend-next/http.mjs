import { ApiError } from './validation.mjs'

export function found(row, resource) {
  if (!row) throw new ApiError(404, resource + '_NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}
