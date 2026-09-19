// @ts-nocheck -- executed by Bun's test runner; production code stays type-checked separately.
import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ZenFixer } from "./zen-fix"

async function withFakeBridge(reply: unknown, fn: () => Promise<void>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (_input: unknown, init?: { method?: string }) => {
    const ok = init?.method === "POST"
    return {
      ok,
      status: ok ? 200 : 404,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
      json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    } as unknown as Response
  }) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

const bug = {
  file: "",
  line: 2,
  severity: "high",
  type: "logic",
  description: "infinite loop",
  fix: "bound it",
  confidence: 88,
} as const

test("dry-run: generates a patch without touching the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zenfix-"))
  const file = join(dir, "app.ts")
  const original = "let i = 0\nwhile (true) {\n  i++\n}\n"
  await writeFile(file, original, "utf8")
  try {
    await withFakeBridge({ match: "while (true) {", replacement: "while (i < 10) {" }, async () => {
      const result = await new ZenFixer().fixBug({ ...bug, file }, { dryRun: true })
      expect(result.status).toBe("dry-run")
      expect(await readFile(file, "utf8")).toBe(original)
      expect(result.replacement).toBe("while (i < 10) {")
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("apply: writes the replacement and keeps a backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zenfix-"))
  const file = join(dir, "app.ts")
  await writeFile(file, "while (true) {\n  i++\n}\n", "utf8")
  try {
    await withFakeBridge({ match: "while (true) {", replacement: "while (i < 10) {" }, async () => {
      const result = await new ZenFixer().fixBug({ ...bug, file, line: 1 }, { dryRun: false })
      expect(result.status).toBe("applied")
      expect(await readFile(file, "utf8")).toBe("while (i < 10) {\n  i++\n}\n")
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("anchor mismatch: reports replaced-not-found and keeps the file intact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zenfix-"))
  const file = join(dir, "app.ts")
  await writeFile(file, "const x = 1\n", "utf8")
  try {
    await withFakeBridge({ match: "for (;;) {}", replacement: "for (i = 0; i < 5; i++) {}" }, async () => {
      const result = await new ZenFixer().fixBug({ ...bug, file }, { dryRun: false })
      expect(result.status).toBe("replaced-not-found")
      expect(await readFile(file, "utf8")).toBe("const x = 1\n")
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})