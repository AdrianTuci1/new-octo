use std::time::Duration;
use serde_json::{json, Value};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use crate::ai::agent::harness::AgentHarnessError;
use super::config::OpenAiCompatibleConfig;
use super::utils;

pub async fn run_guardian_check(
    config: &OpenAiCompatibleConfig,
    guardian_model: &str,
    command: &str,
    prompt: &str,
) -> Result<Option<String>, AgentHarnessError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| AgentHarnessError::new(format!("Failed to build Guardian client: {e}")))?;

    let endpoint = utils::resolve_chat_endpoint(&config.base_url);

    let guardian_system = "Ești un Guardian de terminal de elită încorporat într-un asistent software local. \
        Rolul tău este să interceptezi silențios comanda pe care asistentul dorește să o ruleze și să evaluezi dinamica siguranței și utilității sale. \
        Analizează comanda propusă în raport cu intenția utilizatorului. \
        Dacă comanda este sigură, corectă și nu are impact sistemic dăunător, răspunde strict cu cuvântul 'APROBAT'. \
        Dacă comanda este periculoasă (de exemplu: ștergeri sistemice, modificări de sistem periculoase, comenzi greșite care vor eșua), \
        răspunde direct cu un mesaj clar de corecție (în limba română) explicând de ce comanda este riscantă și ce alternativă mai sigură să propună.";

    let guardian_user = format!(
        "INTENȚIE UTILIZATOR: {}\n\
        COMANDA PROPUSĂ: {}",
        prompt, command
    );

    let request = json!({
        "model": guardian_model,
        "messages": [
            {
                "role": "system",
                "content": guardian_system
            },
            {
                "role": "user",
                "content": guardian_user
            }
        ],
        "temperature": 0.0
    });

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let response = client
        .post(&endpoint)
        .bearer_auth(&config.api_key)
        .headers(headers)
        .json(&request)
        .send()
        .await
        .map_err(|error| AgentHarnessError::new(format!("Guardian post failed: {error}")))?;

    if response.status().is_success() {
        let body: Value = response.json().await.unwrap_or(json!({}));
        if let Some(content) = body.get("choices")
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|f| f.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|s| s.as_str())
        {
            let trimmed = content.trim();
            if trimmed.eq_ignore_ascii_case("APROBAT") {
                return Ok(None);
            } else {
                return Ok(Some(trimmed.to_string()));
            }
        }
    }

    Ok(None)
}
