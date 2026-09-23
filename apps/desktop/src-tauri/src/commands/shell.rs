use log::info;
use tokio::process::Command;

/// Commands permitted to execute via `run_system_command`.
///
/// This is the Rust-side allowlist — a second line of defence that enforces
/// restrictions even if the TypeScript security layer is bypassed.
/// Only read-only / informational commands are permitted here.
const ALLOWLIST: &[&str] = &[
    "echo",
    "whoami",
    "hostname",
    "ipconfig",
    "tasklist",
    "systeminfo",
    "ver",
];

#[derive(serde::Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    /// The command that was executed, echoed back for the audit log.
    pub command: String,
}

/// run_system_command
///
/// Executes a shell command after checking it against the Rust-side allowlist.
/// Called only after the TypeScript PermissionManager + SafetyValidator have
/// already cleared the request (ToolExecutor pipeline).
///
/// Returns a `CommandOutput` struct — never panics, never executes unlisted commands.
#[tauri::command]
pub async fn run_system_command(
    command: String,
    args: Option<Vec<String>>,
) -> Result<CommandOutput, String> {
    let cmd_normalized = command.trim().to_lowercase();
    let mut matched_cmd = None;

    for &allowed in ALLOWLIST {
        if allowed == cmd_normalized {
            matched_cmd = Some(allowed);
            break;
        }
    }

    let cmd_to_run = match matched_cmd {
        Some(c) => c,
        None => {
            return Err(format!(
                "[Rezel] Command '{}' is not in the Rust-side allowlist.",
                command
            ));
        }
    };

    let args_vec = args.unwrap_or_default();
    info!("[shell] execute: {} {:?}", cmd_to_run, args_vec);

    let output = Command::new(cmd_to_run)
        .args(&args_vec)
        .output()
        .await
        .map_err(|e| format!("Failed to spawn '{}': {}", cmd_to_run, e))?;

    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        success: output.status.success(),
        command: format!("{} {}", command, args_vec.join(" "))
            .trim()
            .to_string(),
    })
}
