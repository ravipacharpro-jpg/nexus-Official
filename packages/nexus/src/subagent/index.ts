import { Effect, Context, Schema, Layer, Option } from "effect"
import { LayerNode } from "@nexus-ai/core/effect/layer-node"
import { FSUtil } from "@nexus-ai/core/fs-util"
import { Global } from "@nexus-ai/core/global"
import { path } from "@nexus-ai/core/effect/app-node-platform"
import { randomUUID } from "crypto"

export interface SubagentConfig {
  id: string
  name: string
  workingDirectory: string
  objective: string
  maxTurns?: number
  allowedTools?: string[]
  environment?: Record<string, string>
}

export interface SubagentResult {
  id: string
  success: boolean
  output?: string
  error?: string
  turns: number
  durationMs: number
}

export interface SubagentStatus {
  id: string
  name: string
  state: "pending" | "running" | "completed" | "failed" | "cancelled"
  objective: string
  workingDirectory: string
  startedAt?: number
  completedAt?: number
  result?: SubagentResult
}

export class SubagentError extends Schema.TaggedErrorClass<SubagentError>()("SubagentError", {
  message: Schema.String,
  subagentId: Schema.String,
}) {}

export class SubagentNotFoundError extends Schema.TaggedErrorClass<SubagentNotFoundError>()("SubagentNotFoundError", {
  id: Schema.String,
}) {}

export interface SubagentInterface {
  readonly spawn: (config: SubagentConfig) => Effect.Effect<SubagentStatus, SubagentError>
  readonly getStatus: (id: string) => Effect.Effect<SubagentStatus, SubagentNotFoundError>
  readonly wait: (id: string) => Effect.Effect<SubagentResult, SubagentError | SubagentNotFoundError>
  readonly cancel: (id: string) => Effect.Effect<void, SubagentNotFoundError>
  readonly list: () => Effect.Effect<SubagentStatus[]>
  readonly cleanup: (id: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, SubagentInterface>()("@nexus/Subagent") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const crypto = yield* Crypto.Service
    const path = yield* path.Path

    const subagents = new Map<string, SubagentStatus>()

    const spawn = Effect.fn("Subagent.spawn")(function* (config: SubagentConfig) {
      const id = config.id || randomUUID()
      const status: SubagentStatus = {
        id,
        name: config.name,
        state: "pending",
        objective: config.objective,
        workingDirectory: config.workingDirectory,
      }
      subagents.set(id, status)

      // Run the subagent in the background
      Effect.runFork(
        Effect.gen(function* () {
          const startedAt = Date.now()
          status.state = "running"
          status.startedAt = startedAt
          subagents.set(id, { ...status })

          // TODO: Implement actual subagent execution
          // This would involve spawning a new agent instance with the given config
          // For now, we'll simulate a basic execution
          const result: SubagentResult = {
            id,
            success: true,
            output: `Subagent "${config.name}" completed: ${config.objective}`,
            turns: 0,
            durationMs: Date.now() - startedAt,
          }

          status.state = "completed"
          status.completedAt = Date.now()
          status.result = result
          subagents.set(id, { ...status })
        }).pipe(
          Effect.catchAll((error) => {
            const errorResult: SubagentResult = {
              id,
              success: false,
              error: error.message,
              turns: 0,
              durationMs: Date.now() - (status.startedAt || Date.now()),
            }
            status.state = "failed"
            status.completedAt = Date.now()
            status.result = errorResult
            subagents.set(id, { ...status })
          }),
        ),
      )

      return status
    })

    const getStatus = Effect.fn("Subagent.getStatus")(function* (id: string) {
      const status = subagents.get(id)
      if (!status) {
        return yield* Effect.fail(new SubagentNotFoundError({ id }))
      }
      return status
    })

    const wait = Effect.fn("Subagent.wait")(function* (id: string) {
      const status = yield* getStatus
      if (status.state === "completed" || status.state === "failed") {
        if (!status.result) {
          return yield* Effect.fail(new SubagentError({ message: "No result available", subagentId: id }))
        }
        return status.result
      }

      // Wait for completion with polling
      return yield* Effect.retry(
        Effect.gen(function* () {
          const s = yield* getStatus
          if (s.state === "completed" || s.state === "failed") {
            if (!s.result) {
              return yield* Effect.fail(new SubagentError({ message: "No result available", subagentId: id }))
            }
            return s.result
          }
          return yield* Effect.fail(new SubagentError({ message: "Still running", subagentId: id }))
        }),
        {
          times: 100,
          schedule: Effect.Schedule.spaced("1 second"),
        },
      )
    })

    const cancel = Effect.fn("Subagent.cancel")(function* (id: string) {
      const status = subagents.get(id)
      if (!status) {
        return yield* Effect.fail(new SubagentNotFoundError({ id }))
      }
      if (status.state === "running" || status.state === "pending") {
        status.state = "cancelled"
        status.completedAt = Date.now()
        subagents.set(id, { ...status })
      }
    })

    const list = Effect.fn("Subagent.list")(function* () {
      return Array.from(subagents.values()).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
    })

    const cleanup = Effect.fn("Subagent.cleanup")(function* (id: string) {
      subagents.delete(id)
    })

    return Service.of({ spawn, getStatus, wait, cancel, list, cleanup })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, path, Crypto.node],
})

export * as Subagent from "."