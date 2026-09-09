import { spawnSync } from "node:child_process"
import { accessSync, constants } from "node:fs"
import { delimiter, join } from "node:path"

export type AgentCapabilities = {
  platform: NodeJS.Platform
  architecture: string
  termux: boolean
  git: boolean
  github: boolean
  browserHandoff: boolean
  browserHttpInspection: boolean
  browserAutomation: boolean
  webRuntime: boolean
  android: boolean
  androidDevice: boolean
  apkBuild: boolean
  packageManagers: string[]
}

function executableOnPath(command: string, pathValue: string): boolean {
  const names =
    process.platform === "win32" ? [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command] : [command]
  return pathValue
    .split(delimiter)
    .filter((dir) => dir.length > 0)
    .some((dir) =>
      names.some((name) => {
        try {
          accessSync(join(dir, name), constants.X_OK)
          return true
        } catch {
          return false
        }
      }),
    )
}

function commandAvailable(
  command: string,
  platform = process.platform,
  pathValue: string = process.env.PATH ?? "",
): boolean {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) return false
  const childEnv = { ...process.env, PATH: pathValue }
  if (platform === "win32") {
    try {
      if (spawnSync("where", [command], { stdio: "ignore", env: childEnv }).status === 0) return true
    } catch {
      // Fall through to the PATH scan below.
    }
    return executableOnPath(command, pathValue)
  }
  // NOTE: `command` is a shell builtin, not an executable, so it must run
  // through `sh -c`. Spawning a bare `command` binary always fails on
  // systems (like Termux) that do not ship one, which used to report every
  // capability as missing.
  try {
    if (spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore", env: childEnv }).status === 0)
      return true
  } catch {
    // Fall through to the PATH scan below.
  }
  return executableOnPath(command, pathValue)
}

function anyCommand(commands: string[], platform = process.platform, pathValue: string = process.env.PATH ?? ""): boolean {
  return commands.some((command) => commandAvailable(command, platform, pathValue))
}

export function detectAgentCapabilities(env: NodeJS.ProcessEnv = process.env): AgentCapabilities {
  const pathValue = env.PATH ?? process.env.PATH ?? ""
  const termux = env.TERMUX_VERSION !== undefined || env.PREFIX?.includes("/com.termux/files/usr") === true
  const browserHandoff = termux
    ? commandAvailable("termux-open-url", process.platform, pathValue)
    : anyCommand(
        process.platform === "win32" ? ["start"] : process.platform === "darwin" ? ["open"] : ["xdg-open"],
        process.platform,
        pathValue,
      )
  const browserHttpInspection = typeof globalThis.fetch === "function"
  const browserAutomation = anyCommand(
    ["playwright", "chromium", "google-chrome", "google-chrome-stable", "chrome"],
    process.platform,
    pathValue,
  )
  const packageManagers = ["bun", "npm", "pnpm", "yarn"].filter((command) =>
    commandAvailable(command, process.platform, pathValue),
  )
  const android = anyCommand(["adb", "emulator", "sdkmanager", "gradle"], process.platform, pathValue)
  const androidDevice =
    commandAvailable("adb", process.platform, pathValue) &&
    spawnSync("adb", ["get-state"], { stdio: "ignore", timeout: 1_000 }).status === 0
  const apkBuild = commandAvailable("gradle", process.platform, pathValue)

  return {
    platform: process.platform,
    architecture: process.arch,
    termux,
    git: commandAvailable("git", process.platform, pathValue),
    github: commandAvailable("gh", process.platform, pathValue),
    browserHandoff,
    browserHttpInspection,
    browserAutomation,
    webRuntime: anyCommand(["node", "bun", "deno"]),
    android,
    androidDevice,
    apkBuild,
    packageManagers,
  }
}

export function capabilitySummary(capabilities: AgentCapabilities): string[] {
  const enabled: string[] = []
  if (capabilities.termux) enabled.push("Termux/Android shell")
  if (capabilities.git) enabled.push("Git")
  if (capabilities.github) enabled.push("GitHub CLI")
  if (capabilities.browserHandoff) enabled.push("browser handoff")
  if (capabilities.browserHttpInspection) enabled.push("safe HTTP inspection")
  if (capabilities.browserAutomation) enabled.push("browser automation")
  if (capabilities.webRuntime) enabled.push("web runtime")
  if (capabilities.android) enabled.push("Android tooling")
  if (capabilities.androidDevice) enabled.push("connected Android device")
  if (capabilities.apkBuild) enabled.push("APK build/test tooling")
  return enabled
}
