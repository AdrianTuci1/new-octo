use super::config::OpenAiCompatibleConfig;
use crate::ai::agent::harness::AgentHarnessError;
use crate::ai::provider_adapter::{generate_completion, ProviderCompletionRequest};
use serde_json::json;
use std::time::Duration;

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

    let body = ProviderCompletionRequest {
        model: guardian_model.to_string(),
        messages: vec![
            json!({
                "role": "system",
                "content": guardian_system
            }),
            json!({
                "role": "user",
                "content": guardian_user
            }),
        ],
        tools: None,
        temperature: Some(0.0),
        max_tokens: Some(256),
        response_mime_type: None,
    };

    if let Ok(response) = generate_completion(&client, config, body).await {
        let trimmed = response.text.trim();
        if trimmed.eq_ignore_ascii_case("APROBAT") {
            return Ok(None);
        }
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    Ok(None)
}
