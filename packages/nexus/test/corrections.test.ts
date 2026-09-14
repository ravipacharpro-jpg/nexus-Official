import { describe, expect, test } from "bun:test"
import { applyCorrections, denyRules, suggestLines } from "../src/corrections"

describe("correction learning", () => {
  test("collects whole-tool and pattern denials, sorted", () => {
    const denials = denyRules({
      edit: "deny",
      read: "allow",
      bash: { "rm -rf *": "deny", "ls *": "allow" },
      skill: "ask",
      bogus: 42,
    })
    expect(denials).toEqual([
      { tool: "bash", pattern: "rm -rf *" },
      { tool: "edit", pattern: "*" },
    ])
  })

  test("ignores non-object configs", () => {
    expect(denyRules(undefined)).toEqual([])
    expect(denyRules(null)).toEqual([])
    expect(denyRules(42)).toEqual([])
  })

  test("drafts standing-order lines", () => {
    expect(
      suggestLines([
        { tool: "edit", pattern: "*" },
        { tool: "bash", pattern: "rm -rf *" },
      ]),
    ).toEqual([
      "Never run `edit` without asking first.",
      "Never run `bash` on `rm -rf *` without asking first.",
    ])
    expect(suggestLines([])).toEqual([])
  })

  test("top-level deny becomes one broad suggestion", () => {
    expect(denyRules("deny")).toEqual([{ tool: "*", pattern: "*" }])
    expect(suggestLines(denyRules("deny"))).toEqual(["Deny-by-default is on: every tool asks first."])
  })

  test("apply is idempotent across re-runs", () => {
    const lines = ["Never run `edit` without asking first."]
    const first = applyCorrections("# Standing Orders\n", lines)
    expect(first.text).toContain("Learned corrections")
    expect(first.added).toBe(1)
    const second = applyCorrections(first.text, lines)
    expect(second.text).toBe(first.text)
    expect(second.added).toBe(0)
  })
})
