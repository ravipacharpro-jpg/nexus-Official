import { describe, expect, test } from "bun:test"
import { SkillPlugin } from "@nexus-ai/core/plugin/skill"

describe("app-spec built-in skill", () => {
  test("ritual content covers questions, spec file, and approval gate", () => {
    const content = SkillPlugin.AppSpecContent
    expect(content.length).toBeGreaterThan(500)
    expect(content).toContain("question")
    expect(content).toContain("spec.md")
    expect(content).toContain("plan_exit")
    expect(content).toContain("Non-goals")
    expect(content).toContain("Fast path")
  })
})
