#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod db;
mod drivers;
mod security;
mod storage;

use commands::ActiveConnections;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex, RwLock};

// 创建文件菜单
fn create_file_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "文件",
        true,
        &[
            &MenuItem::with_id(app, "new-connection", "新建连接", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(
                app,
                "open-connection",
                "打开连接",
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "save-connection", "保存", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, "save-as", "另存为...", true, Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "import", "导入", true, Some("CmdOrCtrl+I"))?,
            &MenuItem::with_id(app, "export", "导出", true, Some("CmdOrCtrl+E"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

// 创建编辑菜单
fn create_edit_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "编辑",
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
            &MenuItem::with_id(
                app,
                "find-replace",
                "查找/替换...",
                true,
                Some("CmdOrCtrl+F"),
            )?,
        ],
    )
}

// 创建视图菜单
fn create_view_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "查看",
        true,
        &[
            &MenuItem::with_id(app, "refresh", "刷新", true, Some("F5"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "zoom-in", "放大", true, Some("CmdOrCtrl+Plus"))?,
            &MenuItem::with_id(app, "zoom-out", "缩小", true, Some("CmdOrCtrl+-"))?,
            &MenuItem::with_id(app, "zoom-reset", "实际大小", true, Some("CmdOrCtrl+0"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "toggle-fullscreen", "全屏切换", true, Some("F11"))?,
        ],
    )
}

// 创建连接菜单
fn create_connection_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "连接",
        true,
        &[
            &MenuItem::with_id(
                app,
                "connect-selected",
                "连接所选",
                true,
                Some("CmdOrCtrl+Shift+C"),
            )?,
            &MenuItem::with_id(app, "disconnect", "断开连接", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "new-query", "新建查询", true, Some("CmdOrCtrl+Q"))?,
            &MenuItem::with_id(
                app,
                "execute-query",
                "执行查询",
                true,
                Some("CmdOrCtrl+Enter"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "close-all", "关闭所有连接", true, None::<&str>)?,
        ],
    )
}

// 创建工具菜单
fn create_tools_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "工具",
        true,
        &[
            &MenuItem::with_id(app, "settings", "选项/设置...", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "data-sync", "数据同步...", true, None::<&str>)?,
            &MenuItem::with_id(app, "backup", "备份数据库...", true, None::<&str>)?,
            &MenuItem::with_id(app, "restore", "恢复数据库...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "model-designer", "模型设计器...", true, None::<&str>)?,
        ],
    )
}

// 创建窗口菜单
fn create_window_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &MenuItem::with_id(app, "new-tab", "新建标签页", true, Some("CmdOrCtrl+T"))?,
            &MenuItem::with_id(app, "close-tab", "关闭标签页", true, Some("CmdOrCtrl+W"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "next-tab",
                "切换到下一个标签页",
                true,
                Some("CmdOrCtrl+Tab"),
            )?,
            &MenuItem::with_id(
                app,
                "previous-tab",
                "切换到上一个标签页",
                true,
                Some("CmdOrCtrl+Shift+Tab"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "cascade", "层叠", true, None::<&str>)?,
            &MenuItem::with_id(app, "tile-horizontally", "水平平铺", true, None::<&str>)?,
            &MenuItem::with_id(app, "tile-vertically", "垂直平铺", true, None::<&str>)?,
        ],
    )
}

// 创建帮助菜单
fn create_help_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "帮助",
        true,
        &[
            &MenuItem::with_id(app, "contents", "文档", true, Some("F1"))?,
            &MenuItem::with_id(app, "search-help", "搜索...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "check-updates", "检查更新...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "About iDBlink", "关于 i-dblink", true, None::<&str>)?,
        ],
    )
}

// 创建 macOS 应用菜单
#[cfg(target_os = "macos")]
fn create_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Submenu<R>, tauri::Error> {
    Submenu::with_items(
        app,
        "i-dblink",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("i-dblink"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "preferences", "偏好设置...", true, Some("Cmd+,"))?,
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
            let rt = tokio::runtime::Runtime::new()
                .expect("Failed to create Tokio runtime - system resources may be exhausted");
            let storage = rt.block_on(async {
                storage::init_storage(&app_handle)
                    .await
                    .expect("Failed to initialize storage")
            });

            app.manage(Mutex::new(Some(storage)));
            // 性能优化：使用 RwLock 替代 Mutex 提升并发性能
            app.manage(RwLock::new(ActiveConnections::new()));

            println!("Storage and menu initialized successfully");
            Ok(())
        })
        .on_menu_event(|app, event| {
            // 处理菜单事件
            match event.id.as_ref() {
                "quit" => {
                    std::process::exit(0);
                }
                "preferences" | "settings" | "options" => {
                    // 发送事件到前端打开设置
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("menu-action", "options");
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
            commands::connect_database,
            commands::disconnect_database,
            commands::get_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::get_groups,
            commands::save_group,
            commands::delete_group,
            commands::get_tables,
            commands::get_tables_categorized,
            commands::get_table_structure,
            commands::get_databases,
            commands::get_columns,
            commands::get_indexes,
            commands::get_foreign_keys,
            commands::execute_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
