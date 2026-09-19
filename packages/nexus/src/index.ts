import { EOL } from "os"

declare const NEXUS_VERSION: unknown

const inputArgs = process.argv.slice(2)
const { isBareUserTask, routeAssistantPluginArgs, runBareUserTask } = await import("./cli/quick-liaison")
const args = routeAssistantPluginArgs(inputArgs)
if (args !== inputArgs) process.argv = [...process.argv.slice(0, 2), ...args]
if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
  const version = typeof NEXUS_VERSION === "string" ? NEXUS_VERSION : "local"
  process.stdout.write(version + EOL)
  process.exit(0)
}

const isNativeTermux =
  typeof process.env.TERMUX_VERSION === "string" ||
  (typeof process.env.PREFIX === "string" && process.env.PREFIX.includes("com.termux"))

if (args.length === 0 && isNativeTermux) {
  const { runTermuxRepl } = await import("./cli/quick-liaison")
  await runTermuxRepl()
} else if (isBareUserTask(args)) {
  await runBareUserTask(args)
} else {
  await import("./main")
}
