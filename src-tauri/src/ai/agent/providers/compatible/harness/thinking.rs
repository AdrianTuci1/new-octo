use crate::ai::agent::harness::AgentEventSink;

const THINKING_START_TAG: &str = "<thinking>";
const THINKING_END_TAG: &str = "</thinking>";

#[derive(Default)]
pub(super) struct ThinkingStreamState {
    pending: String,
    inside_thinking: bool,
}

impl ThinkingStreamState {
    pub(super) fn push_content(
        &mut self,
        content: &str,
        sink: &AgentEventSink,
        streamed: &mut String,
        streamed_reasoning: &mut String,
        emit_visible_tokens: bool,
        emit_reasoning_tokens: bool,
    ) {
        if content.is_empty() {
            return;
        }

        self.pending.push_str(content);

        loop {
            if self.pending.is_empty() {
                break;
            }

            if self.inside_thinking {
                if let Some(end_idx) = self.pending.find(THINKING_END_TAG) {
                    let thinking_part = self.pending[..end_idx].to_string();
                    if !thinking_part.is_empty() {
                        streamed_reasoning.push_str(&thinking_part);
                        if emit_reasoning_tokens {
                            sink.reasoning(streamed_reasoning.clone(), true);
                        }
                    }
                    self.pending.drain(..end_idx + THINKING_END_TAG.len());
                    self.inside_thinking = false;
                    continue;
                }

                let safe_suffix_len = longest_tag_suffix_len(&self.pending, THINKING_END_TAG);
                let emit_len = self.pending.len().saturating_sub(safe_suffix_len);
                if emit_len == 0 {
                    break;
                }

                let thinking_part = self.pending[..emit_len].to_string();
                streamed_reasoning.push_str(&thinking_part);
                if emit_reasoning_tokens {
                    sink.reasoning(streamed_reasoning.clone(), false);
                }
                self.pending.drain(..emit_len);
                continue;
            }

            if let Some(start_idx) = self.pending.find(THINKING_START_TAG) {
                self.pending.drain(..start_idx + THINKING_START_TAG.len());
                self.inside_thinking = true;
                continue;
            }

            let safe_suffix_len = longest_tag_suffix_len(&self.pending, THINKING_START_TAG);
            let emit_len = self.pending.len().saturating_sub(safe_suffix_len);
            if emit_len == 0 {
                break;
            }

            let text = self.pending[..emit_len].to_string();
            streamed.push_str(&text);
            if emit_visible_tokens {
                sink.token(&text);
            }
            self.pending.drain(..emit_len);
        }
    }

    pub(super) fn finish(
        &mut self,
        sink: &AgentEventSink,
        streamed: &mut String,
        streamed_reasoning: &mut String,
        emit_visible_tokens: bool,
        emit_reasoning_tokens: bool,
    ) {
        if self.pending.is_empty() {
            return;
        }

        let pending = std::mem::take(&mut self.pending);
        if self.inside_thinking {
            streamed_reasoning.push_str(&pending);
            if emit_reasoning_tokens {
                sink.reasoning(streamed_reasoning.clone(), true);
            }
        } else {
            streamed.push_str(&pending);
            if emit_visible_tokens {
                sink.token(pending);
            }
        }
    }
}

pub(super) fn longest_tag_suffix_len(text: &str, tag: &str) -> usize {
    let mut boundaries = text.char_indices().map(|(idx, _)| idx).collect::<Vec<_>>();
    boundaries.retain(|idx| *idx < text.len());

    for start in boundaries.into_iter().rev() {
        let suffix = &text[start..];
        if !suffix.is_empty() && tag.starts_with(suffix) {
            return suffix.len();
        }
    }

    0
}
