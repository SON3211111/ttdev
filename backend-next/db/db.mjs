import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sql from 'mssql'

let connection

async function connect() {
  const databaseName = process.env.SQLSERVER_DATABASE ?? 'appdb'
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)) throw new Error('Invalid SQL Server database name')
  const config = {
    server: process.env.SQLSERVER_HOST ?? 'sqlserver',
    port: Number(process.env.SQLSERVER_PORT ?? 1433),
    user: process.env.SQLSERVER_USER ?? 'sa',
    password: process.env.SQLSERVER_PASSWORD,
    options: { encrypt: true, trustServerCertificate: process.env.SQLSERVER_TRUST_CERTIFICATE === 'true' },
  }
  if (process.env.SQLSERVER_AUTO_MIGRATE === 'false') {
    return new sql.ConnectionPool({ ...config, database: databaseName }).connect()
  }
  const master = await new sql.ConnectionPool({ ...config, database: 'master' }).connect()
  try {
    await master.request().batch(`IF DB_ID(N'${databaseName}') IS NULL CREATE DATABASE [${databaseName}]`)
  } finally {
    await master.close()
  }
  const pool = await new sql.ConnectionPool({ ...config, database: databaseName }).connect()
  try {
    const teamSchema = await readFile(join(process.cwd(), 'db', 'team-schema.sql'), 'utf8')
    const workSchema = await readFile(join(process.cwd(), 'db', 'team-work.sql'), 'utf8')
    const reportsSchema = await readFile(join(process.cwd(), 'db', 'team-reports.sql'), 'utf8')
    await transaction(pool, async tx => {
      await query(tx, "DECLARE @lock int; EXEC @lock = sp_getapplock @Resource=N'appdb-schema', @LockMode='Exclusive'; IF @lock < 0 THROW 50001, 'Schema lock failed', 1;")
      const [migration] = await query(tx, "SELECT OBJECT_ID(N'dbo.team_users', N'U') AS teamUsers")
      if (!migration.teamUsers) await tx.request().batch(teamSchema)
      const [work] = await query(tx, "SELECT OBJECT_ID(N'dbo.team_work', N'U') AS id")
      if (!work.id) await tx.request().batch(workSchema)
      await tx.request().batch(`IF COL_LENGTH('dbo.team_work','personal_owner_id') IS NULL
        ALTER TABLE dbo.team_work ADD personal_owner_id int NULL
        REFERENCES dbo.team_users(id),
        CONSTRAINT team_work_personal_owner CHECK (personal_owner_id IS NULL OR personal_owner_id=assignee_id)`)
      await tx.request().batch(`IF COL_LENGTH('dbo.team_work','work_time') IS NULL
        ALTER TABLE dbo.team_work ADD work_time time(0) NULL,
        reminder_offsets nvarchar(100) NOT NULL CONSTRAINT team_work_offsets_default DEFAULT N'[]',
        reminder_repeat nvarchar(8) NOT NULL CONSTRAINT team_work_repeat_default DEFAULT N'없음'`)
      const [reports] = await query(tx, "SELECT OBJECT_ID(N'dbo.team_reports', N'U') AS id")
      if (!reports.id) await tx.request().batch(reportsSchema)
      await tx.request().batch(`IF OBJECT_ID(N'dbo.team_meetings', N'U') IS NULL CREATE TABLE dbo.team_meetings (
        meeting_date date NOT NULL, kind varchar(8) NOT NULL CHECK (kind IN ('daily','weekly')),
        author_id int NOT NULL REFERENCES dbo.team_users(id), agenda nvarchar(4000) NOT NULL,
        decisions nvarchar(4000) NOT NULL, followups nvarchar(4000) NOT NULL,
        CONSTRAINT team_meetings_pk PRIMARY KEY (meeting_date,kind)
      )`)
      await tx.request().batch(`IF COL_LENGTH('dbo.team_meetings','work_ids') IS NULL
        ALTER TABLE dbo.team_meetings ADD work_ids nvarchar(max) NOT NULL CONSTRAINT team_meetings_work_default DEFAULT N'[]',
        approval_status varchar(10) NOT NULL CONSTRAINT team_meetings_approval_default DEFAULT 'DRAFT'
        CONSTRAINT team_meetings_approval_check CHECK (approval_status IN ('DRAFT','PENDING','APPROVED'))`)
      await tx.request().batch(`IF COL_LENGTH('dbo.team_meetings','approved_by') IS NULL
        ALTER TABLE dbo.team_meetings ADD approved_by int NULL REFERENCES dbo.team_users(id), approved_at datetime2 NULL`)
      const [organization] = await query(tx, "SELECT COL_LENGTH('dbo.team_users','managed_team_id') AS currentModel")
      if (!organization.currentModel) await migrateOrganization(tx)
      // 팀원도 자기 팀에 초대할 수 있으므로, 초대를 만든 사람을 남깁니다(이전 초대는 비어 있음).
      await tx.request().batch(`IF COL_LENGTH('dbo.team_invites','invited_by') IS NULL
        ALTER TABLE dbo.team_invites ADD invited_by int NULL CONSTRAINT team_invites_inviter REFERENCES dbo.team_users(id)`)
      await tx.request().batch(`IF COL_LENGTH('dbo.team_work','end_time') IS NULL
        ALTER TABLE dbo.team_work ADD end_time time(0) NULL,
          created_at datetime2 NULL CONSTRAINT team_work_created_default DEFAULT SYSUTCDATETIME();
      IF OBJECT_ID(N'dbo.team_work_history', N'U') IS NULL CREATE TABLE dbo.team_work_history (
        id bigint IDENTITY PRIMARY KEY,
        work_id int NOT NULL REFERENCES dbo.team_work(id) ON DELETE CASCADE,
        actor_id int NOT NULL REFERENCES dbo.team_users(id),
        changed_at datetime2 NOT NULL CONSTRAINT team_work_history_date_default DEFAULT SYSUTCDATETIME(),
        changes nvarchar(2000) NOT NULL
      );
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.team_work_history') AND name='team_work_history_work')
        CREATE INDEX team_work_history_work ON dbo.team_work_history(work_id,id DESC)`)
      await tx.request().batch(`IF OBJECT_ID(N'dbo.team_work_files', N'U') IS NULL CREATE TABLE dbo.team_work_files (
        work_id int NOT NULL REFERENCES dbo.team_work(id) ON DELETE CASCADE,
        id int IDENTITY NOT NULL,
        uploaded_by int NOT NULL REFERENCES dbo.team_users(id),
        filename nvarchar(140) NOT NULL,
        content_type varchar(32) NOT NULL,
        content varbinary(max) NOT NULL,
        created_at datetime2 NOT NULL CONSTRAINT team_work_files_created_default DEFAULT SYSUTCDATETIME(),
        CONSTRAINT team_work_files_pk PRIMARY KEY(work_id,id)
      )`)
      await tx.request().batch(`IF COL_LENGTH('dbo.team_users', 'is_active') IS NULL
        ALTER TABLE dbo.team_users ADD is_active bit NOT NULL CONSTRAINT team_users_active_default DEFAULT 1`)
      if (!organization.currentModel) {
        await tx.request().batch(`ALTER TABLE dbo.team_users ADD managed_team_id int NULL REFERENCES dbo.teams(id);
          ALTER TABLE dbo.team_users DROP CONSTRAINT team_users_member_role;
          DROP INDEX team_lead_per_team ON dbo.team_users;
          DROP INDEX team_users_one_lead_title ON dbo.team_users;
          ALTER TABLE dbo.team_users ALTER COLUMN team_id int NULL;`)
        await tx.request().batch(`UPDATE dbo.team_users SET managed_team_id=team_id WHERE role='LEAD';
          UPDATE dbo.team_users SET team_id=NULL WHERE title IN (N'대표',N'본부장');
          IF EXISTS (SELECT 1 FROM dbo.team_users WHERE is_active=1 AND is_admin=1 AND title IN (N'대표',N'본부장'))
            UPDATE dbo.team_users SET is_admin=0 WHERE title NOT IN (N'대표',N'본부장');
          ALTER TABLE dbo.team_users ADD CONSTRAINT team_users_membership CHECK (
            (title=N'대표' AND role='MEMBER' AND team_id IS NULL AND managed_team_id IS NULL) OR
            (title=N'본부장' AND role='MEMBER' AND team_id IS NULL) OR
            (title=N'프로' AND role='MEMBER' AND team_id IS NOT NULL AND managed_team_id IS NULL) OR
            (title=N'팀장' AND role='LEAD' AND team_id IS NOT NULL AND managed_team_id IS NOT NULL AND managed_team_id=team_id));
          CREATE UNIQUE INDEX team_managed_once ON dbo.team_users(managed_team_id) WHERE managed_team_id IS NOT NULL;`)
      }
      await tx.request().batch(`IF OBJECT_ID(N'dbo.team_users_membership', N'C') IS NOT NULL
        ALTER TABLE dbo.team_users DROP CONSTRAINT team_users_membership;
        IF OBJECT_ID(N'dbo.team_users_membership_optional', N'C') IS NOT NULL
          ALTER TABLE dbo.team_users DROP CONSTRAINT team_users_membership_optional;
        IF OBJECT_ID(N'dbo.team_users_membership_director', N'C') IS NULL
          ALTER TABLE dbo.team_users ADD CONSTRAINT team_users_membership_director CHECK (
            (title=N'대표' AND role='MEMBER' AND team_id IS NULL AND managed_team_id IS NULL) OR
            (title=N'본부장' AND role='MEMBER') OR
            (title=N'프로' AND role='MEMBER' AND managed_team_id IS NULL) OR
            (title=N'팀장' AND role='LEAD' AND team_id IS NOT NULL AND managed_team_id IS NOT NULL AND managed_team_id=team_id));`)
      await tx.request().batch(`IF OBJECT_ID(N'dbo.team_org_history', N'U') IS NULL CREATE TABLE dbo.team_org_history (
        id int IDENTITY PRIMARY KEY, actor_id int NOT NULL REFERENCES dbo.team_users(id),
        target_id int NOT NULL REFERENCES dbo.team_users(id), changes nvarchar(2000) NOT NULL,
        changed_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
      )`)
      await tx.request().batch(`IF OBJECT_ID(N'dbo.team_reports_team_pk', N'PK') IS NULL
      BEGIN
        DECLARE @oldPk sysname = (SELECT name FROM sys.key_constraints
          WHERE parent_object_id=OBJECT_ID(N'dbo.team_reports') AND type='PK');
        IF @oldPk IS NOT NULL
        BEGIN
          DECLARE @dropPk nvarchar(300) = N'ALTER TABLE dbo.team_reports DROP CONSTRAINT ' + QUOTENAME(@oldPk);
          EXEC sys.sp_executesql @dropPk;
        END
        ALTER TABLE dbo.team_reports ALTER COLUMN team_id int NOT NULL;
        ALTER TABLE dbo.team_reports ADD CONSTRAINT team_reports_team_pk PRIMARY KEY (team_id, week_start, user_id, kind);
      END`)
    })
    return pool
  } catch (error) {
    await pool.close()
    throw error
  }
}

