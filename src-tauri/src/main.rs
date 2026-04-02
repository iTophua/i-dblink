#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod db;
mod drivers;
mod security;
mod storage;

use tokio::sync::Mutex;
use tauri::{Manager, Emitter};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

// 创建文件菜单
fn create_file_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "new-connection", "New Connection", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(app, "open-connection", "Open Connection", true, Some("CmdOrCtrl+O"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "save-connection", "Save Connection", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, "save-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "import", "Import", true, Some("CmdOrCtrl+I"))?,
            &MenuItem::with_id(app, "export", "Export", true, Some("CmdOrCtrl+E"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

// 创建编辑菜单
fn create_edit_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "find-replace", "Find & Replace...", true, Some("CmdOrCtrl+F"))?,
        ],
    )
}

// 创建视图菜单
fn create_view_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "refresh", "Refresh", true, Some("F5"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?,
            &MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?,
            &MenuItem::with_id(app, "zoom-reset", "Reset Zoom", true, Some("CmdOrCtrl+0"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "toggle-fullscreen", "Toggle Fullscreen", true, Some("F11"))?,
        ],
    )
}

// 创建连接菜单
fn create_connection_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "Connection",
        true,
        &[
            &MenuItem::with_id(app, "connect-selected", "Connect Selected", true, Some("CmdOrCtrl+Shift+C"))?,
            &MenuItem::with_id(app, "disconnect", "Disconnect", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "new-query", "New Query", true, Some("CmdOrCtrl+Q"))?,
            &MenuItem::with_id(app, "execute-query", "Execute Query", true, Some("CmdOrCtrl+Enter"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "close-all", "Close All Connections", true, None::<&str>)?,
        ],
    )
}

// 创建工具菜单
fn create_tools_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "Tools",
        true,
        &[
            &MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "data-sync", "Data Sync...", true, None::<&str>)?,
            &MenuItem::with_id(app, "backup", "Backup Database...", true, None::<&str>)?,
            &MenuItem::with_id(app, "restore", "Restore Database...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "model-designer", "Model Designer...", true, None::<&str>)?,
        ],
    )
}

// 创建窗口菜单
fn create_window_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &MenuItem::with_id(app, "new-tab", "New Tab", true, Some("CmdOrCtrl+T"))?,
            &MenuItem::with_id(app, "close-tab", "Close Tab", true, Some("CmdOrCtrl+W"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "next-tab", "Next Tab", true, Some("CmdOrCtrl+Tab"))?,
            &MenuItem::with_id(app, "previous-tab", "Previous Tab", true, Some("CmdOrCtrl+Shift+Tab"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "cascade", "Cascade", true, None::<&str>)?,
            &MenuItem::with_id(app, "tile-horizontally", "Tile Horizontally", true, None::<&str>)?,
            &MenuItem::with_id(app, "tile-vertically", "Tile Vertically", true, None::<&str>)?,
        ],
    )
}

// 创建帮助菜单
fn create_help_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &MenuItem::with_id(app, "contents", "Contents", true, Some("F1"))?,
            &MenuItem::with_id(app, "search-help", "Search Help...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "check-updates", "Check for Updates...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "About iDBlink", "About iDBlink", true, None::<&str>)?,
        ],
    )
}

// 创建 macOS 应用菜单
#[cfg(target_os = "macos")]
fn create_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "iDBlink",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("iDBlink"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "preferences", "Preferences...", true, Some("Cmd+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

// 创建完整菜单
fn create_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let menu = Menu::new(app)?;
    
    #[cfg(target_os = "macos")]
    {
        menu.append(&create_app_menu(app)?)?;
    }
    
    menu.append(&create_file_menu(app)?)?;
    menu.append(&create_edit_menu(app)?)?;
    menu.append(&create_view_menu(app)?)?;
    menu.append(&create_connection_menu(app)?)?;
    menu.append(&create_tools_menu(app)?)?;
    menu.append(&create_window_menu(app)?)?;
    menu.append(&create_help_menu(app)?)?;
    
    Ok(menu)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 创建并设置菜单
            let menu = create_menu(&app.handle())?;
            app.set_menu(menu)?;
            
            // 在 setup 中同步初始化存储
            let app_handle = app.handle().clone();
            let rt = tokio::runtime::Runtime::new().unwrap();
            let storage = rt.block_on(async {
                storage::init_storage(&app_handle)
                    .await
                    .expect("Failed to initialize storage")
            });

            app.manage(Mutex::new(Some(storage)));
            
            println!("Storage and menu initialized successfully");
            Ok(())
        })
        .on_menu_event(|app, event| {
            // 处理菜单事件
            match event.id.as_ref() {
                "quit" => {
                    std::process::exit(0);
                }
                "preferences" | "settings" => {
                    // 发送事件到前端打开设置
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("menu-action", "settings");
                    }
                }
                "new-connection" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("menu-action", "new-connection");
                    }
                }
                _ => {
                    println!("Menu event received: {:?}", event.id);
                    // 将事件转发到前端处理
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("menu-action", event.id.as_ref());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::test_connection,
            commands::get_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::get_groups,
            commands::save_group,
            commands::delete_group,
            commands::get_tables,
            commands::get_columns,
            commands::execute_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
