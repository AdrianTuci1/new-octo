use super::super::requests::CreateTerminalSessionTargetRequest;

pub fn create_session(
    _rows: u16,
    _cols: u16,
    _cwd: Option<String>,
    target: &CreateTerminalSessionTargetRequest,
) -> Result<(), String> {
    let provider = target.resolved_provider();
    let profile_id = target
        .profile_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("unspecified-profile");

    Err(format!(
        "cloud terminal transport for provider '{provider:?}' is not implemented yet (profile '{profile_id}')"
    ))
}
