# Contributing

Use Node.js 24 and pnpm 10.32.1. Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` before submitting changes. Install Chromium with `pnpm exec playwright install chromium`. On macOS also run `pnpm setup:desktop` and `pnpm test:desktop` for desktop changes.

Keep changes focused, describe observable before/after behavior, and include the relevant validation. Do not add placeholder runtime implementations that report success. Real-provider tests must be labelled separately from mocks and must never silently pass when credentials or binaries are absent. Never commit user data or secrets. Contributions are licensed under Apache-2.0.
