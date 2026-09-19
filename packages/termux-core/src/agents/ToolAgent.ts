import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { BaseAgent, type AgentContext } from "./BaseAgent"

type RegistryEntry = {
  name: string
  path: string
  runtime: string
  createdAt: string
}

export type ToolAgentOptions = {
  homeDir?: string
  prefix?: string
}

export class ToolAgent extends BaseAgent {
  readonly name = "tool-agent"
  readonly systemPrompt = "Prepare a small Termux-compatible script using only the hired tools."

  constructor(private readonly options: ToolAgentOptions = {}) {
    super()
  }

  private get homeDir() {
    return this.options.homeDir ?? homedir()
  }

  private get shell() {
    const prefix = this.options.prefix ?? process.env.PREFIX
    return prefix ? `#!${join(prefix, "bin", "sh")}` : "#!/usr/bin/env sh"
  }

  async execute(task: string, context: AgentContext) {
    const name = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "nexus-tool"
    const outputDir = context.outputDir ?? join(this.homeDir, ".nexus", "tools", name)
    await mkdir(outputDir, { recursive: true })

    // Generated tools follow the documented contract: JSON on stdin, JSON on stdout.
    const runner = [
      this.shell,
      "set -eu",
      'exec node "$(dirname "$0")/run.js"',
      `# Hired workers: ${context.hiredWorkers.join(", ") || "core team only"}`,
      "",
    ].join("\n")
    await writeFile(join(outputDir, "run.sh"), runner, { encoding: "utf8", mode: 0o755 })

    const toolScript = [
      "#!/usr/bin/env node",
      'const { execFile } = require("node:child_process")',
      'let raw = ""',
      'process.stdin.on("data", (chunk) => (raw += chunk))',
      'process.stdin.on("end", () => {',
      "  let input = {}",
      '  try { input = JSON.parse(raw || "{}") } catch { input = {} }',
      "  const tools = " + JSON.stringify(context.hiredWorkers),
      '  const task = typeof input.task === "string" ? input.task : typeof input.args === "string" ? input.args : ""',
      '  const resolveTool = async (tool) => {',
      '    const { access } = require("node:fs/promises")',
      '    const { constants } = require("node:fs")',
      "    for (const dir of (process.env.PATH || \"\").split(\":\")) {",
      '      const candidate = dir ? dir + "/" + tool : tool',
      '      try { await access(candidate, constants.X_OK); return candidate } catch {}',
      "    }",
      "    return undefined",
      "  }",
      "  ;(async () => {",
      "    for (const tool of tools) {",
      "      const binary = await resolveTool(tool)",
      "      if (!binary) continue",
      '      const args = (task || "--help").split(/\\s+/).filter(Boolean)',
      "      const output = await new Promise((resolve) => {",
      "        execFile(binary, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {",
      "          resolve({ error, stdout: String(stdout).slice(-20000), stderr: String(stderr).slice(-20000) })",
      "        })",
      "      })",
      "      process.stdout.write(",
      '        JSON.stringify({ ok: !output.error, tool, binary, args, stdout: output.stdout, stderr: output.stderr, error: output.error ? String(output.error) : undefined }) + "\\n",',
      "      )",
      "      process.exit(output.error ? 1 : 0)",
      "    }",
      '    process.stdout.write(JSON.stringify({ ok: false, tool: "none", error: "No hired tool is installed on PATH: " + tools.join(", ") }) + "\\n")',
      "    process.exit(1)",
      "  })()",
      "})",
      "",
    ].join("\n")
    await writeFile(join(outputDir, "run.js"), toolScript, { encoding: "utf8", mode: 0o755 })
    await this.recordRegistry({ name, path: outputDir, runtime: "node", createdAt: new Date().toISOString() })
    return { outputDir, name, files: ["run.sh", "run.js"] }
  }

  private async recordRegistry(entry: RegistryEntry) {
    const registryPath = join(this.homeDir, ".nexus", "tools", "registry.json")
    let registry: RegistryEntry[] = []
    try {
      const parsed = JSON.parse(await readFile(registryPath, "utf8")) as unknown
      if (Array.isArray(parsed)) registry = parsed as RegistryEntry[]
    } catch {
      // First entry starts a fresh registry.
    }
    const deduped = registry.filter((item) => item.path !== entry.path)
    deduped.push(entry)
    await mkdir(dirname(registryPath), { recursive: true })
    await writeFile(registryPath, JSON.stringify(deduped, null, 2) + "\n", "utf8")
  }
}
