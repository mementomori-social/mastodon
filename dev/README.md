# mementomori.test in Docker

This runs your checkout of the fork at https://mementomori.test on macOS or Linux, with three years of generated demo data. It builds on the dev containers upstream Mastodon already ships in `.devcontainer/`. Everything Mementomori adds lives in files upstream doesn't have, so merging a new Mastodon release never conflicts with it.

- [Where the code lives](#where-the-code-lives)
- [How the stack fits together](#how-the-stack-fits-together)
- [Setup](#setup)
- [Daily use](#daily-use)
- [Demo data](#demo-data)
- [Production mode](#production-mode)
- [Running next to another local setup](#running-next-to-another-local-setup)
- [Differences from production](#differences-from-production)
- [Files](#files)
- [Troubleshooting](#troubleshooting)

## Where the code lives

```mermaid
flowchart LR
  upstream["mastodon/mastodon<br/>(upstream)"] -- merged into --> fork["mementomori-social/mastodon<br/>branches mementomods-YYYY-MM-DD"]
  fork -- "git clone" --> checkout["your checkout"]
  checkout -- "bin/mementomori-dev up" --> stack["this Docker stack<br/>https://mementomori.test"]
  fork -- "CI on every push to mementomods-*" --> images["ghcr.io/mementomori-social/mastodon<br/>ghcr.io/mementomori-social/mastodon-streaming"]
  fork -- "checkout on the server" --> prod["mementomori.social"]
```

- **mementomori-social/mastodon** is the only repository involved. The dev stack is three files and one rake task inside it, not a separate repo.
- **Branches**: production runs the newest `mementomods-YYYY-MM-DD` branch. Work on a branch made from it.
- **Container images**: CI publishes `latest` images for amd64 and arm64 on every push to a `mementomods-*` branch. They are production builds with compiled assets. This stack doesn't use them, because it runs your source code so edits show up immediately.

## How the stack fits together

```mermaid
flowchart TB
  browser["Browser"] -- "https://mementomori.test<br/>(127.0.0.1:443)" --> caddy

  subgraph docker["docker compose project: mementomori-dev"]
    caddy["caddy<br/>TLS with the mkcert certificate"]

    subgraph app["app container (Ruby 4.0, Node, ffmpeg, libvips)"]
      web["puma :3000<br/>Rails"]
      stream["streaming :4000<br/>Node"]
      sidekiq["sidekiq<br/>background jobs"]
      vite["vite :3036<br/>frontend dev server"]
    end

    db[("db<br/>PostgreSQL 18")]
    redis[("redis 7")]
    es[("es<br/>Elasticsearch, optional")]
    lt["libretranslate<br/>optional"]
  end

  caddy -- "/api/v1/streaming*" --> stream
  caddy -- "everything else" --> web
  web -- "/packs-dev/*" --> vite
  web & sidekiq & stream --> db
  web & sidekiq & stream --> redis
  web & sidekiq -.-> es
  web -.-> lt
  checkout["your checkout"] == "mounted at /workspaces/mastodon" ==> app
```

| Path | Goes to | Notes |
| --- | --- | --- |
| `/api/v1/streaming*` | streaming, port 4000 | WebSocket timelines and notifications |
| `/packs-dev/*` | puma, which hands it to vite | JavaScript and CSS, compiled on request |
| everything else | puma, port 3000 | Rails |

Vite's hot-reload socket connects straight to `ws://mementomori.test:3036` (hard-coded in upstream's `vite.config.mts`), not through Caddy. Browsers refuse an unencrypted socket from an HTTPS page, so hot reload doesn't work here: after editing frontend code, reload the page yourself. Ruby changes need no restart; Rails reloads them on the next request.

**What persists**: the database, Redis, installed gems (`vendor/bundle`) and Caddy's state live in named Docker volumes of the `mementomori-dev` project. Node packages (`node_modules`) and uploaded media (`public/system`) live in your checkout, because the checkout is mounted into the container. `down` keeps all of it.

### What `up` does

```mermaid
sequenceDiagram
  actor You
  participant Script as bin/mementomori-dev
  participant Compose as docker compose
  participant App as app container
  participant Caddy as caddy

  You->>Script: up
  Script->>Script: check docker, mkcert and the /etc/hosts entry
  Script->>Script: mkcert creates dev/certs/ (first time only)
  Script->>Compose: up -d --build
  Compose->>App: build the image from .devcontainer/Dockerfile (first time only)
  Compose->>Caddy: start
  App->>App: dev/start.sh: corepack, bundle install, yarn install
  App->>App: bin/rails db:prepare (creates the database and loads db/seeds)
  App->>App: bin/dev starts puma, sidekiq, streaming and vite
  loop every 5 s, up to 20 min
    Script->>Caddy: GET /health
  end
  Caddy-->>Script: 200
  Script-->>You: Up: https://mementomori.test
```

The first start downloads images, builds the app image and installs every gem and Node package. Later starts reuse all of that and take about two minutes.

## Setup

The quickest way is one command, on macOS, Arch, Debian or Ubuntu:

```sh
git clone https://github.com/mementomori-social/ansibles.git && ansibles/dev.sh
```

It does everything below, clones this fork to `~/Projects/mastodon`, starts the stack and seeds it. It asks for your password once, and on macOS Docker Desktop's licence and the keychain need a click. See "Development environment" in the [ansibles README](https://github.com/mementomori-social/ansibles#development-environment).

By hand, you need Docker, mkcert and one line in `/etc/hosts`. Then clone the fork and switch to the branch you work on.

### macOS

1. Install Docker Desktop or OrbStack and start it.
2. `brew install mkcert` and `mkcert -install`. For Firefox also run `brew install nss` before `mkcert -install`.
3. `echo '127.0.0.1 mementomori.test' | sudo tee -a /etc/hosts`

On Apple Silicon the app image builds natively for arm64.

On Linux the app container runs as uid 1000 and writes into your checkout, so your own user should be uid 1000 too, which is the default for the first user on Arch, Debian, Ubuntu and Fedora.

### Arch Linux

1. `sudo pacman -S docker docker-compose mkcert nss`, `sudo systemctl enable --now docker`, and add yourself to the `docker` group (`sudo usermod -aG docker $USER`, then log in again).
2. `mkcert -install`
3. `echo '127.0.0.1 mementomori.test' | sudo tee -a /etc/hosts`

### Debian and Ubuntu

1. Install Docker Engine with the compose plugin from Docker's own apt repository (docs.docker.com/engine/install), and add yourself to the `docker` group.
2. `sudo apt install mkcert libnss3-tools` and `mkcert -install`
3. `echo '127.0.0.1 mementomori.test' | sudo tee -a /etc/hosts`

### Every machine

```sh
git clone git@github.com:mementomori-social/mastodon.git
cd mastodon
git switch <the branch you work on>
bin/mementomori-dev up
bin/mementomori-dev seed
```

`up` stops with a message telling you what to fix if Docker, mkcert or the hosts entry is missing.

## Daily use

| Command | Does |
| --- | --- |
| `bin/mementomori-dev up` | Start everything and wait until the site answers |
| `bin/mementomori-dev up live` | Run CI's production image of this branch instead of your checkout, see [Production mode](#production-mode). Plain `up` goes back |
| `bin/mementomori-dev up search` | The same plus Elasticsearch, with search turned on in the app |
| `bin/mementomori-dev up translate` | The same plus LibreTranslate for the Translate button. Combine both with `up search translate` |
| `bin/mementomori-dev seed [small\|default\|large]` | Fill an empty database with demo data, `default` if no scale is given |
| `bin/mementomori-dev reset [scale]` | Wipe this stack's database, uploads and Redis, then seed again. Asks first |
| `bin/mementomori-dev shell` | Bash inside the app container, or the web container in production mode |
| `bin/mementomori-dev check` | Check the running, seeded stack over HTTPS: certificate, streaming, demo's home, notifications, trending tags, posts and news, who to follow, moderator's reports. CI runs it too |
| `bin/mementomori-dev logs [service]` | Follow logs, for example `logs app` or `logs caddy` |
| `bin/mementomori-dev down` | Stop everything. Data stays |
| `bin/mementomori-dev compose <args>` | Any `docker compose` command for this stack, for example `compose ps` |

### Logins

Every generated account has the password `mementomori`.

| Email | Role | Use it for |
| --- | --- | --- |
| `demo@mementomori.test` | User | Home feed, notifications, lists, filters, bookmarks, followed hashtags |
| `admin@mementomori.test` | Owner | Admin settings, Sidekiq, everything |
| `moderator@mementomori.test` | Moderator | The moderation queue, with three open reports |

The other local accounts work too. Their email is `<username>@mementomori.test`, and Mastodon builds their home feed the first time you log in as one.

### Useful pages

| URL | What |
| --- | --- |
| https://mementomori.test/letter_opener | Every email the app has sent: sign-ups, password resets, notifications |
| https://mementomori.test/sidekiq | Background job queues, as admin |
| https://mementomori.test/admin/reports | Moderation queue |

### Rails console, tootctl and tests

```sh
bin/mementomori-dev shell
bin/rails console
bin/tootctl accounts modify demo --role Moderator

# Tests: name the test environment (the container defaults to development) and
# turn Elasticsearch off as upstream CI does, also after `up search`
ES_ENABLED=false RAILS_ENV=test bin/rails db:prepare     # once, creates the test database
ES_ENABLED=false RAILS_ENV=test bin/rspec spec/models/tag_spec.rb
```

### Search

```sh
bin/mementomori-dev up search
bin/mementomori-dev compose exec app bin/tootctl search deploy
```

Give Elasticsearch half a minute after `up` before `deploy`, which builds the indexes from what is in the database. Run it again after `reset`. Elasticsearch runs with its security turned off (`dev/compose.yaml`), because the 8.x image otherwise demands HTTPS and a password that Mastodon's dev config doesn't send.

## Demo data

`bin/mementomori-dev seed` runs `lib/tasks/mementomori_seed.rake`. It only runs in development and refuses to touch a database that already has the `demo` account.

Nothing in it is real. Names and texts come from Faker and fixed phrase lists, remote accounts live on `*.example` domains that never resolve, and images are generated colour gradients. That makes it safe to share, screenshot and commit.

### Same data on every machine

The generator draws every random choice from one fixed seed (`MementomoriSeed::SEED`). Two runs at the same scale give the same accounts, posts, likes and follows, so a bug one person sees reproduces for the next. The history ends at midnight UTC on the day you seed, so it moves with the calendar but never changes with the hour. The only posts from today are the trending burst, timed between midnight and the moment you run `seed`.

### Scales

| Scale | Local + remote accounts | Posts | Images | Time on a desktop |
| --- | --- | --- | --- | --- |
| `small` | 30 + 10 | 4 000 | 60 | about 2 minutes |
| `default` | 150 + 50 | 40 000 | 400 | about 5 minutes |
| `large` | 400 + 150 | 200 000 | 1 000 | not measured |

`small` is enough for most UI work. Use `default` when you need long timelines, busy notifications or realistic counts.

### What gets generated

```mermaid
flowchart TD
  subgraph tx["One database transaction: all of it or nothing"]
    a["Accounts<br/>admin, moderator, demo, local users, remote users"] --> f["Follows and follow requests<br/>a few popular accounts, a long tail"]
    f --> s["Posts over three years<br/>replies, boosts, mentions, hashtags, quotes,<br/>content warnings, all four visibilities,<br/>a burst of posts today for trends"]
    s --> e["Likes and bookmarks"]
    e --> p["Polls, edits and pinned posts"]
    p --> n["Notifications for likes, boosts,<br/>mentions, follows and quotes"]
    n --> d["The demo user's lists, filter,<br/>followed hashtags, mute, block and reports"]
    d --> c["Post and account counters"]
  end
  c --> m["Avatars, headers and post images"]
  m --> t["Trending hashtags"]
  t --> h["Home feeds for admin, moderator and demo"]
```

Posts are written in bulk with ids in Mastodon's own time-ordered format, so timelines, pagination and "x days ago" behave as they would with real history. Activity grows over the three years and follows a daily rhythm, with most posts in the morning, at lunch and in the evening.

### Limits

- The home feed holds the newest 800 posts, the same cap as production. Older posts are on profiles, hashtags and the public timelines.
- Trending hashtags count people per day (UTC), so they fade the next day. `reset` brings them back.
- Link previews exist only for the trending news articles, on `*.example` addresses that don't resolve. Other links in posts have none.
- Trending posts fade within about half a day and trending news within a day or two. `reset` brings them back.
- Remote accounts can't be followed back or fetched: their servers don't exist.

## Production mode

`bin/mementomori-dev up live` swaps the app container for the production image CI builds on every push to a `mementomods-*` branch (`ghcr.io/mementomori-social/mastodon` and `mastodon-streaming`): `RAILS_ENV=production`, precompiled assets, separate web, streaming and Sidekiq containers, as on the server. Use it to check something as it behaves live, for example asset loading, caching or a production-only code path.

It runs on the same database, Redis and media as dev mode, so seed in dev mode first:

```sh
bin/mementomori-dev up
bin/mementomori-dev seed small
bin/mementomori-dev up live
```

`bin/mementomori-dev up` goes back to dev mode. Both modes keep the same data.

- The image is tagged with your branch name when you are on a `mementomods-*` branch, otherwise `latest`, the newest build. Set `LIVE_TAG` to pick another. It is not your checkout: local edits don't show until they are pushed and built.
- Secrets that production mode needs (`SECRET_KEY_BASE`, VAPID keys) are generated on first use into `dev/live.env`, not committed. The Active Record encryption keys are the dev ones from `.env.development`, so both modes read the same data.
- `seed`, `reset` and `/letter_opener` only work in dev mode. Production mode writes mail to `tmp/mails` inside the web container instead of sending it.
- Production builds load the analytics script for mementomori.social. Caddy removes its host from the Content Security Policy, so the browser never runs it here, and the layout only loads it when `LOCAL_DOMAIN` is mementomori.social.

## Running next to another local setup

If something on your machine already listens on 127.0.0.1:443, such as a hand-built mementomori.test behind nginx, give this stack another port and use it on every command:

```sh
HTTPS_PORT=8443 bin/mementomori-dev up
HTTPS_PORT=8443 bin/mementomori-dev seed
```

The site is then at https://mementomori.test:8443. To skip `HTTPS_PORT` on every command, write the port to `dev/https-port` (`echo 8443 > dev/https-port`); `bin/mementomori-dev` reads it when `HTTPS_PORT` is not set, and the Ansible setup writes it for you.

To keep the plain https://mementomori.test address, let the other web server forward that name to this stack and tell the stack its public port with `echo 443 > dev/public-port` (or `PUBLIC_PORT=443`). The Ansible setup does both when the server on 443 is nginx: it adds a `mementomori.test` site to nginx that forwards to 8443, and moves any older `mementomori.test` site aside. The two setups share nothing: this one has its own containers, database and volumes, and stopping or resetting it leaves the other alone.

## Differences from production

| | Dev mode | Production mode (`up live`) | Production |
| --- | --- | --- | --- |
| Code | your checkout | CI's image of the branch | the branch, built on the server |
| Rails environment | development | production | production |
| PostgreSQL | 18 | 18 | 18 |
| Frontend | vite dev server, compiled on request | precompiled assets | precompiled assets |
| Processes | one container, `bin/dev` | web, streaming and Sidekiq containers | systemd services |
| Media | `public/system` in your checkout | same | object storage |
| Email | caught at `/letter_opener` | written to `tmp/mails` | sent |
| Federation | none, remote accounts are fake | none | live |
| Analytics script | not loaded | blocked | loaded |

## Files

| File | What |
| --- | --- |
| `bin/mementomori-dev` | The command you run |
| `dev/compose.yaml` | Layered over `.devcontainer/compose.yaml`: domain, HTTPS, start command, PostgreSQL 18, Caddy, Vite host check, optional services behind profiles |
| `dev/start.sh` | Runs inside the app container: installs gems and packages, prepares the database, starts `bin/dev` |
| `dev/Caddyfile` | TLS and routing |
| `dev/certs/` | Your mkcert certificate, created by `up`, not committed |
| `dev/https-port` | Optional HTTPS port when 443 is taken, not committed |
| `dev/public-port` | Optional port in the site's address when another server forwards to this stack, not committed |
| `dev/check.sh` | The checks behind `bin/mementomori-dev check` |
| `.github/workflows/dev-stack.yml` | CI: builds the stack on a clean Ubuntu machine, seeds it and runs `check` |
| `dev/live.yaml` | Production mode services, layered last |
| `dev/live.env` | Production mode secrets, created by `up live`, not committed |
| `dev/mode` | `dev` or `live`, written by `up`, not committed |
| `lib/tasks/mementomori_seed.rake` | The demo data generator |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `up` fails to bind port 443 ("already allocated" or "address already in use") | Something else uses 443. Use `HTTPS_PORT=8443`, see above |
| Browser warns about the certificate | Run `mkcert -install` and restart the browser. Firefox on Linux and macOS also needs `nss` / `libnss3-tools` installed first |
| `mementomori.test` doesn't resolve | The `/etc/hosts` line is missing |
| `up` waits a long time | The first start installs everything. Watch it with `bin/mementomori-dev logs app` |
| `seed` says "Already seeded" | Use `reset`, which wipes and seeds in one go |
| Demo data gone after updating this branch | The database moved from PostgreSQL 14 to 18 on a new volume. Run `seed` again. The old data stays in the `postgres-data` volume until you remove it with `docker volume rm mementomori-dev_postgres-data` |
| `seed` or `reset` says "This needs dev mode" | You are in production mode. `bin/mementomori-dev up` first |
| "Oh, no! The requested page could not be rendered" on a page's first visit | Vite was bundling new dependencies and couldn't tell the page to reload (see hot reload above). Reload once; it stays fixed until `node_modules` changes |
| Page loads without styles or scripts | Check `logs app` for vite errors |
| Search finds nothing | Start with `up search` and run `bin/tootctl search deploy` |
| `search deploy` fails with `KeepAliveDisconnected` | Elasticsearch is still starting. Wait and run it again |
| You want to start completely from scratch | `bin/mementomori-dev compose down -v` removes every volume of this stack, including installed gems |
