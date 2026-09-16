---
name: test-driven-development
description: Use when writing new code - write tests first, then implementation, then refactor
os: [linux, macos, windows, termux]
---

# Test-Driven Development Skill

## When to use
- Writing new features or functions
- Adding new tests to existing code
- Refactoring with safety net

## Process

### 1. Red - Write a failing test
- Write the test before any implementation
- Run it to confirm it fails
- Test one behavior at a time

### 2. Green - Write minimal implementation
- Write the simplest code to pass the test
- Don't optimize yet
- Make sure all tests pass

### 3. Refactor - Clean up
- Remove duplication
- Improve names and structure
- Keep tests green

## Guidelines
- One assertion per test (when possible)
- Test behavior, not implementation
- Use descriptive test names
- Mock external dependencies
- Test edge cases and error paths

## Output format
```typescript
// Test first
describe('functionName', () => {
  test('handles normal case', () => {
    // ...
  })
  test('handles edge case', () => {
    // ...
  })
})

// Then implementation
export function functionName(input: Type): Type {
  // minimal implementation
}
```
