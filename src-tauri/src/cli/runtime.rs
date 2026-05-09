use serde::Serialize;

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
