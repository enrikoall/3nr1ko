CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('member','manager','admin')), pin TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE sessions (token TEXT PRIMARY KEY, person TEXT NOT NULL REFERENCES people(id), expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE entries (id TEXT PRIMARY KEY, person TEXT NOT NULL REFERENCES people(id), project TEXT NOT NULL REFERENCES projects(id), day TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440), note TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX entries_day ON entries(day,person);
--> statement-breakpoint
CREATE INDEX sessions_expiry ON sessions(expires);
--> statement-breakpoint
CREATE TRIGGER daily_limit_insert BEFORE INSERT ON entries WHEN (SELECT COALESCE(SUM(minutes),0) FROM entries WHERE person=NEW.person AND day=NEW.day)+NEW.minutes>1440 BEGIN SELECT RAISE(ABORT,'Daily total exceeds 24 hours'); END;
--> statement-breakpoint
CREATE TRIGGER daily_limit_update BEFORE UPDATE ON entries WHEN (SELECT COALESCE(SUM(minutes),0) FROM entries WHERE person=NEW.person AND day=NEW.day AND id!=NEW.id)+NEW.minutes>1440 BEGIN SELECT RAISE(ABORT,'Daily total exceeds 24 hours'); END;
