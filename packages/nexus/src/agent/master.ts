import { existsSync, readFileSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import type { AgentCapabilities } from "../agent-platform/capabilities"
import { detectAgentCapabilities } from "../agent-platform/capabilities"
import { classifyAdaptiveIntent, type AdaptiveIntent } from "../agent-platform/adaptive-intent"
import { missingVerifiedFeatures, type CapabilityRegistry } from "../agent-platform/capability-registry"
import { ingestIncidentLog, type IncidentReport } from "../agent-platform/incident-response"

export type MasterTaskStatus =
  | "received"
  | "acknowledged"
  | "planning"
  | "awaiting_approval"
  | "dispatching"
  | "running"
  | "verifying"
  | "retrying"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"

export type WorkerKind = "research" | "coder" | "reviewer" | "tester" | "git" | "browser" | "web" | "android" | "docs"

export type MasterStepStatus = Exclude<MasterTaskStatus, "received" | "acknowledged" | "planning" | "paused">

export type VerificationReceipt = {
  command: string
  exitCode: number
  outputHash?: string
  capturedAt: string
}

export type MasterStep = {
  id: string
  kind: WorkerKind
  title: string
  status: MasterStepStatus
  dependsOn: string[]
  acceptanceCriteria?: string[]
  attempts: number
  maxAttempts: number
  startedAt?: string
  completedAt?: string
  error?: string
  result?: string
  changedFiles?: string[]
  verification?: string[]
  receipts?: VerificationReceipt[]
  artifacts?: string[]
  next?: string[]
}

export type MasterTask = {
  version: 1
  id: string
  objective: string
  status: MasterTaskStatus
  steps: MasterStep[]
  activeStepID?: string
  queuedInstructions: string[]
  retryCount: number
  createdAt: string
  updatedAt: string
  error?: string
}

export type WorkerRequest = {
  taskID: string
  step: MasterStep
  objective: string
  workspace: string
  queuedInstructions: string[]
  capabilities: AgentCapabilities
  signal?: AbortSignal
}

export type WorkerResult = {
  status?: "completed" | "blocked"
  summary: string
  changedFiles?: string[]
  verification?: string[]
  receipts?: VerificationReceipt[]
  artifacts?: string[]
  next?: string[]
}

export type MasterWorkerEvent = {
  taskID: string
  stepID: string
  worker: WorkerKind
  phase: "started" | "completed" | "blocked" | "retrying" | "failed"
  attempt: number
  summary?: string
}

export function createVerificationReceipt(input: {
  command: string
  exitCode: number
  output?: string
  capturedAt?: string
}): VerificationReceipt {
  return {
    command: input.command,
    exitCode: input.exitCode,
    ...(input.output ? { outputHash: createHash("sha256").update(input.output).digest("hex") } : {}),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  }
}

export type MasterHooks = {
  onStatus?: (message: string, task: MasterTask) => void
  onCheckpoint?: (task: MasterTask) => void
  onWorker?: (event: MasterWorkerEvent, task: MasterTask) => void
  onIncident?: (report: IncidentReport, task: MasterTask) => void
}

export type MasterAgentOptions = {
  workspace: string
  statePath?: string
  maxStepAttempts?: number
  requireWorkerVerification?: boolean
  autoRepair?: boolean
  maxAutoRepairs?: number
  signal?: AbortSignal
  hooks?: MasterHooks
}

export type MasterPlanStep = Pick<MasterStep, "id" | "kind" | "title" | "dependsOn"> & {
  acceptanceCriteria?: string[]
}

export type MasterPlanProvider = (
  objective: string,
) => Promise<readonly MasterPlanStep[] | undefined> | readonly MasterPlanStep[] | undefined

export function acceptanceCriteriaFor(kind: WorkerKind, title: string): string[] {
  const scope = title.trim() || kind
  if (kind === "coder") return [`${scope}: diff inspected`, `${scope}: narrowest relevant test passes`]
  if (kind === "tester")
    return [`${scope}: focused checks run with exitCode 0`, `${scope}: receipts recorded with output hashes`]
  if (kind === "reviewer") return [`${scope}: changed files listed`, `${scope}: remaining risks reported`]
  if (kind === "research") return [`${scope}: constraints and options summarized with sources`]
  if (kind === "docs") return [`${scope}: touched guides updated without unrelated edits`]
  if (kind === "git") return [`${scope}: branch and working-tree state reported`, `${scope}: no unapproved mutation`]
  if (kind === "browser")
    return [`${scope}: inspected URL, HTTP status and findings reported`, `${scope}: takeover items listed`]
  if (kind === "web" || kind === "android")
    return [`${scope}: detected target and commands reported`, `${scope}: PASS/FAIL per command with receipts`]
  return [`${scope}: completion evidence recorded`]
}

function withAcceptanceCriteria(steps: Array<Pick<MasterStep, "id" | "kind" | "title" | "dependsOn">>): MasterPlanStep[] {
  return steps.map((step) => ({ ...step, acceptanceCriteria: acceptanceCriteriaFor(step.kind, step.title) }))
}

export async function suggestMasterStepsWithPlanner(
  objective: string,
  planner?: MasterPlanProvider,
): Promise<MasterPlanStep[]> {
  if (planner) {
    const planned = await planner(objective)
    if (planned && planned.length > 0) {
      return planned.map((step) => ({
        ...step,
        dependsOn: [...step.dependsOn],
        acceptanceCriteria: step.acceptanceCriteria ?? acceptanceCriteriaFor(step.kind, step.title),
      }))
    }
  }
  return withAcceptanceCriteria(suggestMasterSteps(objective))
}

export function suggestAdaptiveMasterPlan(input: {
  objective: string
  capabilities?: AgentCapabilities
  registry?: CapabilityRegistry
}): {
  intent: AdaptiveIntent
  steps: MasterPlanStep[]
  missingFeatures: string[]
} {
  const capabilities = input.capabilities ?? detectAgentCapabilities()
  const intent = classifyAdaptiveIntent(input.objective, capabilities)
  return {
    intent,
    steps: withAcceptanceCriteria(suggestMasterSteps(input.objective)),
    missingFeatures: input.registry ? missingVerifiedFeatures(input.registry, intent) : [],
  }
}

export function replanFailedMasterStep(input: {
  step: Pick<MasterStep, "id" | "kind" | "title" | "status" | "error" | "next">
}): MasterPlanStep[] {
  if (input.step.status !== "failed" && input.step.status !== "blocked") return []
  const repairID = `${input.step.id}-repair`
  const repairTitle = `Repair ${input.step.title}${input.step.error ? `: ${input.step.error.slice(0, 160)}` : ""}`
  const verifyTitle = `Verify repaired ${input.step.title}`
  return [
    {
      id: repairID,
      kind: input.step.kind === "tester" ? "coder" : input.step.kind,
      title: repairTitle,
      dependsOn: [input.step.id],
      acceptanceCriteria: acceptanceCriteriaFor(
        input.step.kind === "tester" ? "coder" : input.step.kind,
        repairTitle,
      ),
    },
    {
      id: `${input.step.id}-verify`,
      kind: "tester",
      title: verifyTitle,
      dependsOn: [repairID],
      acceptanceCriteria: acceptanceCriteriaFor("tester", verifyTitle),
    },
  ]
}

export function suggestMasterSteps(objective: string): Array<Pick<MasterStep, "id" | "kind" | "title" | "dependsOn">> {
  const normalized = objective.trim().toLowerCase()
  const steps: Array<Pick<MasterStep, "id" | "kind" | "title" | "dependsOn">> = []
  const add = (id: string, kind: WorkerKind, title: string, dependsOn: string[] = []) =>
    steps.push({ id, kind, title, dependsOn })

  if (/research|investigate|analy[sz]e|compare|find out|documentation|docs|reference/.test(normalized)) {
    add("research", "research", "Research the task and constraints")
  }
  if (/browser|website|web page|login|click|scrape|crawl/.test(normalized)) {
    add("browser", "browser", "Inspect or operate the browser task", steps.length ? [steps.at(-1)!.id] : [])
  }
  if (/web app|website|frontend|backend|api|server|deploy/.test(normalized)) {
    add("web", "web", "Run and inspect the web application", steps.length ? [steps.at(-1)!.id] : [])
  }
  if (/android|apk|mobile|gradle|adb|termux/.test(normalized)) {
    add("android", "android", "Build and test the Android target", steps.length ? [steps.at(-1)!.id] : [])
  }
  if (/git|github|commit|branch|pull request|\bpr\b|repository|repo/.test(normalized)) {
    add("git", "git", "Review and prepare the Git/GitHub changes", steps.length ? [steps.at(-1)!.id] : [])
  }
  if (/fix|bug|debug|implement|build|refactor|edit|code|feature|change/.test(normalized) || steps.length === 0) {
    add("coder", "coder", "Implement the required code changes", steps.length ? [steps.at(-1)!.id] : [])
  }
  add("review", "reviewer", "Review the diff and diagnose remaining risks", [steps.at(-1)!.id])
  add("test", "tester", "Run focused verification and regression tests", [steps.at(-1)!.id])
  if (/readme|documentation|docs|guide|release/.test(normalized)) {
    add("docs", "docs", "Update project documentation", [steps.at(-1)!.id])
  }
  return steps
}

const ACTIVE_STATUSES = new Set<MasterTaskStatus>([
  "received",
  "acknowledged",
  "planning",
  "dispatching",
  "running",
  "verifying",
  "retrying",
])
const RISKY_ACTION =
  /(^|\s)(sudo|rm|rmdir|del|format|mkfs|git\s+push|git\s+reset\s+--hard|npm\s+publish|pnpm\s+publish|gradle\s+publish)(\s|$)|password|api[_ -]?key|token|cookie|login|payment|captcha|2fa/i

function now() {
  return new Date().toISOString()
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function dependencySatisfied(step: MasterStep, dependency: string, task: MasterTask): boolean {
  const status = task.steps.find((item) => item.id === dependency)?.status
  return status === "completed" || (step.id.endsWith("-repair") && (status === "failed" || status === "blocked"))
}

function isStepResolved(step: MasterStep, task: MasterTask): boolean {
  if (step.status === "completed") return true
  if (step.status !== "failed" && step.status !== "blocked") return false
  const repair = task.steps.find((item) => item.id === `${step.id}-repair`)
  const verify = task.steps.find((item) => item.id === `${step.id}-verify`)
  if (!repair || !verify || verify.status !== "completed") return false
  return repair.status === "completed" || isStepResolved(repair, task)
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMasterTask(value: unknown): value is MasterTask {
  if (!isRecord(value)) return false
  return (
    value.version === 1 &&
    typeof value.id === "string" &&
    typeof value.objective === "string" &&
    Array.isArray(value.steps) &&
    Array.isArray(value.queuedInstructions)
  )
}

export function isRiskyAction(input: string): boolean {
  return RISKY_ACTION.test(input)
}

export function defaultMasterStatePath(workspace: string): string {
  return process.env.NEXUS_MASTER_STATE_PATH || join(workspace, ".nexus", "master-task.json")
}

export class MasterAgent {
  private readonly options: Required<Pick<MasterAgentOptions, "workspace">> & Omit<MasterAgentOptions, "workspace">
  private task?: MasterTask

  constructor(options: MasterAgentOptions) {
    this.options = options
  }

  get current(): MasterTask | undefined {
    return this.task ? clone(this.task) : undefined
  }

  async create(objective: string): Promise<MasterTask> {
    const text = objective.trim()
    if (!text) throw new Error("Master task objective cannot be empty")
    const timestamp = now()
    this.task = {
      version: 1,
      id: `task_${randomUUID()}`,
      objective: text,
      status: "acknowledged",
      steps: [],
      queuedInstructions: [],
      retryCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.checkpoint()
    this.status("Got it — Master Agent is planning the task")
    return this.snapshot()
  }

  async resume(): Promise<MasterTask | undefined> {
    const path = this.statePath()
    if (!existsSync(path)) return undefined
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
      if (!isMasterTask(parsed)) return undefined
      this.task = parsed
      if (ACTIVE_STATUSES.has(parsed.status)) {
        parsed.status = "paused"
        parsed.updatedAt = now()
        await this.checkpoint()
        this.status("Recovered the last Master Agent checkpoint; task is paused safely")
      }
      return this.snapshot()
    } catch {
      return undefined
    }
  }

  async run(objective: string, dispatcher: (request: WorkerRequest) => Promise<WorkerResult>): Promise<MasterTask> {
    const existing = await this.resume()
    if (!existing || ["completed", "failed", "cancelled"].includes(existing.status)) {
      await this.create(objective)
      await this.autoPlan()
    } else {
      if (objective.trim() && objective.trim() !== existing.objective.trim()) await this.enqueueInstruction(objective)
      if (existing.steps.length === 0) await this.autoPlan()
      await this.transition("dispatching")
    }
    return this.executePlan(dispatcher)
  }

  async autoPlan(planner?: MasterPlanProvider): Promise<MasterTask> {
    const task = this.requireTask()
    return this.plan(await suggestMasterStepsWithPlanner(task.objective, planner))
  }
  async replanFailedStep(stepID: string): Promise<MasterTask> {
    const task = this.requireTask()
    const step = task.steps.find((item) => item.id === stepID)
    if (!step) throw new Error(`Master step not found: ${stepID}`)
    const followUps = replanFailedMasterStep({ step })
    const additions = followUps.filter((item) => !task.steps.some((existing) => existing.id === item.id))
    if (additions.length === 0) return this.snapshot()
    task.steps.push(
      ...additions.map((item) => ({
        ...item,
        status: "dispatching" as const,
        attempts: 0,
        maxAttempts: this.options.maxStepAttempts ?? 2,
      })),
    )
    task.status = "dispatching"
    task.error = undefined
    task.updatedAt = now()
    await this.checkpoint()
    this.status(`Queued repair and verification for failed step ${stepID}`, task)
    return this.snapshot()
  }

  async plan(steps: MasterPlanStep[]): Promise<MasterTask> {
    const task = this.requireTask()
    task.status = "planning"
    task.steps = steps.map((step) => ({
      ...step,
      status: "dispatching",
      dependsOn: [...step.dependsOn],
      acceptanceCriteria: step.acceptanceCriteria
        ? [...step.acceptanceCriteria]
        : acceptanceCriteriaFor(step.kind, step.title),
      attempts: 0,
      maxAttempts: this.options.maxStepAttempts ?? 2,
    }))
    task.updatedAt = now()
    await this.checkpoint()
    return this.snapshot()
  }

  async enqueueInstruction(instruction: string): Promise<MasterTask> {
    const text = instruction.trim()
    if (!text) return this.snapshot()
    const task = this.requireTask()
    task.queuedInstructions.push(text)
    task.updatedAt = now()
    await this.checkpoint()
    this.status("Queued your instruction; the active step will continue safely")
    return this.snapshot()
  }

  async executePlan(dispatcher: (request: WorkerRequest) => Promise<WorkerResult>): Promise<MasterTask> {
    const task = this.requireTask()
    if (task.steps.length === 0) {
      task.status = "blocked"
      task.error = "Cannot execute a Master plan with no steps"
      await this.checkpoint()
      return this.snapshot()
    }

    const autoRepair = this.options.autoRepair ?? true
    const maxAutoRepairs = Math.max(0, this.options.maxAutoRepairs ?? 3)
    let autoRepairs = 0

    while (true) {
      if (this.options.signal?.aborted) {
        task.status = "cancelled"
        task.error = "Master task cancelled by the caller"
        task.activeStepID = undefined
        task.updatedAt = now()
        await this.checkpoint()
        return this.snapshot()
      }
      const next = task.steps.find(
        (step) =>
          step.status !== "completed" &&
          step.status !== "failed" &&
          step.status !== "blocked" &&
          step.dependsOn.every((dependency) => dependencySatisfied(step, dependency, task)),
      )
      if (!next) {
        if (task.steps.some((step) => step.status === "failed" && !isStepResolved(step, task)))
          return this.snapshot()
        if (task.steps.every((step) => isStepResolved(step, task))) {
          task.status = "completed"
          task.error = undefined
          task.activeStepID = undefined
          task.updatedAt = now()
          await this.checkpoint()
          return this.snapshot()
        }
        if (task.steps.some((step) => step.status === "blocked")) return this.snapshot()
        task.status = "blocked"
        task.error = "No executable Master step remains; dependencies may be cyclic or invalid"
        await this.checkpoint()
        return this.snapshot()
      }

      const result = await this.executeStep(next.id, dispatcher)
      if (result.status !== "failed" && result.status !== "blocked") continue
      if (!autoRepair || autoRepairs >= maxAutoRepairs) return result
      const terminal = this.requireTask().steps.find((step) => step.id === next.id)
      if (!terminal || (terminal.status !== "failed" && terminal.status !== "blocked")) continue
      const before = this.requireTask().steps.length
      await this.replanFailedStep(terminal.id)
      if (this.requireTask().steps.length === before) return this.snapshot()
      autoRepairs += 1
      this.status(`Auto-repair ${autoRepairs}/${maxAutoRepairs} queued for step ${terminal.id}`)
    }
  }

  async executeStep(stepID: string, worker: (request: WorkerRequest) => Promise<WorkerResult>): Promise<MasterTask> {
    const task = this.requireTask()
    const step = task.steps.find((item) => item.id === stepID)
    if (!step) throw new Error(`Unknown Master Agent step: ${stepID}`)
    if (step.dependsOn.some((dependency) => !dependencySatisfied(step, dependency, task))) {
      task.status = "blocked"
      task.error = `Dependencies are incomplete for step ${stepID}`
      await this.checkpoint()
      return this.snapshot()
    }

    task.activeStepID = step.id
    task.status = "running"
    step.status = "running"
    step.startedAt ??= now()
    task.updatedAt = now()
    await this.checkpoint()

    const maxAttempts = Math.max(1, step.maxAttempts)
    while (step.attempts < maxAttempts) {
      step.attempts += 1
      try {
        this.options.hooks?.onWorker?.(
          {
            taskID: task.id,
            stepID: step.id,
            worker: step.kind,
            phase: "started",
            attempt: step.attempts,
          },
          this.snapshot(),
        )
        const result = await worker({
          taskID: task.id,
          step: clone(step),
          objective: task.objective,
          workspace: this.options.workspace,
          queuedInstructions: [...task.queuedInstructions],
          capabilities: detectAgentCapabilities(),
          signal: this.options.signal,
        })
        const effectiveResult =
          (this.options.requireWorkerVerification ?? true) &&
          result.status !== "blocked" &&
          !result.verification?.length &&
          !result.receipts?.length
            ? {
                ...result,
                status: "blocked" as const,
                summary: "Worker did not provide verification evidence; step remains blocked.",
              }
            : result
        step.status = effectiveResult.status === "blocked" ? "blocked" : "completed"
        step.completedAt = effectiveResult.status === "blocked" ? undefined : now()
        step.result = effectiveResult.summary
        step.changedFiles = effectiveResult.changedFiles ? [...effectiveResult.changedFiles] : undefined
        step.verification = effectiveResult.verification ? [...effectiveResult.verification] : undefined
        step.receipts = effectiveResult.receipts ? structuredClone(effectiveResult.receipts) : undefined
        step.artifacts = effectiveResult.artifacts ? [...effectiveResult.artifacts] : undefined
        step.next = effectiveResult.next ? [...effectiveResult.next] : undefined
        task.status =
          effectiveResult.status === "blocked"
            ? "blocked"
            : task.steps.every((item) => item.status === "completed")
              ? "completed"
              : "dispatching"
        if (effectiveResult.status === "blocked") task.error = effectiveResult.summary
        task.activeStepID = undefined
        task.retryCount = 0
        task.updatedAt = now()
        this.options.hooks?.onWorker?.(
          {
            taskID: task.id,
            stepID: step.id,
            worker: step.kind,
            phase: effectiveResult.status === "blocked" ? "blocked" : "completed",
            attempt: step.attempts,
            summary: effectiveResult.summary,
          },
          this.snapshot(),
        )
        await this.checkpoint()
        return this.snapshot()
      } catch (error) {
        if (this.options.signal?.aborted) {
          step.status = "cancelled"
          step.error = "Worker cancelled by the caller"
          task.status = "cancelled"
          task.error = step.error
          task.activeStepID = undefined
          task.updatedAt = now()
          await this.checkpoint()
          return this.snapshot()
        }
        const message = safeError(error)
        const repeatedError = step.error === message
        step.error = message
        task.retryCount += 1
        task.updatedAt = now()
        if (repeatedError || step.attempts >= maxAttempts) {
          step.status = "failed"
          task.status = "failed"
          task.error = repeatedError
            ? `Step ${step.id} stopped after the same error repeated: ${step.error}`
            : `Step ${step.id} failed after ${step.attempts} attempts: ${step.error}`
          const failedTask = this.snapshot()
          this.options.hooks?.onIncident?.(ingestIncidentLog(`[worker:${step.kind}] ${step.error}`), failedTask)
          this.options.hooks?.onWorker?.(
            {
              taskID: task.id,
              stepID: step.id,
              worker: step.kind,
              phase: "failed",
              attempt: step.attempts,
              summary: step.error,
            },
            failedTask,
          )
          await this.checkpoint()
          return this.snapshot()
        }
        this.options.hooks?.onWorker?.(
          {
            taskID: task.id,
            stepID: step.id,
            worker: step.kind,
            phase: "retrying",
            attempt: step.attempts,
            summary: step.error,
          },
          this.snapshot(),
        )
        step.status = "retrying"
        task.status = "retrying"
        await this.checkpoint()
        this.status(`Step ${step.id} failed; retrying with bounded recovery`, task)
        step.status = "running"
        task.status = "running"
        await this.checkpoint()
      }
    }

    return this.snapshot()
  }

  async transition(status: MasterTaskStatus, error?: string): Promise<MasterTask> {
    const task = this.requireTask()
    task.status = status
    task.error = error
    task.updatedAt = now()
    await this.checkpoint()
    return this.snapshot()
  }

  async checkpoint(): Promise<void> {
    const task = this.requireTask()
    const path = this.statePath()
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(task, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    await rename(temporary, path)
    this.options.hooks?.onCheckpoint?.(this.snapshot())
  }

  private snapshot(): MasterTask {
    return clone(this.requireTask())
  }

  private requireTask(): MasterTask {
    if (!this.task) throw new Error("No active Master Agent task")
    return this.task
  }

  private statePath(): string {
    return this.options.statePath ?? defaultMasterStatePath(this.options.workspace)
  }

  private status(message: string, task = this.task): void {
    if (task) this.options.hooks?.onStatus?.(message, this.snapshot())
  }
}
