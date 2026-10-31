# Phase 1 requirements and acceptance

Source: the project's V1.2 shared conversation, supplied by the owner on 2026-10-31. Its visible requirements were reviewed before implementation. The links labelled `hybrid-agent-studio-plan.zip`, `CODEX_PHASE1.md` and `GROUP_COLLAB_AND_SHARED_VM.md` had no downloadable target in the public shared page; the original files were not obtained. This document records requirements recovered from visible conversation text, not a claim to have read unavailable attachments.

| Requirement                                                         | Implemented / proof                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Independent public repository, Apache-2.0, TypeScript pnpm monorepo | Source, license, lockfile and CI workflow                                                                                             |
| Next.js and Mac Electron development app                            | Production build, browser flow, actual Electron startup test                                                                          |
| Multiple Bots, edit/delete, role/model/runtime                      | Core persistence and UI                                                                                                               |
| Multiple groups, membership, exact @ addressing                     | Validated API, UI, routing tests                                                                                                      |
| Task assignment, handoff, prior result, states                      | Core tests, model delegation tests, browser handoff                                                                                   |
| Muse official supported integration                                 | SDK 1.4.14, native CLI detection, verified read-only profile, streaming, cleanup; mocked contract tests                               |
| Real Muse inference                                                 | **Not accepted yet**: development machine has no Muse binary/authorization. `pnpm test:muse:live` is the explicit real-provider check |
| Unified local/cloud execution boundary                              | AgentRuntime and separate target field; local implementations only; cloud fails explicitly                                            |
| Safety approval                                                     | Per-Muse-task user decision, replay rejection, model handoff gated, audit records, read-only SDK boundary                             |
| Persistence                                                         | Atomic JSON state, restart recovery, serialized concurrent mutations; single API process only                                         |
| One shared persistent VM / isolated operation sessions              | **Not implemented**. Design invariant and explicit UI status only. Phase 2/3 delivery                                                 |
| Basic tests and CI                                                  | Vitest, Playwright browser + Electron, Linux/macOS CI                                                                                 |

Success does not mean full Grok Bot parity. No arbitrary command execution, actual VM, remote desktop, cloud lifecycle, background daemon, unbounded autonomy, or subscription workaround is delivered.
