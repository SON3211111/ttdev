import { query, transaction } from './db.mjs'
import { created, found, idOf, listing, remove } from './http.mjs'
import { body, calendarMonth, choice, date, seoulToday, shiftDay, text, validate } from './validation.mjs'

const summary = `CONVERT(varchar(20), schedule_id) AS id, title, status,
  CONVERT(char(10), schedule_date, 23) AS scheduleDate, CONVERT(char(5), schedule_time, 108) AS scheduleTime`
const projection = summary + ', location, description, created_at AS createdAt, updated_at AS updatedAt'
const order = 'schedule_date, CASE WHEN schedule_time IS NULL THEN 1 ELSE 0 END, schedule_time, schedule_id'
const fields = ['title', 'scheduleDate', 'scheduleTime', 'location', 'description']

async function detail(db, id) {
  const [row] = await query(db, `SELECT ${projection} FROM schedules WHERE schedule_id=@id`, { id })
  return found(row, 'SCHEDULE')
}

async function input(request, updating) {
  const value = await body(request, updating ? [...fields, 'status'] : fields)
  const scheduleTime = text(value.scheduleTime, 'scheduleTime', 5)
  if (scheduleTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) validate('scheduleTime')
  return {
    title: text(value.title, 'title', 100, true),
    scheduleDate: date(value.scheduleDate, 'scheduleDate'),
    scheduleTime,
    location: text(value.location, 'location', 200),
    description: text(value.description, 'description', 2000),
    status: updating ? choice(value.status, 'status', ['PLANNED', 'COMPLETED', 'CANCELLED']) : 'PLANNED',
  }
}

export async function scheduleCalendar(db, params) {
  const [start, end] = calendarMonth(params)
  return Response.json(await query(db, `SELECT ${summary} FROM schedules WHERE schedule_date BETWEEN @start AND @end ORDER BY ${order}`, { start, end }))
}

export async function schedules(db, request, path, params) {
  if (path.length === 0 && request.method === 'GET') {
    const start = seoulToday()
    return Response.json(await listing(db, projection, "FROM schedules WHERE status='PLANNED' AND schedule_date BETWEEN @start AND @end",
      order, params, { start, end: shiftDay(start, 6) }, ['page', 'size']))
  }
  if (path.length === 0 && request.method === 'POST') {
    const value = await input(request, false)
    const [row] = await query(db, `INSERT INTO schedules (title,schedule_date,schedule_time,location,description,status,created_at,updated_at)
      OUTPUT inserted.schedule_id AS id VALUES (@title,@scheduleDate,@scheduleTime,@location,@description,@status,SYSUTCDATETIME(),SYSUTCDATETIME())`, value)
    return created('schedules', await detail(db, row.id))
  }
  if (path.length !== 1) return
  const id = idOf(path[0])
  if (request.method === 'GET') return Response.json(await detail(db, id))
  if (request.method === 'DELETE') return remove(db, 'schedules', 'schedule_id', id, 'SCHEDULE')
  if (request.method === 'PUT') {
    const value = await input(request, true)
    return Response.json(await transaction(db, async tx => {
      const [row] = await query(tx, `UPDATE schedules SET title=@title, schedule_date=@scheduleDate, schedule_time=@scheduleTime,
        location=@location, description=@description, status=@status, updated_at=SYSUTCDATETIME()
        OUTPUT inserted.schedule_id WHERE schedule_id=@id`, { ...value, id })
      found(row, 'SCHEDULE')
      return detail(tx, id)
    }))
  }
}
