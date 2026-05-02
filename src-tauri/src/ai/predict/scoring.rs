use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictionScore {
    pub frequency_weight: f32,
    pub pwd_weight: f32,
    pub recency_weight: f32,
    pub complexity_bonus: f32,
    pub total_score: f32,
}

impl PredictionScore {
    pub fn calculate(
        command: &str,
        frequency: usize,
        is_same_dir: bool,
        hours_since_execution: f32,
    ) -> Self {
        // Frequency weight: logarithmic scale to avoid saturation
        let frequency_weight = (frequency as f32).ln().max(0.0) * 10.0;
        
        // PWD weight: very high to prioritize current context
        let pwd_weight = if is_same_dir { 100.0 } else { 0.0 };
        
        // Recency weight: decays over time (simple linear decay for 1 week)
        let recency_weight = (168.0 - hours_since_execution).max(0.0) / 168.0 * 20.0;
        
        // Complexity bonus: longer commands are more likely to be what the user wants to complete
        let word_count = command.split_whitespace().count();
        let complexity_bonus = if word_count > 1 { (word_count as f32) * 15.0 } else { 0.0 };

        let total_score = frequency_weight + pwd_weight + recency_weight + complexity_bonus;
        
        Self {
            frequency_weight,
            pwd_weight,
            recency_weight,
            complexity_bonus,
            total_score,
        }
    }
}
