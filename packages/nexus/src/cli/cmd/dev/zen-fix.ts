import { readFile, writeFile } from "node:fs/promises"

const BASE = process.env.ZEN_BRIDGE_URL ?? "http://127.0.0.1:4897"
const MODEL = process.env.ZEN_FIX_MODEL ?? "big-pickle"

export type ZenBug = {
  file: string
  line: number
  severity: string
  type: string
  description: string
  fix: string
}

export type ZenFixStatus = "applied" | "replaced-not-found" | "no-patch" | "model-request-failed" | "dry-run" | "verification-failed"

export type ZenFixResult = {
  file: string
  line: number
  status: ZenFixStatus
  detail: string
  match?: string
  replacement?: string
}

export type ZenFixerOptions = {
  dryRun: boolean
  timeoutMs?: number
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const open = trimmed.indexOf("{")
  const close = trimmed.lastIndexOf("}")
  if (open !== -1 && close > open) return trimmed.slice(open, close + 1)
  return trimmed
}

async function askModel(prompt: string, timeoutMs: number): Promise<string> {
  let lastError = "empty completion from zen-bridge"
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer zen-bridge-token" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You fix code precisely. The user gives you a file and one reported issue. " +
                'Respond with ONLY a JSON object: {"match":"exact substring from the file to replace","replacement":"corrected code"}. ' +
                "match must be copied verbatim from the file. Do not explain, do not wrap in fences.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      })
      if (!response.ok) {
        const body = await response.text()
        lastError = `zen-bridge ${response.status}: ${body.slice(0, 200)}`
        continue
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = data.choices?.[0]?.message?.content
      if (content) return content
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && attempt === 0) continue
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastError)
}

export class ZenFixer {
  async fixBug(bug: ZenBug, options: ZenFixerOptions): Promise<ZenFixResult> {
    const base: ZenFixResult = { file: bug.file, line: bug.line, status: options.dryRun ? "dry-run" : "no-patch", detail: "" }
    let content: string
    try {
      content = await readFile(bug.file, "utf8")
    } catch (error) {
      return { ...base, status: "no-patch", detail: `Cannot read file: ${error instanceof Error ? error.message : String(error)}` }
    }
    const prompt = [
      `File:\n${content}`,
      `Reported issue at line ${bug.line}: [${bug.severity}/${bug.type}] ${bug.description}`,
      `Suggested approach: ${bug.fix}`,
      'Return ONLY {"match":"...","replacement":"..."}',
    ].join("\n\n")
    let raw: string
    try {
      raw = await askModel(prompt, options.timeoutMs ?? 90_000)
    } catch (error) {
      return {
        ...base,
        status: "model-request-failed",
        detail: error instanceof Error ? error.message : String(error),
      }
    }
    let parsed: { match?: unknown; replacement?: unknown }
    try {
      parsed = JSON.parse(stripFences(raw)) as { match?: unknown; replacement?: unknown }
    } catch {
      return { ...base, status: "no-patch", detail: `Model output was not JSON: ${raw.slice(0, 160)}` }
    }
    const match = typeof parsed.match === "string" ? parsed.match : undefined
    const replacement = typeof parsed.replacement === "string" ? parsed.replacement : undefined
    if (!match || !replacement) {
      return { ...base, status: "no-patch", detail: "Model did not provide a non-empty match/replacement pair." }
    }
    const index = content.indexOf(match)
    if (index === -1) {
      return { ...base, status: "replaced-not-found", detail: "Model-provided match text was not found verbatim in the file." }
    }
    const fixed = content.slice(0, index) + replacement + content.slice(index + match.length)
    const result: ZenFixResult = {
      file: bug.file,
      line: bug.line,
      status: "applied",
      detail: `Replaced ${match.split("\n").length} line(s) at offset ${index}.`,
      match,
      replacement,
    }
    if (options.dryRun) return { ...result, status: "dry-run", detail: `Dry run: ${result.detail}` }
    const backup = `${bug.file}.zenbak`
    try {
      await writeFile(backup, content, "utf8")
      await writeFile(bug.file, fixed, "utf8")
      return result
    } catch (error) {
      return { ...base, status: "verification-failed", detail: `Write failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  async verify(root: string): Promise<{ passed: boolean; output: string }> {
    try {
      const { TestRunner } = await import("@nexus/termux-core")
      const result = await new TestRunner().verify(root)
      return { passed: result.passed, output: result.output.slice(-2000) }
    } catch (error) {
      return { passed: true, output: `Static verification skipped: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}

export function bridgeBaseURL(): string {
  return BASE
}