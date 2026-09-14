import { describe, expect, test, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { distill, distillNew, readIncidentFiles, type Incident } from "../src/lessons"

const dirs: string[] = []
function tmpdirNew() {
  const dir = mkdtempSync(join(tmpdir(), "nexus-lessons-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    fingerprint: "abc123",
    severity: "error",
    source: "worker",
    message: "Command failed: git status",
    timestamp: "2026-09-14T00:00:00.000Z",
    ...overrides,
  }
}

function writeIncidents(dir: string, name: string, incidents: unknown) {
  writeFileSync(join(dir, name), JSON.stringify({ incidents }))
}

describe("failure museum", () => {
  test("reads incident files and skips malformed ones", () => {
    const dir = tmpdirNew()
    writeIncidents(dir, "incident-a.json", [incident({ fingerprint: "one" })])
    writeFileSync(join(dir, "incident-broken.json"), "not json{")
    writeFileSync(join(dir, "notes.txt"), "ignored")
    const found = readIncidentFiles(dir)
    expect(found.map((item) => item.fingerprint)).toEqual(["one"])
  })

  test("keeps only error and critical incidents", () => {
    const lessons = distill(
      [
        incident({ fingerprint: "e", severity: "error" }),
        incident({ fingerprint: "c", severity: "critical" }),
        incident({ fingerprint: "i", severity: "info" }),
        incident({ fingerprint: "w", severity: "warning" }),
      ],
      new Set(),
    )
    expect(lessons.map((lesson) => lesson.fingerprint).sort()).toEqual(["c", "e"])
  })

  test("orders critical first and skips secrets and repeats", () => {
    const lessons = distill(
      [
        incident({ fingerprint: "e", severity: "error", message: "plain failure" }),
        incident({ fingerprint: "c", severity: "critical", message: "bad crash" }),
        incident({ fingerprint: "s", severity: "critical", message: "api_key=SECRETVALUE1234567890" }),
        incident({ fingerprint: "e", severity: "error", message: "plain failure duplicate" }),
      ],
      new Set(["c"]),
    )
    expect(lessons.map((lesson) => lesson.fingerprint)).toEqual(["e"])
  })

  test("caps message length", () => {
    const [lesson] = distill([incident({ message: "x".repeat(500) })], new Set())
    expect(lesson.text.length).toBeLessThanOrEqual(160)
  })

  test("distillNew appends once then reports zero", () => {
    const dir = tmpdirNew()
    writeIncidents(dir, "incident-a.json", [incident({ fingerprint: "one", severity: "critical" })])
    const first = distillNew(dir)
    expect(first.added).toBe(1)
    const second = distillNew(dir)
    expect(second.added).toBe(0)
  })
})
