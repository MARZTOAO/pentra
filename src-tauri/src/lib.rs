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
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

// The two tray states, shipped as a matched pair at the same size so
// switching between them changes the dot and nothing else. Built by
// scripts/icons/build-tray.py from icons/icon.png; the only difference
// between the two files is a 14x14 patch in the bottom-right corner.
//
// Embedded rather than loaded from disk: the tray has to work before
// anything has had a chance to go missing, and an installed app has no
// business reading its own icons back off the filesystem.
const TRAY_PLAIN: &[u8] = include_bytes!("../icons/tray.png");
const TRAY_UNREAD: &[u8] = include_bytes!("../icons/tray-unread.png");

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

    /// Whether the tray icon is currently showing its dot. Tracked so
    /// the icon is only swapped when that flips — the unread count
    /// changes far more often than "is there anything at all".
    badge: AtomicBool,
}

impl Default for Shell {
    fn default() -> Self {
        Self {
            close_to_tray: AtomicBool::new(true),
            quitting: AtomicBool::new(false),
            badge: AtomicBool::new(false),
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

/// The unread state: a dot on the tray icon, the number in the tooltip.
///
/// THE DOT CARRIES NO NUMBER, deliberately. A Windows tray icon is 16
/// physical pixels at 100% scaling, and a digit drawn into the corner
/// of one is a smudge — rendered and looked at before deciding, along
/// with 20, 24 and 32px. Two digits were worse. So the icon answers
/// "is there anything", which is all it can legibly say, and the
/// tooltip answers "how much", which is what hovering is for.
#[tauri::command]
fn set_unread(app: tauri::AppHandle, count: u32) {
    let Some(tray) = app.tray_by_id("tray") else {
        return;
    };

    let text = match count {
        0 => "Pentra".to_string(),
        1 => "Pentra — 1 unread".to_string(),
        n => format!("Pentra — {n} unread"),
    };
    let _ = tray.set_tooltip(Some(text));

    // Only touch the icon when the dot actually flips. Going from 3
    // unread to 4 would otherwise decode a PNG and redraw the tray to
    // produce exactly the same picture.
    let wanted = count > 0;
    if app.state::<Shell>().badge.swap(wanted, Ordering::Relaxed) != wanted {
        let bytes = if wanted { TRAY_UNREAD } else { TRAY_PLAIN };
        if let Ok(icon) = Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(icon));
        }
    }
}

/// Bring the window back to the front.
///
/// NOT reachable from a toast click, which is what this was originally
/// for. tauri-plugin-notification cannot report toast clicks on
/// Windows: its desktop path builds a notify-rust notification, calls
/// show(), and registers no activation callback, so the
/// `actionPerformed` event that `onAction()` listens for is only ever
/// sent by the Android and iOS side. Doing it properly means going
/// around the plugin with tauri-winrt-notification and matching the
/// app's AppUserModelID to the installed shortcut; judged not worth
/// the fragility. Kept because the tray menu and any future
/// "jump to this" path want exactly this.
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
        // Not default_window_icon(): that is the app icon at whatever
        // size the bundler produced, so the first unread would visibly
        // resize the tray icon as well as adding the dot.
        .icon(Image::from_bytes(TRAY_PLAIN)?)
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
