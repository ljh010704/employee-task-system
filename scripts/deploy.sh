#!/usr/bin/env sh
set -eu
git pull --ff-only origin main
docker compose build --no-cache taskhub-app
docker compose up -d --force-recreate taskhub-app
docker compose ps
