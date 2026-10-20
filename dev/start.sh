#!/usr/bin/env bash
# Container entrypoint: upstream's bin/setup without the global npm install,
# which needs root, then the dev processes.
set -euo pipefail

mkdir -p ~/.local/bin
export PATH=~/.local/bin:$PATH
# Node 25 and newer ship without corepack
command -v corepack >/dev/null || npm install --global --prefix ~/.local corepack
corepack enable --install-directory ~/.local/bin

bundle check || bundle install
bin/yarn install --immutable
bin/rails db:prepare

# Upstream's processes, with Vite on dev/vite.config.mts
if ! grep -qx 'vite: yarn dev' Procfile.dev; then
  echo "Procfile.dev has no 'vite: yarn dev' line, starting it unchanged" >&2
  exec bin/dev
fi
mkdir -p tmp
sed 's#^vite: yarn dev$#vite: yarn vite dev --config dev/vite.config.mts#' Procfile.dev > tmp/Procfile.mementomori-dev
gem list --no-installed --exact --silent foreman && gem install foreman
export PORT=3000 RAILS_ENV=development
exec foreman start -f tmp/Procfile.mementomori-dev -d .
