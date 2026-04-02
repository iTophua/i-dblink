use crate::db::{ConnectionGroup, DbConnection};
use crate::drivers::db_pool::DbPool;
use crate::drivers::{
    connect_by_type, execute_query_by_type, get_columns_by_type, get_tables_by_type,
};
use crate::security::PasswordManager;
use crate::storage::Storage;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to iDBLink!", name)
}

/// 前端传输的连接对象（包含密码字段）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInput {
    pub id: Option<String>,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub database: Option<String>,
    pub group_id: Option<String>,
}

/// 返回给前端的连接对象（不包含密码）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionOutput {
    pub id: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub database: Option<String>,
    pub group_id: Option<String>,
    pub status: String,
}

impl From<DbConnection> for ConnectionOutput {
    fn from(conn: DbConnection) -> Self {
        Self {
            id: conn.id,
            name: conn.name,
            db_type: conn.db_type,
            host: conn.host,
            port: conn.port as u16,
            username: conn.username,
            database: conn.database,
            group_id: conn.group_id,
            status: "disconnected".to_string(),
        }
    }
}

/// 分组输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupInput {
    pub id: Option<String>,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub parent_id: Option<String>,
}

/// 分组输出
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupOutput {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub parent_id: Option<String>,
}

impl From<ConnectionGroup> for GroupOutput {
    fn from(group: ConnectionGroup) -> Self {
        Self {
            id: group.id,
            name: group.name,
            icon: group.icon,
            color: group.color,
            parent_id: group.parent_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub table_name: String,
    pub table_type: String,
    pub row_count: Option<i64>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub column_name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_key: Option<String>,
    pub column_default: Option<String>,
    pub extra: Option<String>,
    pub comment: Option<String>,
}

/// 表信息
#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<Vec<TableInfo>, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    // 获取连接配置（含密码）
    let (conn_config, _) = storage
        .get_connection_with_password(&connection_id)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?
        .ok_or_else(|| "Connection not found".to_string())?;

    println!(
        "Getting tables from {}:{}:{}",
        conn_config.db_type, conn_config.host, conn_config.port
    );

    // 使用统一驱动接口创建连接池并获取表信息
    let password = PasswordManager::get_password(&conn_config.id)
        .unwrap_or_default()
        .unwrap_or_else(|| "".to_string());

    let pool = connect_by_type(&conn_config.db_type, &conn_config, &password)
        .await
        .map_err(|e| e)?;
    let tables = get_tables_by_type(&conn_config.db_type, &pool).await?;
    Ok(tables)
}

/// 获取列信息
#[tauri::command]
pub async fn get_columns(
    connection_id: String,
    table_name: String,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<Vec<ColumnInfo>, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    // 获取连接配置（含密码）
    let (conn_config, _) = storage
        .get_connection_with_password(&connection_id)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?
        .ok_or_else(|| "Connection not found".to_string())?;

    println!(
        "Getting columns for {}.{} from {}:{}:{}",
        conn_config.database.as_deref().unwrap_or("main"),
        table_name,
        conn_config.db_type,
        conn_config.host,
        conn_config.port
    );

    let password = PasswordManager::get_password(&conn_config.id)
        .unwrap_or_default()
        .unwrap_or_else(|| "".to_string());

    let pool = connect_by_type(&conn_config.db_type, &conn_config, &password)
        .await
        .map_err(|e| e)?;

    let cols = get_columns_by_type(&conn_config.db_type, &pool, &table_name).await?;
    Ok(cols)
}

/// 执行 SQL 查询
#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<QueryResult, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    // 获取连接配置（含密码）
    let (conn_config, _) = storage
        .get_connection_with_password(&connection_id)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?
        .ok_or_else(|| "Connection not found".to_string())?;

    println!(
        "Executing query on {}:{}:{} - {}",
        conn_config.db_type, conn_config.host, conn_config.port, sql
    );

    let password = PasswordManager::get_password(&conn_config.id)
        .unwrap_or_default()
        .unwrap_or_else(|| "".to_string());

    let pool = connect_by_type(&conn_config.db_type, &conn_config, &password)
        .await
        .map_err(|e| e)?;

    let result = execute_query_by_type(&conn_config.db_type, &pool, &sql).await?;
    Ok(result)
}

/// SQL 查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: Option<u64>,
    pub error: Option<String>,
}

/// 测试数据库连接
#[tauri::command]
pub async fn test_connection(
    db_type: &str,
    host: &str,
    port: u16,
    username: &str,
    _password: &str,
) -> Result<bool, String> {
    println!(
        "Testing connection to {}:{}:{} as {}",
        db_type, host, port, username
    );
    // TODO: 实现实际的连接测试逻辑
    Ok(true)
}

