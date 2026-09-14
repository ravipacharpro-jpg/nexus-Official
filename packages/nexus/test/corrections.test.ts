import { describe, expect, test } from "bun:test"
import { denyRules, suggestLines } from "../src/corrections"

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
    expect(denyRules("deny")).toEqual([])
    expect(denyRules(null)).toEqual([])
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
})
