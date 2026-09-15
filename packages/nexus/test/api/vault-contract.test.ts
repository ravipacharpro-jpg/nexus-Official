import { describe, expect, test } from "bun:test"
import { validationStatusForResponse } from "../../src/api/ApiVault"
import { PROVIDER_CONTRACTS } from "../../src/api/providers"

describe("API vault provider validation contracts", () => {
  test("does not treat OpenCode's public model catalog as proof that an arbitrary key is active", () => {
    expect(validationStatusForResponse(PROVIDER_CONTRACTS.opencode, 200)).toBe("unknown")
  })

  test("maps provider authentication and quota failures to usable vault statuses", () => {
    expect(validationStatusForResponse(PROVIDER_CONTRACTS.xai, 400)).toBe("invalid")
    expect(validationStatusForResponse(PROVIDER_CONTRACTS.perplexity, 401)).toBe("invalid")
    expect(validationStatusForResponse(PROVIDER_CONTRACTS.groq, 429)).toBe("rate_limited")
  })

  test("uses the documented Perplexity Router API for models and OpenAI-compatible requests", () => {
    expect(PROVIDER_CONTRACTS.perplexity.modelsEndpoint).toBe("https://api.perplexity.ai/router/v1/models")
    expect(PROVIDER_CONTRACTS.perplexity.baseURL).toBe("https://api.perplexity.ai/router/v1")
  })

  test("validates Edge Router credentials through chat, not its public model catalog", () => {
    expect(PROVIDER_CONTRACTS["edge-router"].modelsEndpointPublic).toBe(true)
    expect(PROVIDER_CONTRACTS["edge-router"].validation).toEqual({ kind: "chat", model: "gemini-flash-latest" })
    expect(validationStatusForResponse(PROVIDER_CONTRACTS["edge-router"], 200)).toBe("active")
    expect(validationStatusForResponse(PROVIDER_CONTRACTS["edge-router"], 401)).toBe("invalid")
  })
})
