use crate::db::{ConnectionGroup, DbConnection};
use crate::sidecar::{SidecarManager, SidecarState};
use crate::storage::Storage;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;
use tauri::State;
use tokio::sync::{Mutex, RwLock};

/// 自定义反序列化：将 JSON null 视为默认值（空 Vec）
fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    let opt = Option::<T>::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

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
    pub color: Option<String>,
    // SSH 隧道配置
    #[serde(default)]
    pub ssh_enabled: bool,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<u16>,
    pub ssh_username: Option<String>,
    pub ssh_auth_method: Option<String>,
    pub ssh_password: Option<String>,
    pub ssh_private_key_path: Option<String>,
    pub ssh_passphrase: Option<String>,
    // SSL/TLS 配置
    #[serde(default)]
    pub ssl_enabled: bool,
    pub ssl_ca_path: Option<String>,
    pub ssl_cert_path: Option<String>,
    pub ssl_key_path: Option<String>,
    #[serde(default)]
    pub ssl_skip_verify: bool,
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
    pub color: Option<String>,
    pub status: String,
    // SSH 隧道配置（仅显示是否启用）
    #[serde(default)]
    pub ssh_enabled: bool,
    // SSL/TLS 配置（仅显示是否启用）
    #[serde(default)]
    pub ssl_enabled: bool,
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
            color: conn.color,
            status: "disconnected".to_string(),
            ssh_enabled: conn.ssh_host.is_some(),
            ssl_enabled: conn.ssl_enabled.unwrap_or(false),
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
    #[serde(default, deserialize_with = "null_as_default")]
    pub columns: Vec<ColumnInfo>,
    #[serde(default, deserialize_with = "null_as_default")]
    pub indexes: Vec<IndexInfo>,
    #[serde(default, deserialize_with = "null_as_default")]
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
        "ssh_host": conn_config.ssh_host,
        "ssh_port": conn_config.ssh_port,
        "ssh_username": conn_config.ssh_username,
        "ssh_auth_method": conn_config.ssh_auth_method,
        "ssh_private_key_path": conn_config.ssh_private_key_path,
        "ssl_enabled": conn_config.ssl_enabled,
        "ssl_ca_path": conn_config.ssl_ca_path,
        "ssl_cert_path": conn_config.ssl_cert_path,
        "ssl_key_path": conn_config.ssl_key_path,
        "ssl_skip_verify": conn_config.ssl_skip_verify,
    });

    let resp: serde_json::Value = sm.post("/connect", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            // 检测密码错误，返回特定错误码供前端识别
            if err.to_lowercase().contains("password")
                || err.to_lowercase().contains("auth")
                || err.contains("1045")
                || err.contains("28000")
            {
                return Err("PASSWORD_REQUIRED".to_string());
            }
            return Err(err.to_string());
        }
    }

    connections
        .write()
        .await
        .add(connection_id.to_string())
        .await;
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
    ssh_enabled: bool,
    ssh_host: Option<&str>,
    ssh_port: Option<u16>,
    ssh_username: Option<&str>,
    ssh_auth_method: Option<&str>,
    ssh_password: Option<&str>,
    ssh_private_key_path: Option<&str>,
    ssh_passphrase: Option<&str>,
    ssl_enabled: bool,
    ssl_ca_path: Option<&str>,
    ssl_cert_path: Option<&str>,
    ssl_key_path: Option<&str>,
    ssl_skip_verify: bool,
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
        "ssh_enabled": ssh_enabled,
        "ssh_host": ssh_host,
        "ssh_port": ssh_port,
        "ssh_username": ssh_username,
        "ssh_auth_method": ssh_auth_method,
        "ssh_password": ssh_password,
        "ssh_private_key_path": ssh_private_key_path,
        "ssh_passphrase": ssh_passphrase,
        "ssl_enabled": ssl_enabled,
        "ssl_ca_path": ssl_ca_path,
        "ssl_cert_path": ssl_cert_path,
        "ssl_key_path": ssl_key_path,
        "ssl_skip_verify": ssl_skip_verify,
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
            updated.color = input.color.clone();
            // SSH
            updated.ssh_host = if input.ssh_enabled { input.ssh_host.clone() } else { None };
            updated.ssh_port = if input.ssh_enabled { input.ssh_port.map(|p| p as i32) } else { None };
            updated.ssh_username = if input.ssh_enabled { input.ssh_username.clone() } else { None };
            updated.ssh_auth_method = if input.ssh_enabled { input.ssh_auth_method.clone() } else { None };
            updated.ssh_private_key_path = if input.ssh_enabled { input.ssh_private_key_path.clone() } else { None };
            // SSL
            updated.ssl_enabled = Some(input.ssl_enabled);
            updated.ssl_ca_path = input.ssl_ca_path.clone();
            updated.ssl_cert_path = input.ssl_cert_path.clone();
            updated.ssl_key_path = input.ssl_key_path.clone();
            updated.ssl_skip_verify = Some(input.ssl_skip_verify);

            storage
                .update_connection(&id, &updated, input.password.as_deref())
                .await
                .map_err(|e| format!("Failed to update connection: {}", e))?;

            Ok(ConnectionOutput::from(updated))
        }
        None => {
            let mut new_conn = DbConnection::new(
                input.name,
                input.db_type,
                input.host,
                input.port as i32,
                input.username,
                input.database,
                input.group_id,
                input.color,
            );
            // SSH
            new_conn.ssh_host = if input.ssh_enabled { input.ssh_host.clone() } else { None };
            new_conn.ssh_port = if input.ssh_enabled { input.ssh_port.map(|p| p as i32) } else { None };
            new_conn.ssh_username = if input.ssh_enabled { input.ssh_username.clone() } else { None };
            new_conn.ssh_auth_method = if input.ssh_enabled { input.ssh_auth_method.clone() } else { None };
            new_conn.ssh_private_key_path = if input.ssh_enabled { input.ssh_private_key_path.clone() } else { None };
            // SSL
            new_conn.ssl_enabled = Some(input.ssl_enabled);
            new_conn.ssl_ca_path = input.ssl_ca_path.clone();
            new_conn.ssl_cert_path = input.ssl_cert_path.clone();
            new_conn.ssl_key_path = input.ssl_key_path.clone();
            new_conn.ssl_skip_verify = Some(input.ssl_skip_verify);

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
    let resp: Vec<ColumnInfo> = match resp_val {
        serde_json::Value::Null => vec![],
        v => serde_json::from_value(v).map_err(|e| format!("Invalid columns response: {}", e))?,
    };
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
    let resp: Vec<IndexInfo> = match resp_val {
        serde_json::Value::Null => vec![],
        v => serde_json::from_value(v).map_err(|e| format!("Invalid indexes response: {}", e))?,
    };
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
    let resp: Vec<ForeignKeyInfo> = match resp_val {
        serde_json::Value::Null => vec![],
        v => serde_json::from_value(v).map_err(|e| format!("Invalid foreign keys response: {}", e))?,
    };
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
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("sql".to_string(), serde_json::json!(sql));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: QueryResult = sm.post("/query", &req).await?;
    Ok(resp)
}

