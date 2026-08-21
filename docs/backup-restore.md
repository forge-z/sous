# Backup and restore

The PostgreSQL volume contains the household inventory and movement history.

Create a backup:

    docker compose exec -T db pg_dump -U sous -d sous > sous-backup.sql

Restore into a running installation:

    cat sous-backup.sql | docker compose exec -T db psql -U sous -d sous

Keep backup files private and encrypted at rest. Do not commit them to Git.
