use std::process::ExitCode;

use octomus_launcher_prototype::cli::runtime::runtime_info;

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
