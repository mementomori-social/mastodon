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
exec bin/dev
