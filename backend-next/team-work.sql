CREATE TABLE team_work (
  id int IDENTITY PRIMARY KEY,
  title nvarchar(100) NOT NULL,
  company nvarchar(160) NULL,
  category varchar(12) NOT NULL CHECK (category IN ('QUOTE','DELIVERY','MEETING','OTHER')),
  start_date date NOT NULL,
  due_date date NOT NULL,
  notes nvarchar(2000) NULL,
  status varchar(12) NOT NULL CHECK (status IN ('WAITING','IN_PROGRESS','DONE')),
  assignee_id int NOT NULL REFERENCES team_users(id),
  created_by int NOT NULL REFERENCES team_users(id),
  source_quote_id int NULL REFERENCES team_work(id),
  completed_date date NULL,
  CONSTRAINT team_work_period CHECK (start_date <= due_date)
);
CREATE INDEX team_work_dates ON team_work(start_date,due_date);
