import fs from "fs"
import path from "path"
/**
 * Local secret storage for assistant plugins.
 *
 * Secrets are stored in the existing `.enc` path for compatibility, but no
 * machine key or MASTER_KEY_SECRET is created or required.
 */

const NEXUS_DIR = path.join(process.env.HOME ?? process.cwd(), ".nexus")
const SECRET_DIR = path.join(NEXUS_DIR, "secrets")

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  try {
    fs.chmodSync(dir, 0o700)
  } catch {
    // Some Android filesystems ignore chmod; parent dir is already private.
  }
}

function secretPath(name: string): string {
  return path.join(SECRET_DIR, `${name.replace(/[^a-z0-9._-]+/gi, "-")}.enc`)
}

export function setSecret(name: string, value: string): void {
  ensureDir(SECRET_DIR)
  fs.writeFileSync(secretPath(name), value, { mode: 0o600 })
  try {
    fs.chmodSync(secretPath(name), 0o600)
  } catch {}
}

export function getSecret(name: string): string | undefined {
  const file = secretPath(name)
  if (!fs.existsSync(file)) return undefined
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return undefined
  }
}

export function deleteSecret(name: string): void {
  const file = secretPath(name)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

export * as SecretStore from "./secret-store"
