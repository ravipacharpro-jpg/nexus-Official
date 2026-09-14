import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import path from "node:path"
import { Global } from "@nexus-ai/core/global"
import { containsSensitiveMemoryValue } from "./cli/cmd/memory"

export interface Incident {
  fingerprint: string
  severity: string
  source: string
  message: string
  timestamp: string
}

export interface Lesson {
  fingerprint: string
  severity: string
  source: string
  text: string
}

export function lessonsPath(stateDirectory: string = Global.Path.state): string {
  return path.join(stateDirectory, "LESSONS.md")
}

function distilledPath(stateDirectory: string = Global.Path.state): string {
  return path.join(stateDirectory, ".lessons-distilled.json")
}

// Read-only scan: malformed files are skipped, never fatal.
export function readIncidentFiles(stateDirectory: string = Global.Path.state): Incident[] {
  let files: string[]
  try {
    files = readdirSync(stateDirectory).filter(
      (file) => file.startsWith("incident-") && file.endsWith(".json"),
    )
  } catch {
    return []
  }
  const incidents: Incident[] = []
  for (const file of files) {
    try {
      const data: unknown = JSON.parse(readFileSync(path.join(stateDirectory, file), "utf8"))
      const list =
        data && typeof data === "object" && "incidents" in data && Array.isArray(data.incidents) ? data.incidents : []
      for (const item of list) {
        if (!item || typeof item !== "object") continue
        const entry = item as Record<string, unknown>
        if (typeof entry.fingerprint !== "string" || typeof entry.message !== "string") continue
        incidents.push({
          fingerprint: entry.fingerprint,
          severity: typeof entry.severity === "string" ? entry.severity : "unknown",
          source: typeof entry.source === "string" ? entry.source : "unknown",
          message: entry.message,
          timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "",
        })
      }
    } catch {
      continue
    }
  }
  return incidents
}

function cleanMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 160)
}

// Deterministic distillation, no model call: only error/critical incidents
// become lessons, secrets never land in the museum, repeats are skipped via
// fingerprint. Critical first so the worst lessons surface on top.
export function distill(incidents: Incident[], already: ReadonlySet<string>): Lesson[] {
  const seen = new Set<string>()
  const lessons: Lesson[] = []
  for (const incident of incidents) {
    if (incident.severity !== "error" && incident.severity !== "critical") continue
    if (already.has(incident.fingerprint) || seen.has(incident.fingerprint)) continue
    if (containsSensitiveMemoryValue(incident.message)) continue
    const text = cleanMessage(incident.message)
    if (!text) continue
    seen.add(incident.fingerprint)
    lessons.push({ fingerprint: incident.fingerprint, severity: incident.severity, source: incident.source, text })
  }
  return lessons.toSorted((a, b) => {
    if (a.severity === b.severity) return a.text.localeCompare(b.text)
    return a.severity === "critical" ? -1 : 1
  })
}

export function loadDistilled(stateDirectory: string = Global.Path.state): Set<string> {
  try {
    const data: unknown = JSON.parse(readFileSync(distilledPath(stateDirectory), "utf8"))
    if (Array.isArray(data)) return new Set(data.filter((item): item is string => typeof item === "string"))
  } catch {
    // No sidecar yet: nothing distilled.
  }
  return new Set()
}

export function renderLessons(lessons: Lesson[], date = new Date().toISOString().slice(0, 10)): string {
  return [`## ${date}`, ...lessons.map((lesson) => `- [${lesson.severity}] ${lesson.text} (${lesson.source})`), ""].join(
    "\n",
  )
}

export function distillNew(stateDirectory: string = Global.Path.state): { added: number; lessons: Lesson[] } {
  const already = loadDistilled(stateDirectory)
  const lessons = distill(readIncidentFiles(stateDirectory), already)
  if (lessons.length === 0) return { added: 0, lessons }
  mkdirSync(stateDirectory, { recursive: true })
  const file = lessonsPath(stateDirectory)
  const previous = existsSync(file) ? readFileSync(file, "utf8") : "# Failure Museum\n\nLessons distilled from past incidents. Newest last.\n\n"
  writeFileSync(file, previous + renderLessons(lessons))
  writeFileSync(distilledPath(stateDirectory), JSON.stringify([...already, ...lessons.map((lesson) => lesson.fingerprint)]))
  return { added: lessons.length, lessons }
}
