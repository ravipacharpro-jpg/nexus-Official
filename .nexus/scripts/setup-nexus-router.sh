#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# NEXUS Router helper: installs itzgeniusboy/nexus-router as a local multi-key
# failover gateway and wires it into Nexus as an OpenAI-compatible provider
# (nexus-router, behind the on-device bridge on port 4898).

ROUTER_REPO="${NEXUS_ROUTER_REPO:-https://github.com/itzgeniusboy/nexus-router.git}"
ROUTER_DIR="${NEXUS_ROUTER_DIR:-$HOME/.nexus/router}"
BRIDGE_SRC="$HOME/.nexus/source/.nexus/scripts/nexus-router-bridge.ts"
BRIDGE_BIN="$HOME/.nexus/bin/nexus-router-bridge.ts"
BRIDGE_PORT="${NEXUS_ROUTER_BRIDGE_PORT:-4898}"
CONFIG="$HOME/.config/nexus/nexus.jsonc"
AUTH="$HOME/.local/share/nexus/auth.json"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

say() { printf '\n[NEXUS-ROUTER] %s\n' "$*"; }
die() { printf '\n[NEXUS-ROUTER] ERROR: %s\n' "$*" >&2; exit 1; }

if ! command -v bun >/dev/null 2>&1; then die "bun is required (install with: curl -fsSL https://bun.sh/install | bash)."; fi

mkdir -p "$HOME/.nexus/bin" "$HOME/.config/nexus" "$HOME/.local/share/nexus"

if [ ! -x "$BRIDGE_BIN" ]; then
  cp "$BRIDGE_SRC" "$BRIDGE_BIN"
  chmod 755 "$BRIDGE_BIN"
fi

if [ ! -d "$ROUTER_DIR/.git" ]; then
  say "Cloning nexus-router into $ROUTER_DIR"
  git clone --depth 1 "$ROUTER_REPO" "$ROUTER_DIR"
fi

cd "$ROUTER_DIR"
if [ ! -d node_modules ]; then
  if command -v npm >/dev/null 2>&1; then
    say "Installing router dependencies (npm — full UI + server; can take a few minutes)"
    npm install --no-audit --no-fund --legacy-peer-deps || bun install
  else
    say "Installing router dependencies (bun)"
    bun install
  fi
fi

if [ ! -s dist/server.cjs ]; then
  say "Bundling the router server"
  ./node_modules/.bin/esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs || true
fi

if [ ! -f .env ]; then
  ENCRYPTION_KEY="$(bun -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')"
  SESSION_SECRET="$(bun -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')"
  printf 'ENCRYPTION_KEY=%s\nSESSION_SECRET=%s\nPORT=3000\nNODE_ENV=production\n' "$ENCRYPTION_KEY" "$SESSION_SECRET" > .env
  say "Wrote encryption/session secrets to $ROUTER_DIR/.env (keep them safe)"
fi

bun -e '
const { readFileSync, writeFileSync } = require("fs")
const cfgPath = process.argv[1]
const port = process.argv[2]
let cfg = {}
try { cfg = JSON.parse(readFileSync(cfgPath, "utf8")) } catch {}
if (!cfg.provider) cfg.provider = {}
if (!cfg.provider["nexus-router"]) {
  cfg.provider["nexus-router"] = {
    name: "Nexus Router (local gateway)",
    api: "http://127.0.0.1:" + port + "/v1",
    models: {
      "gpt-4o": {}, "gpt-4o-mini": {}, "o4-mini": {},
      "claude-sonnet-4-5": {}, "claude-haiku-4-5": {},
      "gemini-2.5-flash": {}, "deepseek-chat": {}, "deepseek-reasoner": {},
      "grok-4.5": {}, "mistral-large-latest": {},
      "qwen/qwen2.5-coder-32b-instruct": {}, "meta-llama/llama-3.3-70b-instruct": {},
    },
  }
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n")
  console.log("added nexus-router provider to " + cfgPath)
} else {
  console.log("nexus-router provider already present")
}
' "$CONFIG" "$BRIDGE_PORT"

bun -e '
const { readFileSync, writeFileSync } = require("fs")
const auth = process.argv[1]
let j = {}
try { j = JSON.parse(readFileSync(auth, "utf8")) } catch {}
if (!j["nexus-router"]) {
  j["nexus-router"] = { type: "api", key: "router-gateway-token" }
  writeFileSync(auth, JSON.stringify(j, null, 2) + "\n")
  console.log("added nexus-router auth placeholder")
}
' "$AUTH"

if ! curl -sf --max-time 2 "http://127.0.0.1:$BRIDGE_PORT/v1/models" >/dev/null 2>&1; then
  say "Starting the nexus-router bridge on 127.0.0.1:$BRIDGE_PORT"
  if command -v setsid >/dev/null 2>&1; then
    setsid -f bun "$BRIDGE_BIN" >/dev/null 2>>"${TMPDIR:-$PREFIX/tmp}/nexus-router-bridge.log" &
  else
    nohup bun "$BRIDGE_BIN" >/dev/null 2>>"${TMPDIR:-$PREFIX/tmp}/nexus-router-bridge.log" &
  fi
  sleep 2
fi

if curl -sf --max-time 2 "http://127.0.0.1:$BRIDGE_PORT/v1/models" >/dev/null 2>&1; then
  say "Bridge is live. Router panel: http://127.0.0.1:3000 — add your provider keys there, then use agent models like nexus-router/gpt-4o-mini"
else
  say "Bridge did not answer yet — check ${TMPDIR:-$PREFIX/tmp}/nexus-router-bridge.log"
fi

say "Done. Restart any running nexus session, or run: nexus models list | grep nexus-router"