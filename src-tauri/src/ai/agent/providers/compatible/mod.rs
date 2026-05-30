//! Runtime for HTTP chat providers that expose an OpenAI-compatible surface.
//!
//! This module is intentionally broader than OpenAI itself. It powers OpenAI,
//! OpenRouter, Google's compatible endpoint, and custom compatible providers.

mod config;
mod guardian;
mod harness;
mod prompt;
pub mod skills;
mod tools;
mod utils;

pub use config::{OpenAiCompatibleConfig, OpenAiCompatibleProvider};
pub use harness::OpenAiCompatibleHarness;
