# Agent Evals

This submodule contains model-backed evals for the agent harness. It exists separately from the smaller unit tests under the compatible harness so we can exercise:

- multi-turn harness execution
- multi-turn user conversation toward a goal
- external tool proposals and continuations
- workspace search and file reads
- multi-file change proposals
- cloud-agent launch requests
- skill-influenced behavior

## Layout

- `runner.rs`
  Runs the real compatible harness turn-by-turn, simulates the UI continuation loop, and coordinates the outer conversation loop.
- `simulators.rs`
  Provides local tool simulators for `explore_workspace`, `read_workspace_file`, `propose_file_change`, and `launch_cloud_agent`.
- `scenarios.rs`
  Defines the live eval scenarios, goals, and turn budgets.
- `user_simulator.rs`
  Uses a second LLM to act like the user: either confirms the goal is reached or produces the next follow-up message.
- `assertions.rs`
  Enforces deterministic checks over the transcript, used tools, changed files, and final answer.
- `judge.rs`
  Optional second-LLM judge for richer scoring. Disabled by default.
- `live.rs`
  Ignored Cargo tests that run the model-backed eval scenarios.

## Running

Default deterministic tests do not run these evals.

Run the local eval unit tests and harness glue checks:

```bash
npm run test:agent-evals
```

Run the live model-backed scenarios with `tests.env` loaded:

```bash
npm run test:agent-evals:live
```

To enable the optional second-LLM judge on top of the deterministic assertions:

```bash
OCTOMUS_EVAL_USE_JUDGE=1 npm run test:model-env -- cargo test --manifest-path src-tauri/Cargo.toml ai::agent::evals::live -- --ignored --nocapture
```

Optionally override the judge model:

```bash
OCTOMUS_EVAL_USE_JUDGE=1 OCTOMUS_EVAL_JUDGE_MODEL=gpt-4o-mini npm run test:model-env -- cargo test --manifest-path src-tauri/Cargo.toml ai::agent::evals::live -- --ignored --nocapture
```

## Notes

- These evals intentionally simulate the UI-facing tools in Rust so the harness can stay under test without spinning up the full frontend.
- The second LLM can now act as a simulated user between assistant turns. Deterministic assertions still remain mandatory.
- The optional judge is separate from the simulated user so we can keep “keep the conversation moving” distinct from “score the result”.
