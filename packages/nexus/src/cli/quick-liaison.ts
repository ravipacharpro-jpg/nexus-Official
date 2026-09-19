import { EOL } from "node:os"
import type { UserLiaison } from "@nexus/termux-core"

const assistantPluginAliases = new Set([
  "code",
  "codegen",
  "copilot",
  "cpanel",
  "deploy",
  "devtools",
  "gitpro",
  "integrations",
  "recovery",
  "security",
  "termux",
  "translate",
  "translator",
  "undo-ai",
  "voice",
  "webtest",
  "workspace",
])

const knownCommands = new Set([
  "acp",
  "agent",
  "api",
  "artifact",
  "asset",
  "assistant",
  "attach",
  "bot",
  "completion",
  "config",
  "console",
  "db",
  "debug",
  "dev",
  "device",
  "do",
  "doctor",
  "export",
  "generate",
  "github",
  "goals",
  "heartbeat",
  "import",
  "instructions",
  "intent",
  "lessons",
  "liaison",
  "mcp",
  "memory",
  "mod",
  "models",
  "onboard",
  "permission",
  "pr",
  "profile",
  "providers",
  "run",
  "serve",
  "session",
  "setup",
  "standing",
  "stats",
  "tasks",
  "translator",
  "tui",
  "uninstall",
  "upgrade",
  "web",
  ...assistantPluginAliases,
])

/**
 * Keep direct plugin commands documented by the Assistant package out of the
 * bare-task liaison. This preserves existing natural-language bare tasks while
 * making `nexus voice say` equivalent to `nexus assistant voice say`.
 */
export function routeAssistantPluginArgs(args: string[]) {
  return assistantPluginAliases.has(args[0] ?? "") ? ["assistant", ...args] : args
}

export function isBareUserTask(args: string[]) {
  return args.length > 0 && !args[0]?.startsWith("-") && !knownCommands.has(args[0] ?? "")
}

export async function runBareUserTask(
  args: string[],
  dependencies: {
    liaison?: UserLiaison
    write?: (text: string) => void
    writeError?: (text: string) => void
  } = {},
) {
  const { UserLiaison } = await import("@nexus/termux-core")
  const write = dependencies.write ?? process.stdout.write.bind(process.stdout)
  const writeError = dependencies.writeError ?? process.stderr.write.bind(process.stderr)
  const liaison =
    dependencies.liaison ??
    new UserLiaison({
      onUpdate(status) {
        if (!["Complete", "Failed", "Paused", "Cancelled", "Needs review"].includes(status.status)) return
        const detail = status.result?.summary ?? status.error ?? status.status
        write(`NEXUS task ${status.taskId}: ${detail}${EOL}`)
      },
    })
  try {
    const response = await liaison.handleUserMessage(args.join(" "), "local", process.cwd())
    write(response + EOL)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeError(`❌ Task failed: ${message}${EOL}`)
    process.exitCode = 1
  }
}

/**
 * Line-based interactive REPL used when the OpenTUI renderer cannot load its
 * native asset (e.g. Termux/Android). Reuses a single liaison so follow-up
 * messages keep working in the same process.
 */
export async function runTermuxRepl(dependencies: { write?: (text: string) => void; writeError?: (text: string) => void } = {}) {
  const { createInterface } = await import("node:readline")
  const { UserLiaison } = await import("@nexus/termux-core")
  const write = dependencies.write ?? process.stdout.write.bind(process.stdout)
  const writeError = dependencies.writeError ?? process.stderr.write.bind(process.stderr)
  const liaison = new UserLiaison({
    onUpdate(status) {
      if (!["Complete", "Failed", "Paused", "Cancelled", "Needs review"].includes(status.status)) return
      const detail = status.result?.summary ?? status.error ?? status.status
      write(`NEXUS task ${status.taskId}: ${detail}${EOL}`)
    },
  })
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.setPrompt("nexus> ")
  write(`NEXUS Termux line mode. Type a task, 'help', or 'exit' to quit.${EOL}`)
  rl.prompt()
  rl.on("line", async (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }
    if (trimmed === "exit" || trimmed === "quit" || trimmed === "/exit") {
      rl.close()
      return
    }
    try {
      const response = await liaison.handleUserMessage(trimmed, "local", process.cwd())
      write(response + EOL + EOL)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeError(`❌ Task failed: ${message}${EOL}${EOL}`)
    }
    rl.prompt()
  })
  rl.on("close", () => process.exit(0))
}
