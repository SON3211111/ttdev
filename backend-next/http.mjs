import { ApiError, invalid, pageNumber, queryKeys } from './validation.mjs'
import { query } from './db.mjs'

export function idOf(id) {
  if (!/^\d{1,19}$/.test(id ?? '') || BigInt(id) < 1n || BigInt(id) > 9223372036854775807n) invalid()
  return id
}

export function found(row, resource) {
  if (!row) throw new ApiError(404, resource + '_NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

export function created(path, item) {
  return Response.json(item, { status: 201, headers: { Location: '/api/' + path + '/' + item.id } })
}

export async function remove(db, table, key, id, resource) {
  const [row] = await query(db, `DELETE FROM ${table} OUTPUT deleted.${key} WHERE ${key} = @id`, { id })
  found(row, resource)
  return new Response(null, { status: 204 })
}

export async function listing(db, select, from, order, params, filter, fields, fixedSize) {
  queryKeys(params, fields)
  const page = pageNumber(params.get('page'), 0, 'page', 0, 2147483647)
  const size = fixedSize ?? pageNumber(params.get('size'), 20, 'size', 1, 100)
  const offset = page * size
  if (offset > 2147483647) invalid()
  const [{ totalElements }] = await query(db, 'SELECT COUNT(*) AS totalElements ' + from, filter)
  const items = await query(db, `SELECT ${select} ${from} ORDER BY ${order} OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`, { ...filter, offset, size })
  return { items, page, size, totalElements, totalPages: Math.ceil(totalElements / size) }
}
