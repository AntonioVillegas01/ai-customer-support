# Runbook: PostgreSQL outage / degradation

## Symptoms
- `/health/ready` failing on api/worker; connection errors in logs; 503s.

## Impact
Full write-path outage (Postgres is the source of truth — by design nothing else accepts durable writes).

## Diagnosis
1. `docker compose ps postgres` / RDS console health.
2. Connection saturation: check pool metrics vs `DB_POOL_SIZE`; look for `too many connections`.
3. Disk / IOPS exhaustion on RDS.

## Mitigation
- Connection storm: restart api/worker to reset pools; lower pool size.
- Failover: promote RDS standby (Multi-AZ) — clients reconnect automatically.
- Do NOT scale workers during DB degradation; reduce concurrency instead.

## Recovery
1. Readiness endpoints go green; queues drain automatically (jobs retried).
2. Outbox drainer republishes any events committed before the outage.
3. Verify no duplicate messages (idempotency keys guarantee this) and check DLQ for exhausted jobs.

## Backup / restore
- RDS automated snapshots daily + PITR. Restore: create instance from snapshot, run migrations check, repoint `DATABASE_URL`, restart services.
- Local: `docker compose exec postgres pg_dump -U acs acs > backup.sql`.
