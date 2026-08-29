# AWS starter for the AI Customer Support Platform (see docs/adr/0011-deployment.md).
# This is a reviewed starting point, not a fully applied production stack.

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Configure remote state before applying:
  # backend "s3" { bucket = "..."; key = "acs/terraform.tfstate"; region = "..."; dynamodb_table = "..." }
}

provider "aws" {
  region = var.region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name               = "${var.project}-${var.environment}"
  cidr               = "10.40.0.0/16"
  azs                = ["${var.region}a", "${var.region}b"]
  private_subnets    = ["10.40.1.0/24", "10.40.2.0/24"]
  public_subnets     = ["10.40.101.0/24", "10.40.102.0/24"]
  database_subnets   = ["10.40.201.0/24", "10.40.202.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = var.environment != "production"
}

resource "aws_db_instance" "postgres" {
  identifier                 = "${var.project}-${var.environment}"
  engine                     = "postgres"
  engine_version             = "17"
  instance_class             = var.db_instance_class
  allocated_storage          = 50
  max_allocated_storage      = 500
  db_name                    = "acs"
  username                   = "acs"
  manage_master_user_password = true
  multi_az                   = var.environment == "production"
  storage_encrypted          = true
  backup_retention_period    = 14
  deletion_protection        = var.environment == "production"
  db_subnet_group_name       = module.vpc.database_subnet_group_name
  vpc_security_group_ids     = [aws_security_group.db.id]
  performance_insights_enabled = true
  # pgvector: available by default in RDS PostgreSQL 17; enable with CREATE EXTENSION in migrations.
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project}-${var.environment}"
  description          = "ACS Redis (BullMQ, cache, rate limits)"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.environment == "production" ? 2 : 1
  automatic_failover_enabled = var.environment == "production"
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_s3_bucket" "knowledge" {
  bucket = "${var.project}-${var.environment}-knowledge"
}

resource "aws_s3_bucket_public_access_block" "knowledge" {
  bucket                  = aws_s3_bucket.knowledge.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "worker", "web"])
  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Security groups
resource "aws_security_group" "db" {
  name_prefix = "${var.project}-db-"
  vpc_id      = module.vpc.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.project}-redis-"
  vpc_id      = module.vpc.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }
}

resource "aws_security_group" "service" {
  name_prefix = "${var.project}-svc-"
  vpc_id      = module.vpc.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ECS services, ALB (idle timeout >= 120s for SSE), task definitions, autoscaling
# (worker scales on queue depth via CloudWatch), and CloudFront for widget assets
# are the tracked next step — see docs/KNOWN_LIMITATIONS.md.