/// 流式导出完整表数据（分批查询）
#[tauri::command]
pub async fn stream_export_table(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    batch_size: Option<u32>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("table_name".to_string(), serde_json::json!(table_name));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    if let Some(bs) = batch_size {
        req_map.insert("batch_size".to_string(), serde_json::json!(bs));
    }
    let req = serde_json::Value::Object(req_map);

    // 流式导出使用 POST /stream-export
    let resp: serde_json::Value = sm.post("/stream-export", &req).await?;
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

// ==================== DDL 命令（通过 Go Sidecar） ====================

/// 执行 DDL 语句
#[tauri::command]
pub async fn execute_ddl(
    connection_id: String,
    sql: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("sql".to_string(), serde_json::json!(sql));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: serde_json::Value = sm.post("/execute-ddl", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 清空表
#[tauri::command]
pub async fn truncate_table(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("table_name".to_string(), serde_json::json!(table_name));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: serde_json::Value = sm.post("/truncate-table", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 删除表
#[tauri::command]
pub async fn drop_table(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("table_name".to_string(), serde_json::json!(table_name));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: serde_json::Value = sm.post("/drop-table", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 删除视图
#[tauri::command]
pub async fn drop_view(
    connection_id: String,
    view_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("view_name".to_string(), serde_json::json!(view_name));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: serde_json::Value = sm.post("/drop-view", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 重命名表
#[tauri::command]
pub async fn rename_table(
    connection_id: String,
    old_name: String,
    new_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("old_name".to_string(), serde_json::json!(old_name));
    req_map.insert("new_name".to_string(), serde_json::json!(new_name));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: serde_json::Value = sm.post("/rename-table", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 表维护操作(OPTIMIZE/ANALYZE/REPAIR)
#[tauri::command]
pub async fn maintain_table(
    connection_id: String,
    table_name: String,
    operation: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let mut req_map = serde_json::Map::new();
    req_map.insert(
        "connection_id".to_string(),
        serde_json::json!(connection_id),
    );
    req_map.insert("table_name".to_string(), serde_json::json!(table_name));
    req_map.insert("operation".to_string(), serde_json::json!(operation));
    if let Some(db) = database {
        req_map.insert("database".to_string(), serde_json::json!(db));
    }
    let req = serde_json::Value::Object(req_map);
    let resp: serde_json::Value = sm.post("/table-maintenance", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

// ==================== 事务控制命令（通过 Go Sidecar） ====================

/// 开启事务
#[tauri::command]
pub async fn begin_transaction(
    connection_id: String,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({ "connection_id": connection_id });
    let resp: serde_json::Value = sm.post("/begin-transaction", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 提交事务
#[tauri::command]
pub async fn commit_transaction(
    connection_id: String,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({ "connection_id": connection_id });
    let resp: serde_json::Value = sm.post("/commit-transaction", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 回滚事务
#[tauri::command]
pub async fn rollback_transaction(
    connection_id: String,
    sidecar: State<'_, SidecarState>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({ "connection_id": connection_id });
    let resp: serde_json::Value = sm.post("/rollback-transaction", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(())
}

/// 获取事务状态
#[tauri::command]
pub async fn get_transaction_status(
    connection_id: String,
    sidecar: State<'_, SidecarState>,
) -> Result<bool, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({ "connection_id": connection_id });
    let resp: serde_json::Value = sm.post("/transaction-status", &req).await?;
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Err(err.to_string());
        }
    }
    Ok(resp
        .get("active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

/// 服务器信息响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub version: Option<String>,
    pub server_type: Option<String>,
    pub character_set: Option<String>,
    pub collation: Option<String>,
    pub uptime: Option<String>,
    pub max_connections: Option<i32>,
    pub error: Option<String>,
}

/// 获取数据库服务器信息
#[tauri::command]
pub async fn get_server_info(
    connection_id: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
) -> Result<ServerInfo, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: ServerInfo = sm.post("/server-info", &req).await?;
    if let Some(err) = &resp.error {
        return Err(err.clone());
    }
    Ok(resp)
}

/// 获取建表语句请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTableDDLRequest {
    pub connection_id: String,
    pub table_name: String,
    pub database: Option<String>,
}

/// 获取建表语句
#[tauri::command]
pub async fn get_table_ddl(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<String>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "table_name": table_name,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/table-ddl", &req).await?;
    let ddls: Vec<String> = resp
        .get("ddls")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    if ddls.is_empty() {
        return Err(format!("no DDL found for table: {}", table_name));
    }

    Ok(ddls)
}

/// 获取触发器列表
#[tauri::command]
pub async fn get_triggers(
    connection_id: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<serde_json::Value>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/triggers", &req).await?;
    let triggers: Vec<serde_json::Value> = resp
        .get("triggers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.clone())
        .unwrap_or_default();

    Ok(triggers)
}

/// 获取事件列表 (MySQL)
#[tauri::command]
pub async fn get_events(
    connection_id: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
) -> Result<Vec<serde_json::Value>, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/events", &req).await?;
    let events: Vec<serde_json::Value> = resp
        .get("events")
        .and_then(|v| v.as_array())
        .map(|arr| arr.clone())
        .unwrap_or_default();

    Ok(events)
}

/// 代码片段模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub sql_text: String,
    pub db_type: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub is_private: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 保存代码片段
#[tauri::command]
pub async fn save_snippet(
    id: Option<String>,
    name: String,
    sql_text: String,
    db_type: Option<String>,
    category: Option<String>,
    tags: Option<String>,
    is_private: bool,
    storage: State<'_, tokio::sync::Mutex<Option<Storage>>>,
) -> Result<String, String> {
    let storage_guard = storage.lock().await;
    let storage = storage_guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    let snippet = crate::db::Snippet::new(name, sql_text, db_type, category, tags, is_private);
    let mut snippet_to_save = snippet;

    if let Some(existing_id) = id {
        // 更新现有片段
        snippet_to_save.id = existing_id.clone();
        let existing = storage
            .snippets()
            .get_by_id(&existing_id)
            .await
            .map_err(|e| e.to_string())?;
        if let Some(exist) = existing {
            snippet_to_save.created_at = exist.created_at;
        } else {
            return Err("Snippet not found".to_string());
        }
    }

    storage
        .snippets()
        .save(&snippet_to_save)
        .await
        .map_err(|e| e.to_string())?;
    Ok(snippet_to_save.id)
}

/// 获取所有代码片段
#[tauri::command]
pub async fn get_snippets(
    storage: State<'_, tokio::sync::Mutex<Option<Storage>>>,
) -> Result<Vec<Snippet>, String> {
    let storage_guard = storage.lock().await;
    let storage = storage_guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    let snippets = storage
        .snippets()
        .get_all()
        .await
        .map_err(|e| e.to_string())?;
    let result: Vec<Snippet> = snippets
        .into_iter()
        .map(|s| Snippet {
            id: s.id,
            name: s.name,
            sql_text: s.sql_text,
            db_type: s.db_type,
            category: s.category,
            tags: s.tags,
            is_private: s.is_private,
            created_at: s.created_at.to_rfc3339(),
            updated_at: s.updated_at.to_rfc3339(),
        })
        .collect();

    Ok(result)
}

/// 删除代码片段
#[tauri::command]
pub async fn delete_snippet(
    id: String,
    storage: State<'_, tokio::sync::Mutex<Option<Storage>>>,
) -> Result<(), String> {
    let storage_guard = storage.lock().await;
    let storage = storage_guard
        .as_ref()
        .ok_or_else(|| "Storage not initialized".to_string())?;

    storage
        .snippets()
        .delete(&id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 检测备份工具
#[tauri::command]
pub async fn check_backup_tool(
    db_type: String,
    sidecar: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    let req = serde_json::json!({ "db_type": db_type });
    let resp: serde_json::Value = sm.post("/check-backup-tool", &req).await?;
    Ok(resp)
}

/// 备份数据库
#[tauri::command]
pub async fn backup_database(
    connection_id: String,
    database: String,
    tables: Option<Vec<String>>,
    include_structure: bool,
    include_data: bool,
    file_path: String,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "tables": tables,
        "include_structure": include_structure,
        "include_data": include_data,
        "file_path": file_path,
    });
    let resp: serde_json::Value = sm.post("/backup", &req).await?;
    Ok(resp)
}

/// 恢复数据库
#[tauri::command]
pub async fn restore_database(
    connection_id: String,
    database: String,
    file_path: String,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "file_path": file_path,
    });
    let resp: serde_json::Value = sm.post("/restore", &req).await?;
    Ok(resp)
}

/// 获取用户列表
#[tauri::command]
pub async fn get_users(
    connection_id: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/users", &req).await?;
    Ok(resp)
}

/// 获取用户权限
#[tauri::command]
pub async fn get_user_privileges(
    connection_id: String,
    username: String,
    host: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "username": username,
        "host": host,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/privileges", &req).await?;
    Ok(resp)
}

/// 获取表级权限
#[tauri::command]
pub async fn get_table_privileges(
    connection_id: String,
    username: String,
    host: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "username": username,
        "host": host,
        "database": database,
    });
    let resp: serde_json::Value = sm.post("/table-privileges", &req).await?;
    Ok(resp)
}

/// 创建用户
#[tauri::command]
pub async fn create_user(
    connection_id: String,
    username: String,
    password: String,
    host: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "username": username,
        "password": password,
        "host": host,
        "database": database,
    });
    let _: serde_json::Value = sm.post("/create-user", &req).await?;
    Ok(())
}

/// 删除用户
#[tauri::command]
pub async fn drop_user(
    connection_id: String,
    username: String,
    host: String,
    database: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "username": username,
        "host": host,
        "database": database,
    });
    let _: serde_json::Value = sm.post("/drop-user", &req).await?;
    Ok(())
}

/// 授予权限
#[tauri::command]
pub async fn grant_privilege(
    connection_id: String,
    username: String,
    host: String,
    privileges: Vec<String>,
    database_all: bool,
    database: Option<String>,
    table: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "username": username,
        "host": host,
        "privileges": privileges,
        "database_all": database_all,
        "database": database,
        "table": table,
    });
    let _: serde_json::Value = sm.post("/grant", &req).await?;
    Ok(())
}

/// 撤销权限
#[tauri::command]
pub async fn revoke_privilege(
    connection_id: String,
    username: String,
    host: String,
    privileges: Vec<String>,
    database_all: bool,
    database: Option<String>,
    table: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "username": username,
        "host": host,
        "privileges": privileges,
        "database_all": database_all,
        "database": database,
        "table": table,
    });
    let _: serde_json::Value = sm.post("/revoke", &req).await?;
    Ok(())
}

/// 比较数据库/表结构
#[tauri::command]
pub async fn compare_schema(
    source_connection_id: String,
    source_database: String,
    target_connection_id: String,
    target_database: String,
    table_name: Option<String>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&source_connection_id, &state, &connections, sm).await?;
    ensure_connected(&target_connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "source_connection_id": source_connection_id,
        "source_database": source_database,
        "target_connection_id": target_connection_id,
        "target_database": target_database,
        "table_name": table_name,
    });
    let resp: serde_json::Value = sm.post("/compare-schema", &req).await?;
    Ok(resp)
}

#[tauri::command]
pub async fn batch_import(
    connection_id: String,
    database: Option<String>,
    table_name: String,
    mode: String,
    primary_key: Option<String>,
    rows: Vec<serde_json::Value>,
    sidecar: State<'_, SidecarState>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<serde_json::Value, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({
        "connection_id": connection_id,
        "database": database,
        "table_name": table_name,
        "mode": mode,
        "primary_key": primary_key,
        "rows": rows,
    });
    let resp: serde_json::Value = sm.post("/batch-import", &req).await?;
    Ok(resp)
}

#[tauri::command]
pub async fn quit_app(sidecar: State<'_, SidecarState>) -> Result<(), String> {
    let sidecar_guard = sidecar.lock().await;
    if let Some(sm) = sidecar_guard.as_ref() {
        sm.stop().await?;
    }
    Ok(())
}
