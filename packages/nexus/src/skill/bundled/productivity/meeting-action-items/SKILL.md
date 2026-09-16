---
name: meeting-action-items
description: Use when summarizing meetings - extract action items, decisions, and follow-ups
os: [linux, macos, windows, termux]
---

# Meeting Action Items Skill

## When to use
- After a meeting (transcript or notes provided)
- Need to extract actionable items from discussions
- Tracking decisions and follow-ups

## Process

### 1. Parse input
- Meeting transcript, notes, or recording summary
- Identify attendees and roles

### 2. Extract
- **Decisions**: What was agreed upon?
- **Action items**: Who does what by when?
- **Risks**: Concerns raised that need follow-up
- **Open questions**: Things not resolved

### 3. Structure output
- Group by owner
- Prioritize by urgency
- Link to related projects/issues

## Output format
```markdown
## Meeting: {Title}
**Date**: ... | **Attendees**: ...

### Decisions
- ...

### Action Items
| Owner | Task | Deadline | Priority |
|-------|------|----------|----------|
| ... | ... | ... | ... |

### Risks
- ...

### Open Questions
- ...
```
