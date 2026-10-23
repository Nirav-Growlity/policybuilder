# Delegation routing (orchestrator rules)

The main thread is the orchestrator. Plan, decompose, delegate, review. Do not write large code changes or run long test/debug loops in the main thread. Do small edits (a few lines in 1-2 files) directly; delegating those costs more than it saves.

## Role table (edit only this table to swap models)

| role     | providerInstanceId | model             | options                  |
|----------|--------------------|-------------------|--------------------------|
| coder    | codex              | gpt-6.1-sol       | reasoningEffort=medium   |
| computer | codex              | gpt-6.1-sol       | reasoningEffort=low      |
| ui       | claudeAgent        | claude-sonnet-5-5 | effort=medium            |
| quickfix | claudeAgent        | claude-haiku-5-5  | effort=low               |
| reviewer | claudeAgent        | claude-sonnet-5-5 | effort=high              |

- coder: features, refactors, multi-file changes, running and fixing tests.
- computer: browser and computer-use tasks, manual flow checks, screenshots.
- ui: components, layout, styling, UX polish.
- quickfix: small bug fixes, lint/type errors, renames, config tweaks.
- reviewer: reviews a delegate's diff before it is reported as done. Never the same model that wrote it.

## How to delegate

- Use `delegate_task` with the role's `providerInstanceId`, `model`, and `target.options`. Check live IDs with `orchestrator_capabilities` (use `search` for models not listed); if a model is missing, say so and fall back to the next closest role instead of silently doing the work as the orchestrator.
- Each task prompt must be self-contained: goal, files involved, acceptance criteria, what not to touch, and the project rules in CLAUDE.md that apply (delegates may not load it). Ask for a summary under 200 words, not diffs or logs.
- Independent tasks run in parallel (`mode: async`), then collect with `task_status`. Parallel tasks that may touch the same files use `isolation: "worktree"`.
- Escalate to the orchestrator only after 2 failed attempts or for design decisions.
- Keep the orchestrator context small: no pasting large files or logs into the main thread.
