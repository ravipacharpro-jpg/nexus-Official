import { describe, expect, test } from "bun:test"
import { LayerNode } from "@nexus-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import path from "path"
import { Skill, meetsGate, type GateContext, SKILL_PROMPT_BUDGET_CHARS } from "../../src/skill"
import { CrossSpawnSpawner } from "@nexus-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = LayerNode.compile(CrossSpawnSpawner.node)

const it = testEffect(Layer.mergeAll(LayerNode.compile(Skill.node), node, testInstanceStoreLayer))

const gateBase: GateContext = {
  env: {},
  bins: ["git", "node"],
  config: {},
  platform: "linux",
  isTermux: false,
}

function gatedSkill(overrides: Partial<Skill.Info> = {}): Skill.Info {
  return {
    name: "gated-skill",
    description: "A gated skill.",
    location: "/tmp/gated/SKILL.md",
    content: "# gated",
    ...overrides,
  }
}

describe("skill gating", () => {
  test("skill without requirements is always eligible", () => {
    expect(meetsGate(gatedSkill(), gateBase)).toBe(true)
  })

  test("env requirements need every key set", () => {
    const info = gatedSkill({ requires: { env: ["PRESENT_KEY", "MISSING_KEY"] } })
    expect(meetsGate(info, { ...gateBase, env: { PRESENT_KEY: "1" } })).toBe(false)
    expect(meetsGate(info, { ...gateBase, env: { PRESENT_KEY: "1", MISSING_KEY: "1" } })).toBe(true)
    expect(meetsGate(info, { ...gateBase, env: { PRESENT_KEY: "1", MISSING_KEY: "" } })).toBe(false)
  })

  test("bins requirements match PATH binaries", () => {
    expect(meetsGate(gatedSkill({ requires: { bins: ["git"] } }), gateBase)).toBe(true)
    expect(meetsGate(gatedSkill({ requires: { bins: ["git", "nope"] } }), gateBase)).toBe(false)
    expect(meetsGate(gatedSkill({ requires: { anyBins: ["nope", "node"] } }), gateBase)).toBe(true)
    expect(meetsGate(gatedSkill({ requires: { anyBins: ["nope"] } }), gateBase)).toBe(false)
  })

  test("os requirements match platform or termux", () => {
    expect(meetsGate(gatedSkill({ os: ["linux"] }), gateBase)).toBe(true)
    expect(meetsGate(gatedSkill({ os: ["darwin"] }), gateBase)).toBe(false)
    expect(meetsGate(gatedSkill({ os: ["termux"] }), gateBase)).toBe(false)
    expect(meetsGate(gatedSkill({ os: ["termux"] }), { ...gateBase, isTermux: true })).toBe(true)
  })

  test("config requirements need truthy config paths", () => {
    const info = gatedSkill({ requires: { config: ["server.enabled"] } })
    expect(meetsGate(info, { ...gateBase, config: { server: { enabled: true } } })).toBe(true)
    expect(meetsGate(info, { ...gateBase, config: { server: { enabled: false } } })).toBe(false)
    expect(meetsGate(info, { ...gateBase, config: {} })).toBe(false)
  })
})

describe("skill prompt budget", () => {
  const big = (name: string): Skill.Info => ({
    name,
    description: "x".repeat(2000),
    location: `/tmp/${name}/SKILL.md`,
    content: `# ${name}`,
  })

  test("short lists render full", () => {
    const output = Skill.fmt([big("a-skill")], { verbose: true })
    expect(output).toContain("x".repeat(100))
    expect(output).not.toContain("omitted")
  })

  test("long lists render compact without descriptions", () => {
    const list = [big("a-skill"), big("b-skill"), big("c-skill")]
    const verbose = Skill.fmt(list, { verbose: true, maxChars: 100 })
    expect(verbose).toContain("<name>a-skill</name>")
    expect(verbose).not.toContain("x".repeat(100))
    const plain = Skill.fmt(list, { verbose: false, maxChars: 100 })
    expect(plain).toContain("a-skill")
    expect(plain).toContain("omitted")
    expect(plain).not.toContain("x".repeat(100))
  })

  test("default budget is a sane positive number", () => {
    expect(SKILL_PROMPT_BUDGET_CHARS).toBeGreaterThan(0)
  })
})

describe("skill discovery gating", () => {
  it.live("hides skills whose env requirements are unmet", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".nexus", "skill", "gated-env-skill", "SKILL.md"),
              `---
name: gated-env-skill
description: Needs a test env key.
requires:
  env: [NEXUS_TEST_GATING_SKILL_KEY]
---

# Gated
`,
            ),
          )
          const skill = yield* Skill.Service
          const hidden = yield* skill.available()
          expect(hidden.some((item) => item.name === "gated-env-skill")).toBe(false)

          process.env.NEXUS_TEST_GATING_SKILL_KEY = "1"
          try {
            const visible = yield* skill.available()
            expect(visible.some((item) => item.name === "gated-env-skill")).toBe(true)
          } finally {
            delete process.env.NEXUS_TEST_GATING_SKILL_KEY
          }
        }),
    ),
  )

  it.live("hides skills for other operating systems", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".nexus", "skill", "gated-os-skill", "SKILL.md"),
              `---
name: gated-os-skill
description: Wrong OS skill.
os: [definitely-not-an-os]
---

# Gated OS
`,
            ),
          )
          const skill = yield* Skill.Service
          const list = yield* skill.available()
          expect(list.some((item) => item.name === "gated-os-skill")).toBe(false)
        }),
    ),
  )
})
