---
name: git-hooks-hygiene
description: >-
  Git commit hygiene, Husky pre-commit hooks, and lint-staged enforcement for the ARGUS repository. Use when configuring pre-commit checks, troubleshooting hook failures, or structuring reviewable commits.
---

# Git Hooks & Commit Hygiene Skill

## Purpose

Enforces mechanical quality gates so that unformatted, failing, or malformed TypeScript code cannot be committed to the repository. This guarantees that every commit in ARGUS is a clean, reviewable, and reproducible unit of work.

---

## 1. Pre-Commit Pipeline Setup (Husky + lint-staged)

### `.lintstagedrc.json`

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

### `.husky/pre-commit`

```sh
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
pnpm turbo run typecheck
```

---

## 2. Commit Hygiene Guidelines

1. **Atomic Commits**: Each commit should address a single concern (e.g. `feat(agent-core): add EvidenceSchema validation`).
2. **Conventional Commits**: Use the format:
   - `feat(scope): ...`
   - `fix(scope): ...`
   - `test(scope): ...`
   - `refactor(scope): ...`
   - `docs(scope): ...`
3. **No Broken States**: `pnpm turbo run typecheck test` must pass cleanly on every branch before merging.
