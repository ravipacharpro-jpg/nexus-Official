import { describe, expect, test } from "bun:test"
import { ProviderV2 } from "@nexus-ai/core/provider"
import { ModelV2 } from "@nexus-ai/core/model"
import { buildInjection } from "../src/inbox"
import { SessionID } from "../src/session/schema"

describe("session inbox", () => {
  test("builds a durable user wakeup message", () => {
    const sessionID = SessionID.make("ses_test")
    const { message, part } = buildInjection({
      sessionID,
      text: "[scheduled job_x] remind me",
      agent: "build",
      model: { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-4o-mini") },
    })
    expect(message.role).toBe("user")
    expect(message.sessionID).toBe(sessionID)
    expect(message.agent).toBe("build")
    expect(part.messageID).toBe(message.id)
    expect(part.sessionID).toBe(sessionID)
    expect(part.type).toBe("text")
    expect(part.text).toContain("remind me")
  })
})
