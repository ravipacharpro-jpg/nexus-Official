import { detectTaskProfile, isTermuxRuntime, resolveRuntimeProfile, RUNTIME_PROFILES } from "@/runtime/task-profile"

describe("task profile device detection", () => {
  test("detects Termux from Android environment markers", () => {
    expect(isTermuxRuntime({ TERMUX_VERSION: "0.118" })).toBe(true)
    expect(isTermuxRuntime({ PREFIX: "/data/data/com.termux/files/usr" })).toBe(true)
  })

  test("uses conservative fast profile on Termux", () => {
    const profile = detectTaskProfile({ env: { TERMUX_VERSION: "0.118" }, memoryBytes: 16 * 1024 ** 3, cpuCount: 12 })
    expect(profile.name).toBe("fast")
    expect(profile.maxParallel).toBe(2)
  })

  // platform() is read from the real OS, so desktop-shape assertions only run off-device.
  const desktopOnly = process.platform === "android" ? test.skip : test

  desktopOnly("uses deep profile only for a powerful desktop", () => {
    expect(detectTaskProfile({ env: {}, memoryBytes: 32 * 1024 ** 3, cpuCount: 16 }).name).toBe("deep")
    expect(detectTaskProfile({ env: {}, memoryBytes: 4 * 1024 ** 3, cpuCount: 4 }).name).toBe("balanced")
  })

  test("honors explicit profile override", () => {
    expect(
      detectTaskProfile({ env: { NEXUS_DEVICE_PROFILE: "local" }, memoryBytes: 32 * 1024 ** 3, cpuCount: 16 }).name,
    ).toBe("local")
  })
})

describe("runtime profile resolution", () => {
  test("explicit config wins over detection", () => {
    expect(resolveRuntimeProfile("headless", { TERMUX_VERSION: "0.118" })).toBe("headless")
    expect(resolveRuntimeProfile("web", { TERMUX_VERSION: "0.118" })).toBe("web")
  })

  test("Termux self-detects; explicit config always wins", () => {
    expect(resolveRuntimeProfile(undefined, { TERMUX_VERSION: "0.118" })).toBe("termux")
    expect(resolveRuntimeProfile(undefined, {})).toBe(isTermuxRuntime({}) ? "termux" : "web")
    expect(resolveRuntimeProfile("bogus", {})).toBe(isTermuxRuntime({}) ? "termux" : "web")
  })

  test("every runtime profile declares full or task-only autonomy", () => {
    for (const profile of Object.values(RUNTIME_PROFILES)) {
      expect(["full", "task-only"]).toContain(profile.autonomy)
      expect(profile.description.length).toBeGreaterThan(0)
    }
  })
})
