# Agent Loop Contract

This file documents the machine-readable agent loop contract in [loop.json](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/contract/loop.json).

The JSON file is the machine-readable source of truth.
The sibling Rust module [mod.rs](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/contract/mod.rs) is not a duplicate specification; it is the typed loader, validator, and query API used by the runtime.

## Why this exists

The current harness implementation already emits statuses, reasoning, tool calls, and final states, but some execution stages are still implicit or collapsed into a single streaming model pass. The JSON contract makes the intended decision surface explicit:

- which stage the run is in
- which actor owns that stage
- which tools are allowed in that stage
- which decisions are valid in that stage
- which stages may follow next

## Stages

The contract currently defines these stages:

- `preparing`
- `reasoning`
- `planning`
- `tool-selection`
- `awaiting-approval`
- `executing`
- `verifying`
- `completed`
- `failed`
- `cancelled`

## How to use it

Use the JSON as the source of truth when:

- reviewing whether the harness is making the right decisions
- deciding what the model is allowed to do at each point in the loop
- building UI that shows stage-by-stage execution
- validating whether a tool call is legal in the current stage
- designing retries, approval pauses, and verification behavior

## Important note

This contract is intentionally stricter and clearer than the current runtime implementation. That is by design. It is meant to define the target orchestration model so the prompt, harness, tool handling, and UI can converge on the same loop semantics over time.
