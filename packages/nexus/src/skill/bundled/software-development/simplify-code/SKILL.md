---
name: simplify-code
description: Use when refactoring - remove complexity, reduce lines, improve readability
os: [linux, macos, windows, termux]
---

# Simplify Code Skill

## When to use
- Refactoring existing code
- Reducing complexity
- Improving readability

## Process

### 1. Identify complexity
- Find nested conditionals
- Find long functions (>50 lines)
- Find duplicate logic
- Find magic numbers and strings

### 2. Apply simplifications
- Extract functions with clear names
- Replace conditionals with polymorphism or lookup tables
- Remove dead code and comments that state the obvious
- Use early returns to reduce nesting

### 3. Verify
- All tests still pass
- No behavior change
- Readability improved

## Anti-patterns
- Over-engineering simple problems
- Adding abstraction layers for one-off use
- Commenting bad code instead of fixing it
- Premature optimization
