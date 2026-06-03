pub mod dark;
pub mod light;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ThemeKind {
    Dark,
    Light,
}

pub struct Theme {
    kind: ThemeKind,
    visuals: egui::Visuals,
}

impl Theme {
    pub fn from_preference(kind: ThemeKind) -> Self {
        let visuals = match kind {
            ThemeKind::Dark => dark::build_visuals(),
            ThemeKind::Light => light::build_visuals(),
        };
        Self { kind, visuals }
    }

    pub fn kind(&self) -> ThemeKind {
        self.kind
    }

    pub fn apply(&self, ctx: &egui::Context) {
        ctx.set_visuals(self.visuals.clone());
    }
}
