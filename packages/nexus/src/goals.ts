// Session objectives. Goals live in session metadata so they travel with the
// session, survive restarts, and show up in audits. Pure helpers stay
// service-free; thin CLI/service call sites do the reads and writes.

export type GoalStatus = "active" | "done" | "dropped"

export interface Goal {
  id: string
  title: string
  status: GoalStatus
  createdAt: number
  updatedAt: number
  notes?: string
}

const GOALS_KEY = "nexusGoals"

export function makeGoal(title: string, now = Date.now()): Goal {
  return {
    id: `goal_${now.toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`,
    title: title.trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  }
}

export function readGoals(metadata: unknown): Goal[] {
  if (!metadata || typeof metadata !== "object" || !(GOALS_KEY in metadata)) return []
  const raw = (metadata as Record<string, unknown>)[GOALS_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is Goal => {
    if (!item || typeof item !== "object") return false
    const goal = item as Record<string, unknown>
    return (
      typeof goal.id === "string" &&
      typeof goal.title === "string" &&
      (goal.status === "active" || goal.status === "done" || goal.status === "dropped") &&
      typeof goal.createdAt === "number" &&
      typeof goal.updatedAt === "number"
    )
  })
}

export function stageGoal(metadata: Record<string, unknown> | undefined, goal: Goal): Record<string, unknown> {
  const goals = readGoals(metadata).filter((item) => item.id !== goal.id)
  return { ...(metadata ?? {}), [GOALS_KEY]: [...goals, goal] }
}

export function closeGoal(goals: Goal[], id: string, status: Exclude<GoalStatus, "active">, now = Date.now()): Goal[] {
  return goals.map((goal) => (goal.id === id ? { ...goal, status, updatedAt: now } : goal))
}

export function summarizeGoals(goals: Goal[]): string {
  const active = goals.filter((goal) => goal.status === "active")
  if (goals.length === 0) return "No goals set for this session."
  const lines = goals.map(
    (goal) =>
      `- [${goal.status === "active" ? " " : "x"}] ${goal.title} (${goal.id})${goal.notes ? ` — ${goal.notes}` : ""}`,
  )
  return [`${active.length} active of ${goals.length} goal(s):`, ...lines].join("\n")
}
