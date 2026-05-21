use serde::Serialize;
use std::process::ExitCode;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub target_os: &'static str,
    pub target_arch: &'static str,
    pub supported_session_kinds: Vec<&'static str>,
    pub supported_cloud_providers: Vec<&'static str>,
}

pub fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        name: "octomus-cli",
        version: env!("CARGO_PKG_VERSION"),
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
        supported_session_kinds: vec!["local", "cloud"],
        supported_cloud_providers: vec!["custom-vm", "modal"],
    }
}

fn print_help() {
    println!(
        "\
octomus-cli

USAGE:
  octomus-cli <command>

COMMANDS:
  runtime-info   Print JSON metadata about the current headless runtime
  version        Print the CLI version
  help           Print this help message
"
    );
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);

    match args.next().as_deref() {
        Some("runtime-info") => match serde_json::to_string_pretty(&runtime_info()) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("failed to serialize runtime info: {error}");
                ExitCode::FAILURE
            }
        },
        Some("version") | Some("--version") | Some("-V") => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Some("help") | Some("--help") | Some("-h") | None => {
            print_help();
            ExitCode::SUCCESS
        }
        Some(command) => {
            eprintln!("unknown command: {command}");
            eprintln!();
            print_help();
            ExitCode::FAILURE
        }
    }
}
