use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// 数据库连接配置
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DbConnection {
    pub id: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub database: Option<String>,
    pub group_id: Option<String>,
    pub color: Option<String>,
    // SSH 隧道配置
    pub ssh_host: Option<String>,
    pub ssh_port: Option<String>,
    pub ssh_username: Option<String>,
    pub ssh_auth_method: Option<String>,
    pub ssh_private_key_path: Option<String>,
    // SSL/TLS 配置
    pub ssl_enabled: Option<String>,
    pub ssl_ca_path: Option<String>,
    pub ssl_cert_path: Option<String>,
    pub ssl_key_path: Option<String>,
    pub ssl_skip_verify: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 自定义分组
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub parent_id: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl DbConnection {
    pub fn new(
        name: String,
        db_type: String,
        host: String,
        port: i32,
        username: String,
        database: Option<String>,
        group_id: Option<String>,
        color: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            db_type,
            host,
            port,
            username,
            database,
            group_id,
            color,
            ssh_host: None,
            ssh_port: None,
            ssh_username: None,
            ssh_auth_method: None,
            ssh_private_key_path: None,
            ssl_enabled: None,
            ssl_ca_path: None,
            ssl_cert_path: None,
            ssl_key_path: None,
            ssl_skip_verify: None,
            created_at: now,
            updated_at: now,
        }
    }
}

impl ConnectionGroup {
    pub fn new(name: String, icon: String, color: String, parent_id: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            icon,
            color,
            parent_id,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        }
    }
}

/// 代码片段
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub sql_text: String,
    pub db_type: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub is_private: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Snippet {
    pub fn new(
        name: String,
        sql_text: String,
        db_type: Option<String>,
        category: Option<String>,
        tags: Option<String>,
        is_private: bool,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            sql_text,
            db_type,
            category,
            tags,
            is_private,
            created_at: now,
            updated_at: now,
        }
    }
}
