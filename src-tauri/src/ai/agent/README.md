# Agent Module

This directory contains the local Octomus agent runtime, its execution contract, and the provider-specific runtimes that can drive the agent loop.

## Layout

- [mod.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/mod.rs)
  Public entry point and re-exports for the agent subsystem.
- [commands.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/commands.rs)
  Starts new agent runs, resolves the selected runtime, and wires Tauri commands to harness execution.
- [continuation.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/continuation.rs)
  Resumes runs after approvals or external tool results.
- [harness.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/harness.rs)
  Shared harness trait, event sink, and runtime execution context.
- [runtime.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/runtime.rs)
  In-memory state machine that applies stage events against the validated loop contract.
- [types.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/types.rs)
  Shared request, response, run snapshot, and event payload types.
- [sources.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/sources.rs)
  Model source discovery and source-model parsing.
- [cli_harness.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/cli_harness.rs)
  Delegate harness for CLI-backed sources such as Codex and Claude Code.
- [scripted](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/scripted)
  Local scripted fallback harness and plan helpers.
- [evals](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/evals/README.md)
  Test-only model-backed eval harness for complex multi-turn scenarios such as workspace search, multi-file edits, cloud launch, and skill-assisted flows.
- [contract](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/contract)
  The stage contract for the agent loop. `loop.json` is the source of truth; `mod.rs` loads and validates it.
- [providers](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/providers)
  Provider-specific runtimes and helpers.

## Provider Runtimes

The former `openai` module was renamed conceptually into `providers/compatible` because it is not OpenAI-only. It is the runtime for HTTP providers that implement an OpenAI-compatible chat/function-calling surface, including:

- OpenAI
- OpenRouter
- Google's OpenAI-compatible endpoint
- custom compatible endpoints

See:

- [providers/mod.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/providers/mod.rs)
- [providers/compatible/mod.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/providers/compatible/mod.rs)
- [providers/compatible/harness](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/providers/compatible/harness)

## Contract vs Runtime

There are two layers on purpose:

- [contract/loop.json](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/contract/loop.json)
  Declarative contract for stages, tools, and valid transitions.
- [runtime.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/runtime.rs)
  Executable state machine that enforces the contract at runtime.

This is not duplication. The JSON defines the model. The Rust code loads, validates, and executes against it.

## Compatible Harness Structure

The OpenAI-compatible runtime is split into focused pieces:

- `harness/executor.rs`: stage-by-stage execution loop
- `harness/provider.rs`: provider request and stream handling
- `harness/actions.rs`: tool-call handling and external-tool transitions
- `harness/control.rs`: stage control markers and stage instructions
- `harness/messages.rs`: assistant/tool/system message helpers
- `harness/context.rs`: message bundle construction and workspace context injection
- `harness/resume.rs`: resume normalization and execution-state syncing
- `harness/parser.rs`: provider delta parsing
- `harness/thinking.rs`: hidden reasoning stream handling
- `harness/types.rs`: internal harness structs

## Practical Rule

When adding new agent behavior:

1. Update the contract in `contract/loop.json` first if stage semantics change.
2. Update `runtime.rs` only if new events, stages, or tool policies are needed.
3. Add provider-specific behavior under `providers/...`, not in the root `agent/` directory.
4. Keep `mod.rs` files thin and prefer submodules once logic stops being self-evident.
5. Put complex agent evals under `evals/`, not inside provider harness unit tests.
