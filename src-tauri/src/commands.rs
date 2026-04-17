use crate::db::{ConnectionGroup, DbConnection};
use crate::drivers::db_pool::DbPool;
use crate::drivers::{
    connect_by_type, execute_query_by_type, get_columns_by_type, get_databases_by_type,
    get_foreign_keys_by_type, get_indexes_by_type, get_tables_by_type,
};
use crate::storage::Storage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    pub is_nullable: bool,
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

async fn get_connection_pool(
    connection_id: &str,
    state: &State<'_, Mutex<Option<Storage>>>,
    connections: &State<'_, RwLock<ActiveConnections>>,
) -> Result<(crate::drivers::db_pool::DbPool, String), String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    let (conn_config, password_opt) = storage
        .get_connection_with_password(connection_id)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?
        .ok_or_else(|| "Connection not found".to_string())?;

    let password = password_opt.unwrap_or_default();

    let pool = match connections.read().await.get(connection_id).await {
        Some(pool) => pool,
        None => connect_by_type(&conn_config.db_type, &conn_config, &password).await?,
    };

    Ok((pool, conn_config.db_type))
}

/// 表信息
#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<Vec<TableInfo>, String> {
    let (pool, db_type) = get_connection_pool(&connection_id, &state, &connections).await?;
    let tables = get_tables_by_type(&db_type, &pool, database.as_deref()).await?;
    Ok(tables)
}

