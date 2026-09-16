#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# NEXUS Termux installer for ravipacharpro-jpg/nexus-Official.
# Installs the source tree and runs the CLI with Bun, which avoids relying on
# Linux/glibc release binaries that do not run natively on Android/Termux.

REPO_URL="${NEXUS_REPO_URL:-https://github.com/ravipacharpro-jpg/nexus-Official.git}"
INSTALL_ROOT="${NEXUS_HOME:-$HOME/.nexus}"
SOURCE_DIR="$INSTALL_ROOT/source"
BIN_DIR="${NEXUS_BIN_DIR:-$HOME/bin}"
LAUNCH="${NEXUS_LAUNCH:-0}"

say() { printf '\n[NEXUS] %s\n' "$*"; }
die() { printf '\n[NEXUS] ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] && command -v pkg >/dev/null 2>&1 \
  || die "Run this installer inside the native Termux app."

if ! apt-get --version >/dev/null 2>&1; then
  arch="$(uname -m)"
  case "$arch" in
    aarch64|arm64) deb_arch="aarch64" ;;
    armv7l|arm) deb_arch="arm" ;;
    x86_64|amd64) deb_arch="x86_64" ;;
    i686|x86) deb_arch="i686" ;;
    *) deb_arch="$arch" ;;
  esac
  die "Termux pkg/apt is broken (often missing liblz4). Repair it first with: curl -LO https://packages.termux.dev/apt/termux-main/pool/main/libl/liblz4/liblz4_1.10.0-1_${deb_arch}.deb && dpkg -i liblz4_1.10.0-1_${deb_arch}.deb && pkg update -y"
fi

say "Updating Termux packages"
pkg update -y
pkg install -y bash ca-certificates curl git unzip tar nodejs-lts

if ! command -v bun >/dev/null 2>&1; then
  say "Installing Bun runtime"
  pkg install -y bun || die "Bun is not available in this Termux repository. Run 'pkg update && pkg install bun', then retry."
fi
command -v bun >/dev/null 2>&1 || die "Bun installation failed."

say "Downloading NEXUS source"
mkdir -p "$INSTALL_ROOT"
if [ -d "$SOURCE_DIR/.git" ]; then
  git -C "$SOURCE_DIR" fetch --depth=1 origin main \
    || die "Could not fetch branch 'main' from $REPO_URL. Check the URL and your connection."
  git -C "$SOURCE_DIR" reset --hard origin/main \
    || die "Could not reset to origin/main."
else
  rm -rf "$SOURCE_DIR"
  git clone --depth=1 --branch main "$REPO_URL" "$SOURCE_DIR" \
    || die "Could not clone branch 'main' from $REPO_URL. Check the URL and your connection, or set NEXUS_REPO_URL to a repo that has a main branch."
fi

say "Installing JavaScript dependencies (this may take a few minutes)"
cd "$SOURCE_DIR"
# Termux repositories can ship a newer Bun than the lockfile writer. Prefer
# the frozen install, but fall back to a normal install when Bun reports only
# a lockfile-format or lockfile-resolution change.
if ! bun install --frozen-lockfile; then
  say "Bun lockfile differs on this runtime; retrying without frozen mode"
  if ! bun install; then
    say "A native dependency build failed; retrying without lifecycle scripts"
    bun install --ignore-scripts
    printf '%s\n' '[NEXUS] Warning: native optional helpers were skipped; the core agent is installed.'
  fi
fi

# @ff-labs/fff-bun ships Linux/macOS/Windows binaries only. On Android its
# package is skipped, so provide a safe no-op module rather than crashing at
# startup; the agent remains usable without native fast file indexing.
FFF_DIR="$SOURCE_DIR/node_modules/@ff-labs/fff-bun"
if [ ! -e "$FFF_DIR/package.json" ]; then
  say "Enabling Termux file-search fallback"
  mkdir -p "$FFF_DIR"
  cat > "$FFF_DIR/package.json" <<'JSON'
{"name":"@ff-labs/fff-bun","version":"0.9.4","type":"module","main":"index.js"}
JSON
  cat > "$FFF_DIR/index.js" <<'JS'
export const FileFinder = {
  isAvailable() { return false },
  create() { return { ok: false, error: "Native file indexing is unavailable on Android/Termux" } },
}
JS
fi

say "Installing the nexus command"
mkdir -p "$BIN_DIR" "$HOME/.nexus/bots" "$HOME/.nexus/tools" "$HOME/.nexus/services" "$HOME/.nexus/logs" "$HOME/.nexus/agents"
cat > "$BIN_DIR/nexus" <<'LAUNCHER'
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
SOURCE_DIR="${NEXUS_HOME:-$HOME/.nexus}/source"
[ -d "$SOURCE_DIR" ] || { printf '%s\n' 'NEXUS source is missing. Re-run install-termux.sh.' >&2; exit 1; }
cd "$SOURCE_DIR"
exec bun run --cwd packages/nexus --conditions=browser src/index.ts "$@"
LAUNCHER
chmod 755 "$BIN_DIR/nexus"

case ":${PATH}:" in
  *:"$BIN_DIR":*) ;;
  *)
    printf '\n# NEXUS Termux\nexport PATH="%s:$PATH"\n' "$BIN_DIR" >> "$HOME/.bashrc"
    export PATH="$BIN_DIR:$PATH"
    ;;
esac

# Auto-generate MASTER_KEY_SECRET if not set (needed for encrypted credential storage)
if ! grep -q "MASTER_KEY_SECRET" "$HOME/.bashrc" 2>/dev/null; then
    if command -v openssl >/dev/null 2>&1; then
        MASTER_KEY_SECRET=$(openssl rand -hex 32)
    else
        MASTER_KEY_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    fi
    printf '\n# NEXUS - Master key for encrypted credential storage\nexport MASTER_KEY_SECRET="%s"\n' "$MASTER_KEY_SECRET" >> "$HOME/.bashrc"
    say "Generated MASTER_KEY_SECRET"
fi

say "Installation complete"
printf 'Run: source ~/.bashrc && nexus\n'
printf 'Source: %s\n' "$SOURCE_DIR"
printf 'Launcher: %s/nexus\n' "$BIN_DIR"

if [ "$LAUNCH" = "1" ]; then
  exec "$BIN_DIR/nexus"
fi
