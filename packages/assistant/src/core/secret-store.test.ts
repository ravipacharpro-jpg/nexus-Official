import { describe, expect, test } from "bun:test"
import { setSecret, getSecret, deleteSecret } from "./secret-store"

const NAME = `test.secret.${Date.now()}`

describe("secret-store", () => {
  test("roundtrips a local secret without a master key", async () => {
    const value = "cpanel-super-secret-token-123"
    setSecret(NAME, value)
    expect(getSecret(NAME)).toBe(value)

    const raw = await Bun.file(`${process.env.HOME}/.nexus/secrets/${NAME}.enc`).text()
    expect(raw).toBe(value)
  })

  test("returns undefined after delete", () => {
    setSecret(NAME, "temp")
    deleteSecret(NAME)
    expect(getSecret(NAME)).toBeUndefined()
  })

})