/// 获取数据库列表
#[tauri::command]
pub async fn get_databases(
    connection_id: String,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<Vec<String>, String> {
    let (pool, db_type) = get_connection_pool(&connection_id, &state, &connections).await?;
    let databases = get_databases_by_type(&db_type, &pool).await?;
    Ok(databases)
}

/// 获取列信息
#[tauri::command]
pub async fn get_columns(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<Vec<ColumnInfo>, String> {
    let (pool, db_type) = get_connection_pool(&connection_id, &state, &connections).await?;
    let cols = get_columns_by_type(&db_type, &pool, &table_name, database.as_deref()).await?;
    Ok(cols)
}

/// 获取索引信息
#[tauri::command]
pub async fn get_indexes(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<Vec<IndexInfo>, String> {
    let (pool, db_type) = get_connection_pool(&connection_id, &state, &connections).await?;
    let indexes = get_indexes_by_type(&db_type, &pool, &table_name, database.as_deref()).await?;
    Ok(indexes)
}

/// 获取外键信息
#[tauri::command]
pub async fn get_foreign_keys(
    connection_id: String,
    table_name: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<Vec<ForeignKeyInfo>, String> {
    let (pool, db_type) = get_connection_pool(&connection_id, &state, &connections).await?;
    let fks = get_foreign_keys_by_type(&db_type, &pool, &table_name, database.as_deref()).await?;
    Ok(fks)
}

/// 执行 SQL 查询
#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    database: Option<String>,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<QueryResult, String> {
    let (pool, db_type) = get_connection_pool(&connection_id, &state, &connections).await?;
    let result = execute_query_by_type(&db_type, &pool, &sql).await?;
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
    password: &str,
    database: Option<&str>,
) -> Result<bool, String> {
    println!(
        "Testing connection to {}:{}:{} as {}",
        db_type, host, port, username
    );

    // 构造临时配置用于测试连接
    let config = DbConnection::new(
        "test".to_string(),
        db_type.to_string(),
        host.to_string(),
        port as i32,
        username.to_string(),
        database.map(|s| s.to_string()),
        None,
    );

    // 尝试创建连接池（验证连接是否可用）
    let pool = connect_by_type(db_type, &config, password).await?;

    // 验证连接池是否真正可用（执行简单查询）
    match db_type {
        "mysql" => {
            if let DbPool::MySql(pool) = pool {
                sqlx::query("SELECT 1")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Connection test failed: {}", e))?;
            }
        }
        "postgresql" => {
            if let DbPool::Postgres(pool) = pool {
                sqlx::query("SELECT 1")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Connection test failed: {}", e))?;
            }
        }
        "sqlite" => {
            if let DbPool::Sqlite(pool) = pool {
                sqlx::query("SELECT 1")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Connection test failed: {}", e))?;
            }
        }
        _ => return Err(format!("Unsupported database type: {}", db_type)),
    }

    println!("Connection test successful");
    Ok(true)
}

/// 活跃连接池（内存中管理）
/// 性能优化：使用 RwLock 替代 Mutex，提升读多写少场景的性能
pub struct ActiveConnections {
    pools: RwLock<HashMap<String, DbPool>>,
}

impl ActiveConnections {
    pub fn new() -> Self {
        Self {
            pools: RwLock::new(HashMap::new()),
        }
    }

    /// 读取连接池 - 使用读锁，并发读取性能更好
    pub async fn get(&self, connection_id: &str) -> Option<DbPool> {
        let pools = self.pools.read().await;
        pools.get(connection_id).cloned()
    }

    /// 添加连接池 - 使用写锁
    pub async fn add(&self, connection_id: String, pool: DbPool) {
        let mut pools = self.pools.write().await;
        pools.insert(connection_id, pool);
    }

    /// 移除连接池 - 使用写锁
    pub async fn remove(&self, connection_id: &str) -> Option<DbPool> {
        let mut pools = self.pools.write().await;
        pools.remove(connection_id)
    }

    /// 检查连接是否存在 - 使用读锁
    pub async fn contains(&self, connection_id: &str) -> bool {
        let pools = self.pools.read().await;
        pools.contains_key(connection_id)
    }

    /// 获取所有连接 ID - 使用读锁
    pub async fn get_all_ids(&self) -> Vec<String> {
        let pools = self.pools.read().await;
        pools.keys().cloned().collect()
    }
}

/// 连接到数据库（建立并保持连接池）
#[tauri::command]
pub async fn connect_database(
    connection_id: String,
    state: State<'_, Mutex<Option<Storage>>>,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<bool, String> {
    let guard = state.lock().await;
    let storage = guard.as_ref().unwrap();

    // 检查是否已经连接 - 性能优化：使用读锁
    {
        let conns = connections.read().await;
        if conns.contains(&connection_id).await {
            return Ok(true);
        }
    }

    // 获取连接配置（含密码）
    let (conn_config, password_opt) = storage
        .get_connection_with_password(&connection_id)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?
        .ok_or_else(|| "Connection not found".to_string())?;

    println!(
        "Connecting to {}:{}:{} as {}",
        conn_config.db_type, conn_config.host, conn_config.port, conn_config.username
    );

    let password = password_opt.unwrap_or_default();

    // 创建连接池并保持
    let pool = connect_by_type(&conn_config.db_type, &conn_config, &password).await?;

    // 验证连接可用性
    match &conn_config.db_type {
        db_type if db_type == "mysql" => {
            if let DbPool::MySql(pool) = &pool {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .map_err(|e| format!("Connection failed: {}", e))?;
            }
        }
        db_type if db_type == "postgresql" => {
            if let DbPool::Postgres(pool) = &pool {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .map_err(|e| format!("Connection failed: {}", e))?;
            }
        }
        db_type if db_type == "sqlite" => {
            if let DbPool::Sqlite(pool) = &pool {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .map_err(|e| format!("Connection failed: {}", e))?;
            }
        }
        _ => {
            return Err(format!(
                "Unsupported database type: {}",
                conn_config.db_type
            ))
        }
    }

    // 性能优化：使用 RwLock 的写锁（write().await）
    let _ = connections.write().await.add(connection_id, pool);

    println!("Connected successfully");
    Ok(true)
}

/// 断开数据库连接（释放连接池）
#[tauri::command]
pub async fn disconnect_database(
    connection_id: String,
    connections: State<'_, RwLock<ActiveConnections>>,
) -> Result<bool, String> {
    // 性能优化：使用 RwLock 的写锁（write().await）
    if connections
        .write()
        .await
        .remove(&connection_id)
        .await
        .is_some()
    {
        println!("Disconnected from {}", connection_id);
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
