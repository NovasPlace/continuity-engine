# migrations

SQL migration files for the Cross-Session Memory plugin database schema.

## Migrations

### add_agent_work_journal.sql
Creates the `agent_work_journal` table for live incremental capture of agent work state. Allows fresh sessions to resume exactly where the last session left off.

**Table**: `agent_work_journal`
- Tracks tool calls, decisions, file changes, errors, milestones, and session ends
- Stores intent, target, result summary, files touched, and token snapshots
- Indexed on `session_id` for fast resume queries

## Usage
Migrations are applied automatically during schema initialization. Manual application:
```bash
$env:PGPASSWORD="opencode_memory"; & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U opencode_memory -d opencode_memory -f migrations/<migration>.sql
```
