# ADR 0011: AWS ECS Fargate deployment architecture

## Status
Accepted

## Context
Three long-running deployables (web, api, worker) plus static widget assets; managed Postgres/Redis are required.

## Decision
- ECS Fargate services for web, api, worker behind an ALB (api exposes SSE — ALB idle timeout raised to 120s).
- RDS PostgreSQL (pgvector enabled), ElastiCache Redis, S3 for knowledge artifacts + widget static assets (CloudFront).
- Images built in GitHub Actions, pushed to ECR; deploys are ECS service updates with health-check gated rollouts and one-off migration tasks run before service update.
- Terraform starter in `infra/terraform` defines VPC, RDS, ElastiCache, ECR, ECS, ALB, S3/CloudFront skeleton.

## Consequences
Horizontal scaling per deployable; worker scales on queue depth. Full IaC completion is tracked work, not a claim.
