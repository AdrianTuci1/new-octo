# Tests

This repository has three main test buckets:

- JavaScript tests in [tests](/Users/adriantucicovenco/Proiecte/launcher-rs-react/tests)
- Rust unit and integration tests in [src-tauri](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri)
- model-backed tests that need credentials from `tests.env`

## Single Entry Point

Run the default non-model-backed suite with:

```bash
npm run test
```

This runs:

- `npm run test:js`
- `npm run test:rust`

## JavaScript Tests

Run all JS tests:

```bash
npm run test:js
```

Run the suites individually:

```bash
npm run test:composer-skills
npm run test:model-providers
```

## Rust Tests

Run all Rust tests in `src-tauri`:

```bash
npm run test:rust
```

Run only the integration tests from [src-tauri/tests](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/tests):

```bash
npm run test:rust:integration
```

Equivalent direct Cargo commands:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --tests
```

Run the dedicated agent eval test module:

```bash
npm run test:agent-evals
```

## Model-Backed Tests

If a test needs a model credential, keep it in `tests.env`, not `.env`.

Setup:

```bash
cp tests.env.example tests.env
```

Run any command with the test-only environment loaded:

```bash
npm run test:model-env -- cargo test --manifest-path src-tauri/Cargo.toml --tests
```

You can also wrap other model-backed commands the same way:

```bash
npm run test:model-env -- node --test tests/some-suite/*.test.mjs
```

Run the live harness eval scenarios:

```bash
npm run test:agent-evals:live
```

Those evals live under [src-tauri/src/ai/agent/evals](/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/src/ai/agent/evals) and cover:

- workspace search + file read
- multi-file edit proposals
- skill-influenced behavior
- cloud-agent launch delegation

If you want an additional LLM judge on top of deterministic assertions:

```bash
OCTOMUS_EVAL_USE_JUDGE=1 npm run test:model-env -- cargo test --manifest-path src-tauri/Cargo.toml ai::agent::evals::live -- --ignored --nocapture
```
