CREATE TABLE team_users (
  id int IDENTITY PRIMARY KEY,
  email nvarchar(254) NOT NULL UNIQUE,
  name nvarchar(80) NOT NULL,
  password_hash varchar(161) NOT NULL,
  role varchar(10) NOT NULL CHECK (role IN ('LEAD','MEMBER'))
);
CREATE UNIQUE INDEX team_single_lead ON team_users(role) WHERE role='LEAD';

CREATE TABLE team_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id int NOT NULL REFERENCES team_users(id) ON DELETE CASCADE,
  expires_at datetime2 NOT NULL
);

CREATE TABLE team_invites (
  token_hash char(64) PRIMARY KEY,
  email nvarchar(254) NOT NULL,
  expires_at datetime2 NOT NULL,
  consumed_at datetime2 NULL
);
