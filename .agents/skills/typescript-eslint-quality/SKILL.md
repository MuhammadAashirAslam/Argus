---
name: typescript-eslint-quality
description: >-
  Strict TypeScript typechecking and ESLint code-quality standards for ARGUS internal packages and target repository verification stages (§21). Use when configuring linting, fixing type errors, or executing static analysis pipeline stages.
---

# TypeScript & ESLint Quality Skill

## Purpose & PRD Alignment (§21)

This skill governs:

1. **ARGUS Codebase Quality**: Strict TypeScript compiler checks (`tsc --noEmit`) and ESLint rules across all packages and agents.
2. **Verification Agent Pipeline**: Running ESLint and `tsc` as the "Syntax/AST" and "Lint" pipeline stages against target repositories.

---

## 1. Strict TypeScript Standards

All `tsconfig.json` configurations in ARGUS must inherit from strict compiler options:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `isolatedModules: true`
- `moduleResolution: "bundler"` or `"NodeNext"`

### Typecheck Command

To verify type correctness across the monorepo without emitting JavaScript:

```sh
pnpm turbo run typecheck
# or package-level:
npx tsc --noEmit
```

---

## 2. ESLint Standards (`@typescript-eslint`)

- Use ESLint Flat Config (`eslint.config.js` or `eslint.config.mjs`).
- Enforce explicit return types on exported package boundaries.
- Disallow unhandled promises and floating async calls:
  - `@typescript-eslint/no-floating-promises: "error"`
  - `@typescript-eslint/await-thenable: "error"`
- Disallow `any` usage without explicit typed suppression justification:
  - `@typescript-eslint/no-explicit-any: "error"`

---

## 3. Verification Sandbox Lint Stage (§21)

When the Verification Agent checks a target repository:

1. Run ESLint with JSON format: `npx eslint . --format=json --output-file=lint-results.json`.
2. Convert lint errors/warnings into `Evidence` objects with `type: "STATIC_ANALYSIS"`.
3. Highlight exact file paths, start lines, and suggested rule fixes.
