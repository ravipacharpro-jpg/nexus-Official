---
name: codebase-inspection
description: Use when exploring a codebase - understand structure, dependencies, and patterns before making changes
os: [linux, macos, windows, termux]
---

# Codebase Inspection Skill

## When to use
- Starting work on a new codebase
- Understanding project structure before making changes
- Onboarding to a new repository

## Process

### 1. High-level overview
- Read README, CONTRIBUTING, AGENTS.md
- Identify the tech stack and architecture
- Understand the build/test/deploy pipeline

### 2. Directory structure
- Map the key directories and their purposes
- Identify entry points and configuration files
- Find the main source directories

### 3. Dependency graph
- Identify core dependencies
- Find external service integrations
- Check for deprecated or vulnerable dependencies

### 4. Code patterns
- Find common patterns (error handling, logging, testing)
- Identify conventions (naming, formatting, imports)
- Locate domain-specific patterns

### 5. Hotspots
- Recently changed files (git log)
- Complex or fragile areas
- Areas with low test coverage

## Output format
```markdown
## Codebase: {Name}

### Tech Stack
- Language: ...
- Framework: ...
- Database: ...
- Deploy: ...

### Key Directories
| Directory | Purpose |
|-----------|---------|
| ... | ... |

### Entry Points
- ...

### Conventions
- ...

### Areas to Watch
- ...
```
