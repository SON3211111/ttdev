CREATE TABLE team_reports (
  week_start date NOT NULL,
  user_id int NOT NULL REFERENCES team_users(id),
  kind varchar(10) NOT NULL CHECK (kind IN ('personal','team')),
  accomplishments nvarchar(4000) NOT NULL,
  issues nvarchar(4000) NOT NULL,
  next_plan nvarchar(4000) NOT NULL,
  snapshot nvarchar(max) NULL,
  submitted_at datetime2 NULL,
  PRIMARY KEY (week_start,user_id,kind)
);
