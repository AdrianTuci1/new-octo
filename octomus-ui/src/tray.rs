use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem},
    TrayIconBuilder,
};

pub struct TrayHandle {
    #[allow(dead_code)]
    tray_icon: tray_icon::TrayIcon,
}

impl TrayHandle {
    pub fn try_create() -> Result<Self, Box<dyn std::error::Error>> {
        let menu = Menu::new();
        let show_i = MenuItem::new("Show", true, None);
        let hide_i = MenuItem::new("Hide", true, None);
        let quit_i = MenuItem::new("Quit", true, None);
        menu.append(&show_i)?;
        menu.append(&hide_i)?;
        menu.append(&quit_i)?;

        let tray_icon = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip("Octomus")
            .build()?;

        std::thread::spawn(|| {
            MenuEvent::receiver().try_iter().for_each(|_event| {
                // TODO: handle tray menu events
            });
        });

        Ok(Self { tray_icon })
    }

    pub fn shutdown(&mut self) {
        // tray_icon is dropped automatically
    }
}
