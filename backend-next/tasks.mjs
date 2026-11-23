import { query, transaction } from './db.mjs'
import { created, found, idOf, listing, remove } from './http.mjs'
import { body, calendarMonth, choice, date, seoulToday, shiftDay, text } from './validation.mjs'

const statuses = ['TODO', 'DOING', 'DONE']
const fields = ['title', 'description', 'priority', 'dueDate']
const summary = 'CONVERT(varchar(20), task_id) AS id, title, status, CONVERT(char(10), due_date, 23) AS dueDate'
const projection = summary + `, description, priority, completed_at AS completedAt, created_at AS createdAt, updated_at AS updatedAt,
  CAST(CASE WHEN due_date < @today AND status <> 'DONE' THEN 1 ELSE 0 END AS bit) AS overdue`
const order = 'CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, task_id DESC'
const history = 'FROM task_transitions WHERE task_id=@id ORDER BY transition_id DESC'

async function detail(db, id, today, lock = '') {
  const [row] = await query(db, `SELECT ${projection} FROM tasks ${lock} WHERE task_id=@id`, { id, today })
  return found(row, 'TASK')
}

async function input(request) {
  const value = await body(request, fields)
  return {
    title: text(value.title, 'title', 100, true),
    description: text(value.description, 'description', 2000),
    priority: value.priority == null ? null : choice(value.priority, 'priority', ['LOW', 'NORMAL', 'HIGH']),
    dueDate: date(value.dueDate, 'dueDate', true),
  }
}

async function dashboard(db, today) {
  const start = shiftDay(today, -6)
  const end = shiftDay(today, 6)
  const [totals] = await query(db, `SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status='DONE' THEN 1 END) AS done, COUNT(CASE WHEN status='DOING' THEN 1 END) AS doing,
    COUNT(CASE WHEN due_date < @today AND status <> 'DONE' THEN 1 END) AS overdue FROM tasks`, { today })
  const trend = await query(db, `SELECT CONVERT(char(10), completed_date, 23) AS date, COUNT(*) AS count
    FROM tasks WHERE completed_date BETWEEN @start AND @today AND status='DONE' GROUP BY completed_date`, { start, today })
  const upcoming = await query(db, `SELECT CONVERT(char(10), due_date, 23) AS date, COUNT(*) AS count
    FROM tasks WHERE due_date BETWEEN @today AND @end AND status <> 'DONE' GROUP BY due_date`, { today, end })
  function fill(first, rows) {
    const counts = new Map(rows.map(row => [row.date, row.count]))
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftDay(first, index)
      return { date, count: counts.get(date) ?? 0 }
    })
  }
  return { ...totals, trend: fill(start, trend), upcomingDue: fill(today, upcoming) }
}

async function transition(pool, id, today, requested) {
  return transaction(pool, async tx => {
    const current = await detail(tx, id, today, 'WITH (UPDLOCK, HOLDLOCK)')
    let next = requested
    if (next === null) {
      if (current.status !== 'DONE') return current
      const [event] = await query(tx, `SELECT TOP (1) previous_status AS status FROM task_transitions
        WHERE task_id=@id AND next_status='DONE' ORDER BY transition_id DESC`, { id })
      next = event?.status ?? 'TODO'
    }
    if (current.status === next) return current
    await query(tx, `DECLARE @now datetime2(3) = SYSUTCDATETIME();
      UPDATE tasks SET status=@next, updated_at=@now,
        completed_at=CASE WHEN @next='DONE' THEN @now END,
        completed_date=CASE WHEN @next='DONE' THEN CONVERT(date,@today) END WHERE task_id=@id;
      INSERT INTO task_transitions (task_id,previous_status,next_status,changed_at) VALUES (@id,@previous,@next,@now);`,
    { id, today, previous: current.status, next })
    return detail(tx, id, today)
  })
}

export async function taskCalendar(db, params) {
  const [start, end] = calendarMonth(params)
  return Response.json(await query(db, `SELECT ${summary} FROM tasks WHERE due_date BETWEEN @start AND @end ORDER BY ${order}`, { start, end }))
}

export async function tasks(db, request, path, params) {
  const today = seoulToday()
  if (path.length === 0 && request.method === 'GET') {
    const status = params.has('status') ? choice(params.get('status'), 'status', statuses) : null
    const where = status ? ' WHERE status=@status' : ''
    const { items, page, totalPages } = await listing(db, projection, 'FROM tasks' + where, order, params, { today, status }, ['status', 'page'], 20)
    return Response.json({ items, page, totalPages })
  }
  if (path.length === 0 && request.method === 'POST') {
    const value = await input(request)
    const [row] = await query(db, `INSERT INTO tasks (title,description,due_date,priority,status,created_at,updated_at)
      OUTPUT inserted.task_id AS id VALUES (@title,@description,@dueDate,COALESCE(@priority,'NORMAL'),'TODO',SYSUTCDATETIME(),SYSUTCDATETIME())`, value)
    return created('tasks', await detail(db, row.id, today))
  }
  if (path.length === 1 && path[0] === 'dashboard' && request.method === 'GET') return Response.json(await dashboard(db, today))
  if (path.length === 1 && path[0] === 'focus' && request.method === 'GET') {
    return Response.json(await query(db, `SELECT TOP (3) ${projection} FROM tasks WHERE status <> 'DONE' ORDER BY ${order}`, { today }))
  }
  if (path.length < 1 || path.length > 2) return
  const id = idOf(path[0])
  if (path.length === 2) {
    if (request.method === 'PUT' && path[1] === 'status') {
      const value = await body(request, ['status'])
      return Response.json(await transition(db, id, today, choice(value.status, 'status', statuses)))
    }
    if (request.method === 'PUT' && path[1] === 'reopen') return Response.json(await transition(db, id, today, null))
    if (request.method === 'GET' && path[1] === 'history') {
      await detail(db, id, today)
      return Response.json(await query(db, 'SELECT previous_status AS previousStatus, next_status AS nextStatus, changed_at AS changedAt ' + history, { id }))
    }
    return
  }
  if (request.method === 'GET') return Response.json(await detail(db, id, today))
  if (request.method === 'DELETE') return remove(db, 'tasks', 'task_id', id, 'TASK')
  if (request.method === 'PUT') {
    const value = await input(request)
    return Response.json(await transaction(db, async tx => {
      const [row] = await query(tx, `UPDATE tasks SET title=@title, description=@description, due_date=@dueDate,
        priority=COALESCE(@priority,priority), updated_at=SYSUTCDATETIME() OUTPUT inserted.task_id WHERE task_id=@id`, { ...value, id })
      found(row, 'TASK')
      return detail(tx, id, today)
    }))
  }
}
