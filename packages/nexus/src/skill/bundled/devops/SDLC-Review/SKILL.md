---
name: sdlc-review
description: Use when reviewing code for production readiness - security, performance, error handling, logging, and deployment concerns
os: [linux, macos, windows, termux]
---

# SDLC Review Skill

## When to use
- Before merging any PR or committing to main
- When the user asks for a code review, security audit, or production readiness check
- When deploying infrastructure or changing critical paths

## Review checklist

### Security
- Input validation on all user-facing endpoints
- No hardcoded secrets, API keys, or credentials
- Auth middleware present on protected routes
- SQL injection / XSS / CSRF protections
- Dependency audit (outdated packages, known CVEs)

### Reliability
- Error boundaries and graceful degradation
- Retry logic with exponential backoff for external calls
- Timeout handling on all I/O operations
- Circuit breakers for downstream services
- Health check endpoints

### Observability
- Structured logging with correlation IDs
- Metrics for latency, error rates, throughput
- Alerting on critical failures
- Distributed tracing headers propagated

### Performance
- Database query optimization (N+1, missing indexes)
- Caching strategy (cache invalidation, TTL)
- Connection pooling
- Payload size limits and streaming for large responses

### Deployment
- Migration strategy (backward compatible, rollback plan)
- Environment parity (dev/staging/prod)
- Feature flags for risky changes
- Smoke tests post-deploy

## Output format
Return a structured review with:
1. Critical issues (must fix before merge)
2. Warnings (should fix)
3. Suggestions (nice to have)
4. Summary verdict: APPROVED / CHANGES_REQUESTED / BLOCKED
