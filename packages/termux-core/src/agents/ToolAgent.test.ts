// @ts-nocheck -- this file is executed by Bun's test runner; production code remains type-checked separately.
import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ToolAgent } from "./ToolAgent"

function runTool(path: string, input: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(path, [], { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += String(chunk)))
    child.stderr.on("data", (chunk) => (stderr += String(chunk)))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}

test("generated tools report honestly when no hired tool is installed, and register metadata", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "nexus-tool-agent-"))
  try {
    const agent = new ToolAgent({ homeDir, prefix: "/" })
    const generated = await agent.execute("verify JSON tool", { hiredWorkers: [] })
    const result = await runTool(join(generated.outputDir, "run.sh"), '{"mission":"verify"}\n')
    const output = JSON.parse(result.stdout)
    expect(result.code).toBe(1)
    expect(output.ok).toBe(false)
    expect(output.tool).toBe("none")
    expect(output.error).toMatch(/No hired tool/)
    expect(generated.files).toEqual(["run.sh", "run.js"])

    const registry = JSON.parse(await readFile(join(homeDir, ".nexus", "tools", "registry.json"), "utf8"))
    expect(registry).toEqual([
      expect.objectContaining({ name: "verify-json-tool", path: generated.outputDir, runtime: "node" }),
    ])
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})

test("generated tools actually invoke an installed hired tool and report its output", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "nexus-tool-agent-"))
  try {
    const agent = new ToolAgent({ homeDir, prefix: "/" })
    const generated = await agent.execute("check the version", { hiredWorkers: ["bun"] })
    const result = await runTool(join(generated.outputDir, "run.sh"), '{"task":"--version"}\n')
    const output = JSON.parse(result.stdout)
    expect(result.code).toBe(0)
    expect(output.ok).toBe(true)
    expect(output.tool).toBe("bun")
    expect(output.args).toEqual(["--version"])
    expect(output.stdout.trim()).toMatch(/\d+\.\d+/)
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
}, 20000)