// 여러 팀 조직 구조로 바꿉니다. 관리자(ADMIN)는 팀이 없고, 팀장(LEAD)은 팀마다 1명입니다.
// 기존 단일 팀의 사용자·업무·회의·보고서는 기술영업 1팀(sort_order 10)으로 옮깁니다. 여러 번 실행해도 안전합니다.
async function migrateOrganization(tx) {
  await tx.request().batch(`IF OBJECT_ID(N'dbo.teams', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.teams (
      id int IDENTITY PRIMARY KEY,
      name nvarchar(60) NOT NULL CONSTRAINT teams_name_unique UNIQUE,
      kind varchar(10) NOT NULL CONSTRAINT teams_kind_check CHECK (kind IN ('SALES','DEV','TECH','SUPPORT')),
      location nvarchar(20) NOT NULL,
      sort_order int NOT NULL
    );
    INSERT INTO dbo.teams (name,kind,location,sort_order) VALUES
      (N'기술영업 1팀','SALES',N'대구 본사',10), (N'기술영업 2팀','SALES',N'대구 본사',20),
      (N'기술영업팀(서울지사)','SALES',N'서울지사',30), (N'솔루션개발 1팀','DEV',N'대구 본사',40),
      (N'솔루션개발 2팀','DEV',N'대구 본사',50), (N'경영지원팀','SUPPORT',N'대구 본사',60),
      (N'기업부설연구소','TECH',N'대구 본사',70);
  END`)
  for (const table of ['team_users', 'team_work', 'team_meetings', 'team_reports', 'team_invites']) {
    await tx.request().batch(`IF COL_LENGTH('dbo.${table}','team_id') IS NULL ALTER TABLE dbo.${table} ADD team_id int NULL`)
  }
  await tx.request().batch(`IF COL_LENGTH('dbo.team_invites','role') IS NULL
    ALTER TABLE dbo.team_invites ADD role varchar(10) NOT NULL CONSTRAINT team_invites_role_default DEFAULT 'MEMBER'
    CONSTRAINT team_invites_role_check CHECK (role IN ('LEAD','MEMBER'))`)
  await tx.request().batch(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='team_lead_per_team' AND object_id=OBJECT_ID('dbo.team_users'))
  BEGIN
    DECLARE @first int = (SELECT id FROM dbo.teams WHERE sort_order=10);
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='team_single_lead' AND object_id=OBJECT_ID('dbo.team_users'))
      DROP INDEX team_single_lead ON dbo.team_users;
    DECLARE @check sysname = (SELECT TOP 1 name FROM sys.check_constraints
      WHERE parent_object_id=OBJECT_ID('dbo.team_users') AND definition LIKE '%MEMBER%');
    IF @check IS NOT NULL EXEC(N'ALTER TABLE dbo.team_users DROP CONSTRAINT ' + @check);
    UPDATE dbo.team_users SET team_id=@first WHERE team_id IS NULL AND role<>'ADMIN';
    UPDATE dbo.team_work SET team_id=@first WHERE team_id IS NULL AND personal_owner_id IS NULL;
    UPDATE dbo.team_meetings SET team_id=@first WHERE team_id IS NULL;
    UPDATE r SET team_id=COALESCE(u.team_id,@first) FROM dbo.team_reports r JOIN dbo.team_users u ON u.id=r.user_id WHERE r.team_id IS NULL;
    UPDATE dbo.team_invites SET team_id=@first WHERE team_id IS NULL;
    ALTER TABLE dbo.team_users ADD CONSTRAINT team_users_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
      CONSTRAINT team_users_role CHECK ((role='ADMIN' AND team_id IS NULL) OR (role IN ('LEAD','MEMBER') AND team_id IS NOT NULL));
    ALTER TABLE dbo.team_work ADD CONSTRAINT team_work_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
      CONSTRAINT team_work_scope CHECK ((personal_owner_id IS NULL AND team_id IS NOT NULL) OR (personal_owner_id IS NOT NULL AND team_id IS NULL));
    ALTER TABLE dbo.team_reports ADD CONSTRAINT team_reports_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id);
    ALTER TABLE dbo.team_invites ADD CONSTRAINT team_invites_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id);
    ALTER TABLE dbo.team_meetings DROP CONSTRAINT team_meetings_pk;
    ALTER TABLE dbo.team_meetings ALTER COLUMN team_id int NOT NULL;
    ALTER TABLE dbo.team_meetings ADD CONSTRAINT team_meetings_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
      CONSTRAINT team_meetings_team_pk PRIMARY KEY (team_id,meeting_date,kind);
    CREATE INDEX team_work_team_dates ON dbo.team_work(team_id,start_date,due_date);
    CREATE UNIQUE INDEX team_lead_per_team ON dbo.team_users(team_id) WHERE role='LEAD';
  END`)
  // 팀 유형별 업무 구분(영업·개발·지원)을 저장할 수 있게 구분 제약을 넓힙니다.
  await tx.request().batch(`IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='team_work_category' AND parent_object_id=OBJECT_ID('dbo.team_work'))
  BEGIN
    DECLARE @old sysname = (SELECT TOP 1 name FROM sys.check_constraints
      WHERE parent_object_id=OBJECT_ID('dbo.team_work') AND definition LIKE '%QUOTE%');
    IF @old IS NOT NULL EXEC(N'ALTER TABLE dbo.team_work DROP CONSTRAINT ' + @old);
    ALTER TABLE dbo.team_work ADD CONSTRAINT team_work_category CHECK (category IN
      ('QUOTE','DELIVERY','MEETING','OTHER','DEVELOP','TEST','FIELD','PURCHASE','APPROVAL','HR','ACCOUNTING'));
  END`)
  // 관리자 겸직: 관리자는 팀에 속한 사용자에게 주는 권한(is_admin)입니다. 직급(title)은 대표·본부장·팀장·프로 중 본인이 고릅니다.
  // 예전 ADMIN 역할 계정은 기술영업 1팀 소속 관리자로 바꾸고, 관리자가 없으면 기존 팀장(없으면 첫 사용자)에게 관리자 권한을 줍니다.
  await tx.request().batch(`IF COL_LENGTH('dbo.team_users','is_admin') IS NULL
    ALTER TABLE dbo.team_users ADD is_admin bit NOT NULL CONSTRAINT team_users_admin_default DEFAULT 0,
      title nvarchar(10) NOT NULL CONSTRAINT team_users_title_default DEFAULT N'프로'
      CONSTRAINT team_users_title_check CHECK (title IN (N'대표',N'본부장',N'팀장',N'프로'))`)
  await tx.request().batch(`IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='team_users_role' AND parent_object_id=OBJECT_ID('dbo.team_users'))
  BEGIN
    DECLARE @first int = (SELECT id FROM dbo.teams WHERE sort_order=10);
    ALTER TABLE dbo.team_users DROP CONSTRAINT team_users_role;
    UPDATE dbo.team_users SET is_admin=1, role='MEMBER', team_id=COALESCE(team_id,@first) WHERE role='ADMIN';
    UPDATE dbo.team_users SET title=N'팀장' WHERE role='LEAD';
    ALTER TABLE dbo.team_users ADD CONSTRAINT team_users_member_role CHECK (role IN ('LEAD','MEMBER') AND team_id IS NOT NULL);
    IF NOT EXISTS (SELECT 1 FROM dbo.team_users WHERE is_admin=1)
      UPDATE dbo.team_users SET is_admin=1 WHERE id=(SELECT TOP 1 u.id FROM dbo.team_users u JOIN dbo.teams t ON t.id=u.team_id
        ORDER BY CASE WHEN u.role='LEAD' THEN 0 ELSE 1 END, t.sort_order, u.id);
  END`)
  // 대표·본부장은 회사 전체에 각각 1명입니다. 이미 중복이 있으면 먼저 가입한 1명만 남기고 나머지는 '프로'로 바꿉니다.
  await tx.request().batch(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='team_users_unique_title' AND object_id=OBJECT_ID('dbo.team_users'))
  BEGIN
    UPDATE u SET title=N'프로' FROM dbo.team_users u
      WHERE u.title IN (N'대표',N'본부장') AND EXISTS (SELECT 1 FROM dbo.team_users o WHERE o.title=u.title AND o.id<u.id);
    CREATE UNIQUE INDEX team_users_unique_title ON dbo.team_users(title) WHERE title IN (N'대표',N'본부장');
  END`)
  // '팀장' 직급 = 팀장 권한, 부서마다 1명. 대표·본부장이면서 팀장 권한이던 계정은 팀원 권한으로, 팀장 권한인데 프로면 팀장으로,
  // 팀원 권한인데 팀장 직급이면 프로로 맞춥니다.
  await tx.request().batch(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='team_users_one_lead_title' AND object_id=OBJECT_ID('dbo.team_users'))
  BEGIN
    UPDATE dbo.team_users SET role='MEMBER' WHERE role='LEAD' AND title IN (N'대표',N'본부장');
    UPDATE dbo.team_users SET title=N'팀장' WHERE role='LEAD';
    UPDATE dbo.team_users SET title=N'프로' WHERE role<>'LEAD' AND title=N'팀장';
    CREATE UNIQUE INDEX team_users_one_lead_title ON dbo.team_users(team_id) WHERE title=N'팀장';
  END`)
  // 팀 유형에 '기술'(TECH)을 더하고 기업부설연구소를 기술 유형으로 옮깁니다(업무 구분은 개발 유형과 같음).
  await tx.request().batch(`IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='teams_kind_check' AND definition NOT LIKE '%TECH%')
  BEGIN
    ALTER TABLE dbo.teams DROP CONSTRAINT teams_kind_check;
    ALTER TABLE dbo.teams ADD CONSTRAINT teams_kind_check CHECK (kind IN ('SALES','DEV','TECH','SUPPORT'));
    UPDATE dbo.teams SET kind='TECH' WHERE name=N'기업부설연구소' AND kind='DEV';
  END`)
}

export async function database() {
  connection ??= connect().catch(error => {
    connection = undefined
    throw error
  })
  return connection
}

export async function query(source, statement, params = {}) {
  const request = source.request()
  for (const [name, value] of Object.entries(params)) {
    const type = Buffer.isBuffer(value) ? sql.VarBinary(sql.MAX) : typeof value === 'number' ? sql.BigInt : sql.NVarChar(sql.MAX)
    request.input(name, type, value)
  }
  return (await request.query(statement)).recordset
}

export async function transaction(pool, work) {
  const tx = pool.transaction()
  await tx.begin()
  try {
    const result = await work(tx)
    await tx.commit()
    return result
  } catch (error) {
    await tx.rollback().catch(() => {})
    throw error
  }
}
