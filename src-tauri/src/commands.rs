use crate::db::{ConnectionGroup, DbConnection};
use crate::sidecar::{SidecarManager, SidecarState};
use crate::storage::Storage;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;
use tokio::sync::{Mutex, RwLock};

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
            port: conn.port.max(0) as u16,
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
    pub row_count: Option<u64>,
    pub comment: Option<String>,
    pub engine: Option<String>,
    pub data_size: Option<String>,
    pub index_size: Option<String>,
    pub create_time: Option<String>,
    pub update_time: Option<String>,
    pub collation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub column_name: String,
    pub data_type: String,
    pub is_nullable: String,
    pub column_key: Option<String>,
    pub column_default: Option<String>,
    pub extra: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub index_name: String,
    pub column_name: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub seq_in_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyInfo {
    pub constraint_name: String,
    pub column_name: String,
    pub referenced_table: String,
    pub referenced_column: String,
}

/// 表列表结果（包含分类的表和视图）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TablesResult {
    pub tables: Vec<TableInfo>,
    pub views: Vec<TableInfo>,
}

/// 表结构结果（包含列、索引、外键）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableStructure {
    #[serde(default)]
    pub columns: Vec<ColumnInfo>,
    #[serde(default)]
    pub indexes: Vec<IndexInfo>,
    #[serde(default)]
    pub foreign_keys: Vec<ForeignKeyInfo>,
    pub error: Option<String>,
}

/// 存储过程/函数信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutineInfo {
    pub routine_name: String,
    pub routine_type: String,
    pub definition: Option<String>,
    pub comment: Option<String>,
}

/// 路由列表结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutinesResult {
    pub procedures: Vec<RoutineInfo>,
    pub functions: Vec<RoutineInfo>,
}

/// SQL 查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: Option<u64>,
    pub error: Option<String>,
}

/// 活跃连接集合（仅记录已连接的 connection_id）
pub struct ActiveConnections {
    conns: RwLock<HashSet<String>>,
}

impl ActiveConnections {
    pub fn new() -> Self {
        Self {
            conns: RwLock::new(HashSet::new()),
        }
    }

    pub async fn contains(&self, connection_id: &str) -> bool {
        self.conns.read().await.contains(connection_id)
    }

    pub async fn add(&self, connection_id: String) {
        self.conns.write().await.insert(connection_id);
    }

    pub async fn remove(&self, connection_id: &str) -> bool {
        self.conns.write().await.remove(connection_id)
    }
}

/// 确保指定连接已建立（如未连接则自动创建）
async fn ensure_connected(
    connection_id: &str,
    state: &State<'_, Mutex<Option<Storage>>>,
    connections: &State<'_, RwLock<ActiveConnections>>,
    sm: &SidecarManager,
) -> Result<(), String> {
    if connections.read().await.contains(connection_id).await {
        return Ok(());
    }

    let guard = state.lock().await;
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    let (conn_config, password_opt) = storage
        .get_connection_with_password(connection_id)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?
        .ok_or_else(|| "Connection not found".to_string())?;

    let password = password_opt.unwrap_or_default();

    let req = serde_json::json!({
        "connection_id": connection_id,
        "db_type": conn_config.db_type,
        "host": conn_config.host,
        "port": conn_config.port,
        "username": conn_config.username,
        "password": password,
        "database": conn_config.database,
    });

    let resp: serde_json::Value = sm.post("/connect", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            // 检测密码错误，返回特定错误码供前端识别
            if err.contains("password") || err.contains("Password") || err.contains("认证") || err.contains("authentication") {
                return Err("PASSWORD_REQUIRED".to_string());
            }
            return Err(err.to_string());
        }
    }

    connections.write().await.add(connection_id.to_string()).await;
    Ok(())
}

/// 测试数据库连接
#[tauri::command]
pub async fn test_connection(
    db_type: &str,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    database: Option<&str>,
    sidecar: State<'_, SidecarState>,
) -> Result<bool, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({
        "connection_id": "",
        "db_type": db_type,
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "database": database,
    });

    let resp: serde_json::Value = sm.post("/test", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(true)
}

/// 连接到数据库（建立并保持连接）
#[tauri::command]
pub async fn connect_database(
    connection_id: String,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<bool, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;
    Ok(true)
}

/// 断开数据库连接
#[tauri::command]
pub async fn disconnect_database(
    connection_id: String,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<bool, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({ "connection_id": connection_id });
    let _: serde_json::Value = sm.post("/disconnect", &req).await?;

    if connections.write().await.remove(&connection_id).await {
        tracing::info!("Disconnected from {}", connection_id);
        Ok(true)
    } else {
        Err(format!(
            "Connection {} not found or already disconnected",
            connection_id
        ))
    }
}

