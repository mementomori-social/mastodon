#!/usr/bin/env bash
# Checks a seeded stack over HTTPS with certificate verification, as a browser
# would see it. Run through bin/mementomori-dev check. See dev/README.md.
# Usage: dev/check.sh <site url> <dev|live>
set -uo pipefail

URL=$1
MODE=$2
DOMAIN=mementomori.test
HOST=${URL#https://}
failures=0

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1: $2"; failures=$((failures + 1)); }

get() {
  local auth=()
  [ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")
  curl -fsS --max-time 60 "${auth[@]+"${auth[@]}"}" "$URL$1"
}

expect() {
  local name=$1 path=$2 pattern=$3 body
  if ! body=$(get "$path" 2>&1); then
    fail "$name" "$body"
  elif grep -qE "$pattern" <<< "$body"; then
    pass "$name"
  else
    fail "$name" "no match for $pattern in ${body:0:200}"
  fi
}

TOKEN=
expect 'Site answers with a trusted certificate' /health '^OK$'
expect 'Streaming answers' /api/v1/streaming/health '^OK$'
expect "Instance is $DOMAIN" /api/v2/instance "\"domain\":\"$DOMAIN\""
expect 'Sign-in page loads' /auth/sign_in 'user\[email\]'

# Read tokens made inside the app, so the checks below need no browser login
tokens=$(bin/mementomori-dev compose exec -T "$([ "$MODE" = live ] && echo web || echo app)" bin/rails runner '
  app = Doorkeeper::Application.find_or_create_by!(name: "mementomori-dev check") do |a|
    a.redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
    a.scopes = "read admin:read"
  end
  %w(demo moderator).each do |name|
    user = User.find_by!(email: "#{name}@'"$DOMAIN"'")
    token = Doorkeeper::AccessToken.create!(application: app, resource_owner_id: user.id, scopes: "read admin:read", expires_in: 3600)
    puts "CHECK_TOKEN #{name} #{token.token}"
  end
' 2>/dev/null)
demo_token=$(sed -n 's/^CHECK_TOKEN demo //p' <<< "$tokens")
moderator_token=$(sed -n 's/^CHECK_TOKEN moderator //p' <<< "$tokens")

if [ -z "$demo_token" ]; then
  fail 'Demo accounts exist' 'no token, is the stack seeded? Run bin/mementomori-dev seed small'
else
  TOKEN=$demo_token
  expect 'demo: home timeline has posts' '/api/v1/timelines/home?limit=20' '"uri":"https://'"$HOST"'/'
  expect 'demo: notifications have likes' '/api/v2/notifications?limit=40' '"type":"favourite"'
  expect 'demo: notifications have mentions' '/api/v2/notifications?limit=40' '"type":"mention"'
  expect 'demo: likes are grouped' '/api/v2/notifications?limit=40' '"notifications_count":([2-9]|[1-9][0-9])'
  for tag in fediverse caturday sauna; do
    expect "demo: #$tag trends" /api/v1/trends/tags "\"name\":\"$tag\""
  done
  expect 'demo: posts trend' /api/v1/trends/statuses '"uri":"https://'
  expect 'demo: news trends' /api/v1/trends/links '"type":"link"'
  expect 'demo: who to follow has people' /api/v2/suggestions '"account":'

  TOKEN=$moderator_token
  reports=$(get /api/v1/admin/reports 2>/dev/null | grep -o '"action_taken":false' | wc -l | tr -d ' ' || true)
  if [ "$reports" = 3 ]; then pass 'moderator: 3 open reports'; else fail 'moderator: 3 open reports' "found ${reports:-none}"; fi
  TOKEN=
fi

if [ "$MODE" = dev ]; then
  expect 'Letter opener loads' /letter_opener 'LetterOpenerWeb'
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo 'All checks passed'
