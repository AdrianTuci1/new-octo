# WarpUI API Reference

## Imports
```rust
use warpui::{
    elements::{Stack, Flex, Container, Text, Icon, Hoverable, EventHandler, 
               Clipped, Scrollable, NewScrollable, Align, Border, CornerRadius,
               Empty, ConstrainedBox, ParentElement, Axis, MainAxisSize, 
               CrossAxisAlignment, MainAxisAlignment, Point, Margin, Padding,
               ChildAnchor, ParentAnchor, OffsetPositioning, DispatchEventResult},
    event::DispatchedEvent,
    AppContext, Entity, EntityId, ModelHandle, View, ViewContext, Element,
    SingletonEntity, TypedActionView,
};
use pathfinder_geometry::rect::RectF;
use pathfinder_geometry::vector::vec2f;
use pathfinder_color::ColorU;
```

## Core Patterns

### 1. View + Entity trait (every component)
```rust
pub struct MyView {
    pub label: String,
    pub count: usize,
}

impl Entity for MyView {
    type Event = MyEvent;
}

impl View for MyView {
    fn ui_name() -> &'static str { "MyView" }
    
    fn render(&self, app: &AppContext) -> impl Element {
        Container::new()
            .with_child(Text::new(&self.label))
            .with_margin(Margin::all(8.0))
    }
    
    // optional: handle events
    fn on_event(&mut self, event: &Self::Event, ctx: &mut ViewContext<Self>) {}
}
```

### 2. State with ModelHandle
```rust
pub struct ChatState {
    pub messages: Vec<Message>,
    pub is_loading: bool,
}

// In view:
let model: ModelHandle<ChatState> = app.get_singleton_model_handle();
let state = model.read();
```

### 3. Layout Elements

**Stack** → position:absolute layer
```rust
Stack::new()
    .with(Flex::column().with(/* main content */))
    .with(Container::new()... /* overlay */)
```

**Flex** → display:flex
```rust
// Row
Flex::row()
    .with_child(Sidebar::new()...)
    .with_child(MainContent::new()...)

// Column  
Flex::column()
    .with_child(Topbar::new()...)
    .with_child(Body::new()...)
```

**Container** → styled div
```rust
Container::new()
    .with_child(Text::new("hello"))
    .with_margin(Margin::all(8.0))
    .with_padding(Padding::all(12.0))
    .with_corner_radius(CornerRadius::all(6.0))
```

**Text** → label/span
```rust
Text::new("Hello World")
Text::new(&self.label)
    .with_font_size(14.0)
    .with_color(ColorU::from_rgb(0xFF, 0xFF, 0xFF))
```

### 4. Events / Interactivity
```rust
EventHandler::new(Box::new(move |_event, _ctx, _app| {
    // handle click
    DispatchEventResult::StopPropagation
}))
// OR
Hoverable::new(/* element */)
    .on_click(|| { /* handler */ })
```

### 5. Scrollable
```rust
NewScrollable::new()
    .with_axis(ScrollableAxis::Vertical)
    .with_child(Flex::column()
        .with_child(/* list items */))
```

### 6. Icons
```rust
Icon::new("icon-name")
    .with_size(16.0)
    .with_color(some_color)
```

### 7. Color / Theme
```rust 
use crate::themes::theme::{WarpTheme, Fill};
use pathfinder_color::ColorU;

// Colors are in RGBA with 0-255 range
ColorU::from_rgba(0x1A, 0x1B, 0x1C, 0xFF) // dark background
ColorU::from_rgb(0xE2, 0xE8, 0xF0) // light text
```

### 8. Modal / Overlay
```rust
Stack::new()
    .with(/* background content */)
    .with(
        Container::new()
            .with_anchor(ChildAnchor::CenterCenter)
            .with_child(/* modal content */)
    )
```

### 9. View initialization
```rust
impl MyView {
    pub fn new(ctx: &mut ViewContext<Self>) -> Self {
        // subscribe to models, register callbacks
        Self { ... }
    }
}
```

## Convention
- Views hold model handles for shared state
- Each view has Event enum for its actions
- State mutations go through ModelHandle::update()
- Use Flex for layouts, Stack for overlays
- Colors from theme system: use `app::themes::theme::WarpTheme`
