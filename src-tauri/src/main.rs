// Sin consola en las compilaciones de release: es una app de escritorio, no una CLI.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Nook");
}
