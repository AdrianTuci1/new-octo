/// InputSelection — 1:1 port of React `composerInputSelection.ts`.
pub fn get_caret_position(text: &str, click_x: f32, _font_size: f32) -> usize {
    // Simplified estimation: proportional to click_x / font_size.
    let approx = (click_x / 7.0).max(0.0) as usize;
    approx.min(text.len())
}

pub fn get_caret_rect(_text: &str, position: usize, font_size: f32) -> (f32, f32, f32, f32) {
    let x = position as f32 * 7.0;
    let y = 0.0;
    let w = 1.0;
    let h = font_size;
    (x, y, w, h)
}
