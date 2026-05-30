//! Model-backed agent evals for complex harness flows.
//!
//! These tests are kept in a dedicated submodule so we can exercise the real
//! harness loop with tool simulation without bloating the provider harness unit
//! tests.

mod assertions;
mod judge;
mod live;
mod runner;
mod scenarios;
mod simulators;
mod user_simulator;
mod workspace;
