// The desktop shell.
//
// Still thin. Everything Pentra does happens in the web app this window
// hosts; the native side only covers what a browser tab cannot:
// remembering the window, replacing itself with a newer build, and —
// added here — staying alive in the tray so notifications arrive while
// the window is shut.
//
// See src/lib/updater.ts for the update flow and src/lib/desktop.ts for
// the notification and tray flow.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

/// The two pieces of native state the window's close button depends on.
struct Shell {
    /// Whether the X hides to the tray instead of quitting. Settings
    /// owns this; the frontend pushes the value down at startup and
    /// whenever it changes.
    close_to_tray: AtomicBool,

    /// Set immediately before a real quit. Without it, "Quit Pentra"
    /// from the tray menu fires the same CloseRequested event as the X
    /// and gets swallowed by the hide-to-tray branch below — the app
    /// would hide instead of exiting and the menu item would look
    /// broken.
    quitting: AtomicBool,
}

impl Default for Shell {
    fn default() -> Self {
        Self {
            close_to_tray: AtomicBool::new(true),
            quitting: AtomicBool::new(false),
        }
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // All three, in this order. `show` alone leaves a minimised
        // window minimised, and without `set_focus` it comes back
        // behind whatever game is running.
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Settings calls this so the X can be made to quit outright.
#[tauri::command]
fn set_close_to_tray(state: tauri::State<'_, Shell>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

/// The unread count, shown as the tray tooltip.
///
/// A count drawn onto the tray icon itself would be better, but that
/// means shipping a second icon and swapping between them, and a badge
/// that goes stale is worse than no badge. The tooltip is honest and
/// cheap.
#[tauri::command]
fn set_unread(app: tauri::AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id("tray") {
        let text = match count {
            0 => "Pentra".to_string(),
            1 => "Pentra — 1 unread".to_string(),
            n => format!("Pentra — {n} unread"),
        };
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Bring the window back, for when somebody clicks through from a
/// notification.
#[tauri::command]
fn focus_app(app: tauri::AppHandle) {
    show_main(&app);
}

#[cfg(desktop)]
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Pentra", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Pentra", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Pentra")
        .menu(&menu)
        // Windows convention: left click opens the app, right click
        // opens the menu. Show the menu on left click too and there is
        // no way to just click the thing to open it.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => {
                app.state::<Shell>().quitting.store(true, Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Shell::default())
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            set_unread,
            focus_app
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let shell = window.state::<Shell>();
                if shell.close_to_tray.load(Ordering::Relaxed)
                    && !shell.quitting.load(Ordering::Relaxed)
                {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_window_state::StateFlags;

                // Listed one by one rather than `all()`, because
                // VISIBLE must not be in here.
                //
                // The plugin restores every flag it saved, and with
                // close-to-tray the window is hidden when the app
                // exits. Save VISIBLE and the next launch faithfully
                // restores "hidden": Pentra starts, puts nothing on
                // screen, and looks broken. Size, position and
                // maximised are what anyone actually wants remembered.
                app.handle().plugin(
                    tauri_plugin_window_state::Builder::default()
                        .with_state_flags(
                            StateFlags::SIZE
                                | StateFlags::POSITION
                                | StateFlags::MAXIMIZED,
                        )
                        .build(),
                )?;

                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;

                // The argument is what Windows passes back when it
                // launches us at sign-in, which is how we know to start
                // in the tray rather than throwing a window at somebody
                // who is still logging in.
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec!["--autostart"]),
                ))?;

                build_tray(app.handle())?;

                // The window is created hidden (see tauri.conf.json) so
                // an autostarted launch never flashes a window on its
                // way to the tray. Every other launch shows it here.
                if !std::env::args().any(|arg| arg == "--autostart") {
                    show_main(app.handle());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
