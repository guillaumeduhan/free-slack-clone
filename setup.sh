#!/usr/bin/env bash
# =====================================================================
# Team Chat · one-shot install & run
#
#   ./setup.sh local    Supabase in Docker on your machine (default)
#   ./setup.sh remote   Your hosted Supabase project
#
# Env (prompted if missing):
#   OWNER_EMAIL            first admin, becomes owner on first sign-in
#   APP_DIR                where the Next.js app goes (default: teamchat-app)
#   SUPABASE_PROJECT_REF   remote only (Dashboard → Project Settings → General)
#   SUPABASE_DB_PASSWORD   remote only
#   NO_DEV=1               set up everything but don't start the dev server
# =====================================================================
set -euo pipefail

MODE="${1:-local}"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-teamchat-app}"
SUPA="npx --yes supabase@latest"

step() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required. $2"; }

[[ "$MODE" == "local" || "$MODE" == "remote" ]] || die "Usage: ./setup.sh [local|remote]"

# ---------------------------------------------------------------------
step "0/6  Checking tools"
need node "Install Node.js 20+ from https://nodejs.org"
need npm  "It ships with Node.js."
need psql "macOS: brew install libpq && brew link --force libpq · Debian/Ubuntu: sudo apt install postgresql-client"
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || die "Node.js 20+ required (found $(node -v))."
if [[ "$MODE" == "local" ]]; then
  need docker "Install Docker Desktop (or OrbStack / Colima) and start it."
  docker info >/dev/null 2>&1 || die "Docker is installed but not running."
fi
info "node $(node -v) · psql $(psql --version | awk '{print $3}')"

if [[ -z "${OWNER_EMAIL:-}" ]]; then read -rp "  Owner email (you): " OWNER_EMAIL; fi
[[ "$OWNER_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Invalid email: $OWNER_EMAIL"
OWNER_EMAIL="$(printf '%s' "$OWNER_EMAIL" | tr '[:upper:]' '[:lower:]')"

# ---------------------------------------------------------------------
step "1/6  Next.js app → $APP_DIR"
if [[ ! -f "$APP_DIR/package.json" ]]; then
  npx --yes create-next-app@latest "$APP_DIR" \
    --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack --yes
else
  info "Existing app found, updating files only."
fi
cd "$APP_DIR"

mkdir -p app lib supabase
cp -R "$HERE/app/." app/
cp -R "$HERE/lib/." lib/
cp -R "$HERE/supabase/." supabase/
cp "$HERE/middleware.ts" middleware.ts
cp "$HERE/.env.example" .env.example
cp "$HERE/README.md" TEAMCHAT.md
npm install --silent @supabase/supabase-js @supabase/ssr zod

# ---------------------------------------------------------------------
step "2/6  shadcn/ui"
[[ -f components.json ]] || npx --yes shadcn@latest init -d -y
npx --yes shadcn@latest add -y -o \
  button input label textarea card dialog dropdown-menu popover tooltip avatar badge \
  separator scroll-area tabs switch select command input-otp sonner >/dev/null
info "Components in components/ui/"

# ---------------------------------------------------------------------
step "3/6  Supabase ($MODE)"
if [[ "$MODE" == "local" ]]; then
  $SUPA start
  info "Applying migrations…"
  $SUPA db reset --no-seed
  eval "$($SUPA status -o env 2>/dev/null | sed 's/^/export SB_/')"
  API_URL="$SB_API_URL"; ANON_KEY="$SB_ANON_KEY"; SERVICE_KEY="$SB_SERVICE_ROLE_KEY"; DB_URL="$SB_DB_URL"
  SITE_URL="http://localhost:3000"
else
  [[ -n "${SUPABASE_PROJECT_REF:-}" ]] || read -rp "  Project ref: " SUPABASE_PROJECT_REF
  [[ -n "${SUPABASE_DB_PASSWORD:-}" ]] || { read -rsp "  Database password: " SUPABASE_DB_PASSWORD; echo; }
  export SUPABASE_DB_PASSWORD
  $SUPA projects list >/dev/null 2>&1 || $SUPA login
  $SUPA link --project-ref "$SUPABASE_PROJECT_REF" -p "$SUPABASE_DB_PASSWORD"
  info "Applying migrations…"
  $SUPA db push --include-all
  info "Pushing API + auth config (exposed schema, OTP email, invite-only hook)…"
  $SUPA config push --project-ref "$SUPABASE_PROJECT_REF" || \
    info "config push failed: in the dashboard, expose schema 'teamchat' and enable the Before User Created hook."
  KEYS="$($SUPA projects api-keys --project-ref "$SUPABASE_PROJECT_REF" -o json)"
  ANON_KEY="$(node -e 'const k=JSON.parse(process.argv[1]);console.log(k.find(x=>x.name==="anon").api_key)' "$KEYS")"
  SERVICE_KEY="$(node -e 'const k=JSON.parse(process.argv[1]);console.log(k.find(x=>x.name==="service_role").api_key)' "$KEYS")"
  API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
  DB_URL="postgresql://postgres:$SUPABASE_DB_PASSWORD@db.$SUPABASE_PROJECT_REF.supabase.co:5432/postgres"
  SITE_URL="${SITE_URL:-http://localhost:3000}"
fi

# ---------------------------------------------------------------------
step "4/6  Bootstrap workspace + invite $OWNER_EMAIL"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -v owner_email="$OWNER_EMAIL" -f supabase/bootstrap.sql
info "Northwind created. $OWNER_EMAIL is invited and becomes owner on first sign-in."

# ---------------------------------------------------------------------
step "5/6  .env.local"
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NEXT_PUBLIC_SITE_URL=$SITE_URL
EOF
chmod 600 .env.local
grep -qxF '.env.local' .gitignore 2>/dev/null || echo '.env.local' >> .gitignore
info "Written (service role key is server-only, never commit it)."

$SUPA gen types typescript $( [[ "$MODE" == "local" ]] && echo --local || echo --project-id "$SUPABASE_PROJECT_REF" ) \
  --schema teamchat > lib/database.types.ts 2>/dev/null && info "Types → lib/database.types.ts" || true

# ---------------------------------------------------------------------
step "6/6  Ready"
cat <<EOF

  App          $SITE_URL/login
  Sign in as   $OWNER_EMAIL
EOF
if [[ "$MODE" == "local" ]]; then cat <<EOF
  Emails       http://127.0.0.1:54324   (sign-in codes land here)
  Studio       http://127.0.0.1:54323
  Stop DB      npx supabase stop
EOF
fi
cat <<EOF
  API docs     TEAMCHAT.md
  Bot test     curl -X POST $SITE_URL/api/bot/chat.postMessage \\
                 -H "Authorization: Bearer xoxb-…" -H "Content-Type: application/json" \\
                 -d '{"channel":"#general","text":"Hello from a bot"}'

EOF

if [[ -z "${NO_DEV:-}" ]]; then
  step "Starting Next.js (Ctrl+C to stop)"
  exec npm run dev
fi
