#!/bin/bash
# Run database migrations script

echo "Running SQL migrations..."
node -r tsx/register migrations/run-migrations.js