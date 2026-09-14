import { isRecord } from "@/util/record"

// Correction learning, step one: turn the user's past "no"s into drafted
// standing orders. Deny rules in config are recorded corrections; suggesting
// them as standing orders closes the loop so the agent stops asking about
// settled matters. Counts and history arrive with the memory store; until
// then every deny rule is one vote.

export interface Denial {
  tool: string
  pattern: string
}

function isDeny(value: unknown): boolean {
  return value === "deny"
}

// Walks a permission config object ({ tool: "deny" | { pattern: "deny" } })
// and collects every deny as a correction. Unknown shapes are ignored, never
// fatal: config parsing already validated the file.
export function denyRules(config: unknown): Denial[] {
  if (!isRecord(config)) return []
  const denials: Denial[] = []
  for (const [tool, rule] of Object.entries(config)) {
    if (isDeny(rule)) {
      denials.push({ tool, pattern: "*" })
      continue
    }
    if (!isRecord(rule)) continue
    for (const [pattern, action] of Object.entries(rule)) {
      if (isDeny(action)) denials.push({ tool, pattern })
    }
  }
  return denials.toSorted((a, b) => a.tool.localeCompare(b.tool) || a.pattern.localeCompare(b.pattern))
}

export function suggestLines(denials: Denial[]): string[] {
  return denials.map((denial) =>
    denial.pattern === "*"
      ? `Never run \`${denial.tool}\` without asking first.`
      : `Never run \`${denial.tool}\` on \`${denial.pattern}\` without asking first.`,
  )
}
