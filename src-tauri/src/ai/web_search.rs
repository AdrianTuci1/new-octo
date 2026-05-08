use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchRequest {
    pub query: String,
    pub max_results: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResponse {
    pub query: String,
    pub results: Vec<WebSearchResult>,
    pub source: String,
}

pub async fn web_search(request: WebSearchRequest) -> Result<WebSearchResponse, String> {
    let query = request.query.trim();
    if query.is_empty() {
        return Err("query cannot be empty".to_string());
    }

    let max_results = request.max_results.unwrap_or(5).clamp(1, 10);
    let client = reqwest::Client::builder()
        .user_agent("Octomus/1.0 (+https://octomus.local)")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Failed to build web search client: {error}"))?;

    let response = client
        .get("https://html.duckduckgo.com/html/")
        .query(&[("q", query), ("kl", "us-en")])
        .send()
        .await
        .map_err(|error| format!("Web search request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Web search returned HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|error| format!("Failed to read web search response: {error}"))?;

    let results = parse_duckduckgo_results(&html, max_results);

    Ok(WebSearchResponse {
        query: query.to_string(),
        results,
        source: "duckduckgo".to_string(),
    })
}

fn parse_duckduckgo_results(html: &str, max_results: usize) -> Vec<WebSearchResult> {
    let title_re = match Regex::new(
        r#"(?s)<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#,
    ) {
        Ok(regex) => regex,
        Err(_) => return Vec::new(),
    };
    let snippet_re = match Regex::new(r#"(?s)class="[^"]*\bresult__snippet\b[^"]*"[^>]*>(.*?)</"#) {
        Ok(regex) => regex,
        Err(_) => return Vec::new(),
    };

    let title_matches = title_re
        .captures_iter(html)
        .filter_map(|capture| {
            let href = capture.get(1)?.as_str();
            let title = clean_html_fragment(capture.get(2)?.as_str());
            let url = normalize_result_url(href)?;
            Some((title, url, capture.get(0)?.end()))
        })
        .collect::<Vec<_>>();

    let mut results = Vec::new();
    for (index, (title, url, end_index)) in title_matches.into_iter().enumerate() {
        if results.len() >= max_results {
            break;
        }

        let snippet = title_re
            .captures_iter(&html[end_index..])
            .next()
            .and_then(|next_title| {
                let next_start = next_title.get(0)?.start();
                let search_slice = &html[end_index..end_index + next_start];
                snippet_re
                    .captures(search_slice)
                    .and_then(|capture| capture.get(1))
                    .map(|value| clean_html_fragment(value.as_str()))
            })
            .or_else(|| {
                let search_slice = &html[end_index..];
                snippet_re
                    .captures(search_slice)
                    .and_then(|capture| capture.get(1))
                    .map(|value| clean_html_fragment(value.as_str()))
            });

        results.push(WebSearchResult {
            title,
            url,
            snippet,
        });

        if index + 1 >= max_results {
            break;
        }
    }

    results
}

fn clean_html_fragment(value: &str) -> String {
    let without_tags = Regex::new(r"<[^>]+>")
        .ok()
        .map(|regex| regex.replace_all(value, "").to_string())
        .unwrap_or_else(|| value.to_string());

    without_tags
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .trim()
        .to_string()
}

fn normalize_result_url(raw: &str) -> Option<String> {
    let candidate = if let Some(stripped) = raw.strip_prefix("//") {
        format!("https:{stripped}")
    } else {
        raw.to_string()
    };

    let url = reqwest::Url::parse(&candidate).ok()?;
    if let Some(actual) = url
        .query_pairs()
        .find(|(key, _)| key == "uddg")
        .map(|(_, value)| value.into_owned())
    {
        return Some(actual);
    }

    Some(url.to_string())
}
