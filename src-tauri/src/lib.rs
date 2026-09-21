// The desktop shell.
//
// Deliberately thin. Everything Pentra does happens in the web app this
// window hosts; the only native concerns are the ones a browser tab
// cannot cover: remembering the window, and replacing itself with a
// newer build. See src/lib/updater.ts for the update flow.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
