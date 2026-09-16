---
name: systematic-debugging
description: Use when debugging any issue - apply structured root cause analysis before proposing fixes
os: [linux, macos, windows, termux]
---

# Systematic Debugging Skill

## Process

### 1. Reproduce
- Can you consistently reproduce the issue?
- What are the exact steps?
- What is the expected vs actual behavior?

### 2. Gather data
- Check logs, error messages, stack traces
- Review recent changes (git diff, recent commits)
- Check monitoring/metrics for anomalies
- Verify environment (config, secrets, dependencies)

### 3. Hypothesize
- List all possible root causes (no filtering yet)
- Rank by likelihood and impact
- Identify the minimal test to confirm/reject each

### 4. Test
- Run the minimal test for each hypothesis
- Binary search the codebase if needed
- Check dependencies and upstream services

### 5. Fix
- Address the root cause, not the symptom
- Add a regression test
- Update monitoring/alerting if needed
- Document the fix in AGENTS.md or LEARNINGS.md

## Anti-patterns to avoid
- Changing multiple things at once
- Skipping reproduction steps
- Ignoring error messages
- Blaming without evidence
