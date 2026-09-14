<!--
  Built-in skill. Name and description are registered in code at
  packages/core/src/plugin/skill.ts
  and packages/nexus/src/skill/index.ts (APP_SPEC_SKILL_NAME and
  APP_SPEC_SKILL_DESCRIPTION). The body below becomes the skill's content.
-->

# App Spec Ritual

Use when the user wants any app or website built, of any size: landing page,
dashboard, web app, or mobile app. Never write app code before the spec is
approved. Guessing the user's demand is the most expensive mistake: a wrong
screen costs hundreds of lines, a right question costs one sentence.

## Step 1: Ask at most 5 questions

Use the question tool. Ask only questions whose answers change the design:
screens/routes needed, data and auth, must-NOT-haves, look-and-feel reference
("aisi wali"), and stack only when it is not obvious. Rank by consequence,
most consequential first. Small tasks (single landing page, single screen):
max 2 questions, then proceed.

## Step 2: Write the spec file

Write `spec.md` in the project root with exactly these sections:

- Goal: one paragraph, what success looks like.
- Users: who uses it.
- Screens/Routes: each screen, its purpose, its key elements.
- Data: entities stored, auth needed or not.
- Must-haves: numbered list, each machine-checkable where possible.
- Non-goals: what you will explicitly NOT build.
- Stack: framework, styling, hosting target.
- Acceptance: checklist where every item is verifiable by a command
  (build passes, typecheck passes, route renders, button works).

Mark status at the top: `status: draft`. Never mark `approved` yourself.

## Step 3: Get approval through plan_exit

Present a short summary (screens count, stack, biggest risk), then call
`plan_exit`. The user approves the plan; only their Yes flips the spec to
`approved` and starts the build. A No means refine the spec, never start code.

## Step 4: Build against the spec

Every build step maps to a spec item. When the user asks for something outside
the spec mid-build, stop and ask: spec amendment (update spec.md, quick
re-approval) or follow-up task. Silent scope creep is a defect.

## Fast path

Single landing page or single screen: 2 questions max, inline mini-spec in
chat instead of spec.md, still end with plan_exit approval. The gate stays;
only the paperwork shrinks.
