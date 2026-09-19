import { access } from "node:fs/promises"
import { execFile } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"
import { BaseAgent, type AgentContext } from "./BaseAgent"

const execFileAsync = promisify(execFile)

type Validation = { file: string; valid: boolean; output: string }

export class DebugAgent extends BaseAgent {
  readonly name = "debug-agent"
  readonly systemPrompt = "Validate generated Termux files (existence and syntax) and report results without running destructive commands."

  async execute(_task: string, context: AgentContext) {
    if (!context.outputDir) return { ok: true, checked: [], validation: [] }
    const expected = context.hiredWorkers.includes("telegram-bot") ? ["main.py", "run.sh", "install.sh"] : ["run.sh"]
    const missing: string[] = []
    for (const file of expected) {
      try {
        await access(join(context.outputDir, file))
      } catch {
        missing.push(file)
      }
    }
    const validation: Validation[] = []
    const candidates = Array.from(new Set([...expected, "run.js"]))
    for (const file of candidates) {
      const path = join(context.outputDir, file)
      try {
        if (file.endsWith(".py")) {
          await execFileAsync("python", ["-m", "py_compile", path], { timeout: 30_000 })
          validation.push({ file, valid: true, output: "python syntax OK" })
        } else if (file.endsWith(".js")) {
          await execFileAsync("node", ["--check", path], { timeout: 30_000 })
          validation.push({ file, valid: true, output: "node syntax OK" })
        } else {
          await execFileAsync("sh", ["-n", path], { timeout: 30_000 })
          validation.push({ file, valid: true, output: "shell syntax OK" })
        }
      } catch (error) {
        validation.push({ file, valid: false, output: String(error instanceof Error ? error.message : error) })
      }
    }
    const invalid = validation.filter((item) => !item.valid)
    return { ok: missing.length === 0 && invalid.length === 0, checked: expected, missing, validation }
  }
}