/// 获取所有连接
#[tauri::command]
pub async fn get_connections(
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<Vec<ConnectionOutput>, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    match storage.get_connections().await {
        Ok(connections) => Ok(connections
            .into_iter()
            .map(ConnectionOutput::from)
            .collect()),
        Err(e) => Err(format!("Failed to get connections: {}", e)),
    }
}

/// 保存连接
#[tauri::command]
pub async fn save_connection(
    input: ConnectionInput,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<ConnectionOutput, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    match input.id {
        Some(id) => {
            // 更新现有连接
            let existing = storage
                .get_connection_with_password(&id)
                .await
                .map_err(|e| format!("Failed to get connection: {}", e))?
                .ok_or_else(|| "Connection not found".to_string())?;

            let mut updated = existing.0;
            updated.name = input.name.clone();
            updated.db_type = input.db_type.clone();
            updated.host = input.host.clone();
            updated.port = input.port as i32;
            updated.username = input.username.clone();
            updated.database = input.database.clone();
            updated.group_id = input.group_id.clone();

            storage
                .update_connection(&id, updated.clone(), input.password.as_deref())
                .await
                .map_err(|e| format!("Failed to update connection: {}", e))?;

            Ok(ConnectionOutput {
                id,
                name: updated.name,
                db_type: updated.db_type,
                host: updated.host,
                port: updated.port as u16,
                username: updated.username,
                database: updated.database,
                group_id: updated.group_id,
                status: "disconnected".to_string(),
            })
        }
        None => {
            // 创建新连接
            let new_conn = DbConnection::new(
                input.name,
                input.db_type,
                input.host,
                input.port as i32,
                input.username,
                input.database,
                input.group_id,
            );

            let output_id = new_conn.id.clone();
            let output_name = new_conn.name.clone();
            let output_db_type = new_conn.db_type.clone();
            let output_host = new_conn.host.clone();
            let output_port = new_conn.port;
            let output_username = new_conn.username.clone();
            let output_database = new_conn.database.clone();
            let output_group_id = new_conn.group_id.clone();

            storage
                .save_connection(new_conn, input.password.as_deref())
                .await
                .map_err(|e| format!("Failed to save connection: {}", e))?;

            Ok(ConnectionOutput {
                id: output_id,
                name: output_name,
                db_type: output_db_type,
                host: output_host,
                port: output_port as u16,
                username: output_username,
                database: output_database,
                group_id: output_group_id,
                status: "disconnected".to_string(),
            })
        }
    }
}

/// 删除连接
#[tauri::command]
pub async fn delete_connection(
    id: String,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<(), String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    storage
        .delete_connection(&id)
        .await
        .map_err(|e| format!("Failed to delete connection: {}", e))
}

/// 获取所有分组
#[tauri::command]
pub async fn get_groups(
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<Vec<GroupOutput>, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    match storage.get_groups().await {
        Ok(groups) => Ok(groups.into_iter().map(|g| g.into()).collect()),
        Err(e) => Err(format!("Failed to get groups: {}", e)),
    }
}

/// 保存分组
#[tauri::command]
pub async fn save_group(
    input: GroupInput,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<GroupOutput, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    match input.id {
        Some(id) => {
            // 更新现有分组
            let mut group = storage
                .get_groups()
                .await
                .map_err(|e| format!("Failed to get groups: {}", e))?
                .into_iter()
                .find(|g| g.id == id)
                .ok_or_else(|| "Group not found".to_string())?;

            group.name = input.name.clone();
            group.icon = input.icon.clone();
            group.color = input.color.clone();
            group.parent_id = input.parent_id.clone();

            storage
                .save_group(group)
                .await
                .map_err(|e| format!("Failed to update group: {}", e))?;

            Ok(GroupOutput {
                id,
                name: input.name,
                icon: input.icon,
                color: input.color,
                parent_id: input.parent_id,
            })
        }
        None => {
            // 创建新分组
            let new_group = ConnectionGroup::new(
                input.name.clone(),
                input.icon.clone(),
                input.color.clone(),
                input.parent_id.clone(),
            );

            let output_id = new_group.id.clone();

            storage
                .save_group(new_group)
                .await
                .map_err(|e| format!("Failed to save group: {}", e))?;

            Ok(GroupOutput {
                id: output_id,
                name: input.name,
                icon: input.icon,
                color: input.color,
                parent_id: input.parent_id,
            })
        }
    }
}

/// 删除分组
#[tauri::command]
pub async fn delete_group(
    id: String,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<(), String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    if id == "default" {
        return Err("Cannot delete default group".to_string());
    }

    storage
        .delete_group(&id)
        .await
        .map_err(|e| format!("Failed to delete group: {}", e))
}
