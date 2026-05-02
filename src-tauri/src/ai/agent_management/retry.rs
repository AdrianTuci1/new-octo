#![allow(dead_code)]

use std::{
    future::Future,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const MAX_ATTEMPTS: usize = 3;
pub const INITIAL_BACKOFF: Duration = Duration::from_millis(500);
pub const BACKOFF_FACTOR: f32 = 2.0;
pub const BACKOFF_JITTER: f32 = 0.3;

pub fn duration_with_jitter(base: Duration, jitter_fraction: f32) -> Duration {
    let jitter = base.mul_f32(jitter_fraction);
    if jitter.is_zero() {
        return base;
    }

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos() as u128)
        .unwrap_or_default();
    let jitter_nanos = jitter.as_nanos().max(1);
    let offset = Duration::from_nanos((nanos % jitter_nanos) as u64);

    if nanos % 2 == 0 {
        base.saturating_sub(offset)
    } else {
        base + offset
    }
}

pub fn is_transient_http_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504)
}

pub fn is_transient_reqwest_error(error: &reqwest::Error) -> bool {
    error.is_timeout()
        || error.is_connect()
        || error.status().is_some_and(is_transient_http_status)
}

pub async fn with_bounded_retry<T, E, F, Fut, P>(
    operation: &str,
    mut attempt_fn: F,
    should_retry: P,
) -> Result<T, E>
where
    E: std::fmt::Display,
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    P: Fn(&E) -> bool,
{
    let mut delay = INITIAL_BACKOFF;

    for attempt in 1..=MAX_ATTEMPTS {
        match attempt_fn().await {
            Ok(value) => return Ok(value),
            Err(error) if attempt >= MAX_ATTEMPTS || !should_retry(&error) => return Err(error),
            Err(error) => {
                println!(
                    "[AI] {operation}: attempt {attempt}/{MAX_ATTEMPTS} failed: {error}"
                );
                tokio::time::sleep(duration_with_jitter(delay, BACKOFF_JITTER)).await;
                delay = delay.mul_f32(BACKOFF_FACTOR);
            }
        }
    }

    unreachable!("retry loop should return before exhausting attempts")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jitter_keeps_duration_near_base() {
        let base = Duration::from_millis(1000);
        let jittered = duration_with_jitter(base, 0.3);
        assert!(jittered >= Duration::from_millis(700));
        assert!(jittered <= Duration::from_millis(1300));
    }

    #[test]
    fn identifies_retryable_status_codes() {
        assert!(is_transient_http_status(reqwest::StatusCode::TOO_MANY_REQUESTS));
        assert!(is_transient_http_status(reqwest::StatusCode::BAD_GATEWAY));
        assert!(!is_transient_http_status(reqwest::StatusCode::BAD_REQUEST));
    }
}