/// 获取所有连接
#[tauri::command]
pub async fn get_connections(
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<Vec<ConnectionOutput>, String> {
    let guard = state.lock().await;
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    match storage.get_connections().await {
        Ok(connections) => Ok(connections.into_iter().map(ConnectionOutput::from).collect()),
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
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    match input.id {
        Some(id) => {
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
                .update_connection(&id, &updated, input.password.as_deref())
                .await
                .map_err(|e| format!("Failed to update connection: {}", e))?;

            Ok(ConnectionOutput::from(updated))
        }
        None => {
            let new_conn = DbConnection::new(
                input.name,
                input.db_type,
                input.host,
                input.port as i32,
                input.username,
                input.database,
                input.group_id,
            );

            storage
                .save_connection(&new_conn, input.password.as_deref())
                .await
                .map_err(|e| format!("Failed to save connection: {}", e))?;

            Ok(new_conn.into())
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
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

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
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

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
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    match input.id {
        Some(id) => {
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
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    if id == "default" {
        return Err("Cannot delete default group".to_string());
    }

    storage
        .delete_group(&id)
        .await
        .map_err(|e| format!("Failed to delete group: {}", e))
}

// ==================== 数据库元数据命令（通过 Go Sidecar） ====================

/// 获取数据库列表
#[tauri::command]
pub async fn get_databases(
    connection_id: String,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<String>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({ "connection_id": connection_id });
    let resp: Vec<String> = sm.post("/databases", &req).await?;
    Ok(resp)
}

/// 获取表列表
#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<TableInfo>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({ "connection_id": connection_id, "database": database });
    let resp: Vec<TableInfo> = sm.post("/tables", &req).await?;
    Ok(resp)
}

/// 获取分类的表和视图（支持搜索过滤）
#[tauri::command]
pub async fn get_tables_categorized(
    connection_id: String,
    database: Option<String>,
    search: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<TablesResult, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "search": search,
    });
    let resp: TablesResult = sm.post("/tables-categorized", &req).await?;
    Ok(resp)
}

/// 获取完整的表结构（列、索引、外键）
#[tauri::command]
pub async fn get_table_structure(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<TableStructure, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "table_name": table_name,
    });
    let resp: TableStructure = sm.post("/table-structure", &req).await?;
    if let Some(err) = resp.error.as_ref() {
        if !err.is_empty() {
            return Err(err.clone());
        }
    }
    Ok(resp)
}

/// 获取列信息
#[tauri::command]
pub async fn get_columns(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<ColumnInfo>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "table_name": table_name,
    });
    let resp_val: serde_json::Value = sm.post("/columns", &req).await?;
    if let Some(err) = resp_val.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            // 返回空数组，让前端继续加载数据
            return Ok(vec![]);
        }
    }
    let resp: Vec<ColumnInfo> = serde_json::from_value(resp_val)
        .map_err(|e| format!("Invalid columns response: {}", e))?;
    Ok(resp)
}

/// 获取索引信息
#[tauri::command]
pub async fn get_indexes(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<IndexInfo>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "table_name": table_name,
    });
    let resp_val: serde_json::Value = sm.post("/indexes", &req).await?;
    if let Some(err) = resp_val.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            // 返回空数组，让前端继续加载数据
            return Ok(vec![]);
        }
    }
    let resp: Vec<IndexInfo> = serde_json::from_value(resp_val)
        .map_err(|e| format!("Invalid indexes response: {}", e))?;
    Ok(resp)
}

/// 获取外键信息
#[tauri::command]
pub async fn get_foreign_keys(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<ForeignKeyInfo>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "table_name": table_name,
    });
    let resp_val: serde_json::Value = sm.post("/foreign-keys", &req).await?;
    if let Some(err) = resp_val.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            // 返回空数组，让前端继续加载数据
            return Ok(vec![]);
        }
    }
    let resp: Vec<ForeignKeyInfo> = serde_json::from_value(resp_val)
        .map_err(|e| format!("Invalid foreign keys response: {}", e))?;
    Ok(resp)
}

/// 执行 SQL 查询
#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<QueryResult, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert("connection_id".to_string(), serde_json::json!(connection_id));
    req_map.insert("sql".to_string(), serde_json::json!(sql));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: QueryResult = sm.post("/query", &req).await?;
    Ok(resp)
}

/// 获取存储过程列表
#[tauri::command]
pub async fn get_procedures(
    connection_id: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<String>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: Vec<String> = sm.post("/procedures", &req).await?;
    Ok(resp)
}

/// 获取函数列表
#[tauri::command]
pub async fn get_functions(
    connection_id: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<String>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: Vec<String> = sm.post("/functions", &req).await?;
    Ok(resp)
}

/// 获取存储过程定义
#[tauri::command]
pub async fn get_procedure_body(
    connection_id: String,
    procedure_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<String, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "procedure_name": procedure_name,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/procedure-body", &req).await?;
    let body = resp
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(body)
}

/// 获取函数定义
#[tauri::command]
pub async fn get_function_body(
    connection_id: String,
    function_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<String, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "function_name": function_name,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/function-body", &req).await?;
    let body = resp
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(body)
}

/// 获取存储过程和函数列表
#[tauri::command]
pub async fn get_routines(
    connection_id: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<RoutinesResult, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: RoutinesResult = sm.post("/routines", &req).await?;
    Ok(resp)
}

/// 更新连接密码
#[tauri::command]
pub async fn update_connection_password(
    connection_id: String,
    password: String,
    state: State<'_, Mutex<Option<Storage>>>,
) -> Result<(), String> {
    let guard = state.lock().await;
    let storage = guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    storage
        .update_password(&connection_id, &password)
        .await
        .map_err(|e| format!("Failed to update password: {}", e))
}
