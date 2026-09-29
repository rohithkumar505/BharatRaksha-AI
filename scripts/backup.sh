#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

echo "Backing up PostgreSQL..."
docker exec bharat-raksha-postgres pg_dump -U bharatraksha bharatraksha \
  | gzip > "$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

echo "Backing up Neo4j..."
docker exec bharat-raksha-neo4j neo4j-admin database dump neo4j \
  --to-path=/tmp/neo4j_dump 2>/dev/null || true
docker cp bharat-raksha-neo4j:/tmp/neo4j_dump "$BACKUP_DIR/neo4j_${TIMESTAMP}" 2>/dev/null || \
  echo "Neo4j dump skipped (community edition may require manual backup)"

echo "Backup complete: $BACKUP_DIR"
