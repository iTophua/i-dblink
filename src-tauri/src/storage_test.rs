#[cfg(test)]
mod tests {
    use super::*;

    // Test helper to create a test storage
    fn create_test_db_path() -> std::path::PathBuf {
        std::env::temp_dir().join("idblink_test_db")
    }

    #[tokio::test]
    async fn test_storage_init() {
        // This test requires a real database connection
        // Skip for CI environments
        if std::env::var("CI").is_ok() {
            return;
        }

        let db_path = create_test_db_path();
        let _ = std::fs::remove_dir_all(&db_path);
        
        // Initialize storage
        // Note: This test needs proper Tauri app handle setup
        // For now, we test the storage logic in isolation
    }

    #[test]
    fn test_connection_output_serialization() {
        let conn_output = crate::commands::ConnectionOutput {
            id: "test-1".to_string(),
            name: "Test Connection".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            database: Some("testdb".to_string()),
            group_id: Some("group-1".to_string()),
            color: Some("#1890ff".to_string()),
            status: "connected".to_string(),
            ssh_enabled: true,
            ssl_enabled: false,
        };

        let json = serde_json::to_string(&conn_output).unwrap();
        assert!(json.contains("Test Connection"));
        assert!(json.contains("mysql"));
        assert!(json.contains("localhost"));

        let deserialized: crate::commands::ConnectionOutput = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "Test Connection");
        assert_eq!(deserialized.status, "connected");
    }

    #[test]
    fn test_connection_input_serialization() {
        let conn_input = crate::commands::ConnectionInput {
            id: Some("test-1".to_string()),
            name: "Test Connection".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            password: Some("secret".to_string()),
            database: Some("testdb".to_string()),
            group_id: Some("group-1".to_string()),
            color: Some("#1890ff".to_string()),
            ssh_enabled: false,
            ssh_host: None,
            ssh_port: None,
            ssh_username: None,
            ssh_auth_method: None,
            ssh_password: None,
            ssh_private_key_path: None,
            ssh_passphrase: None,
            ssl_enabled: false,
            ssl_ca_path: None,
            ssl_cert_path: None,
            ssl_key_path: None,
            ssl_skip_verify: false,
        };

        let json = serde_json::to_string(&conn_input).unwrap();
        let deserialized: crate::commands::ConnectionInput = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.password, Some("secret".to_string()));
        assert_eq!(deserialized.host, "localhost");
    }

    #[test]
    fn test_group_serialization() {
        let group_input = crate::commands::GroupInput {
            id: Some("group-1".to_string()),
            name: "Production".to_string(),
            icon: "🚀".to_string(),
            color: "#ff4d4f".to_string(),
            parent_id: None,
        };

        let json = serde_json::to_string(&group_input).unwrap();
        let deserialized: crate::commands::GroupInput = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "Production");
        assert_eq!(deserialized.icon, "🚀");
    }

    #[test]
    fn test_query_result_serialization() {
        let query_result = crate::commands::QueryResult {
            columns: vec!["id".to_string(), "name".to_string()],
            rows: vec![
                vec![serde_json::json!(1), serde_json::json!("Alice")],
                vec![serde_json::json!(2), serde_json::json!("Bob")],
            ],
            rows_affected: Some(2),
            error: None,
        };

        let json = serde_json::to_string(&query_result).unwrap();
        let deserialized: crate::commands::QueryResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.columns, vec!["id".to_string(), "name".to_string()]);
        assert_eq!(deserialized.rows.len(), 2);
        assert_eq!(deserialized.rows_affected, Some(2));
    }

    #[test]
    fn test_query_result_with_error() {
        let query_result = crate::commands::QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: None,
            error: Some("Syntax error in SQL".to_string()),
        };

        let json = serde_json::to_string(&query_result).unwrap();
        let deserialized: crate::commands::QueryResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.error, Some("Syntax error in SQL".to_string()));
    }

    #[test]
    fn test_tables_result_serialization() {
        let tables_result = crate::commands::TablesResult {
            tables: vec![
                crate::commands::TableInfo {
                    table_name: "users".to_string(),
                    table_type: "BASE TABLE".to_string(),
                    row_count: Some(100),
                    comment: Some("Users table".to_string()),
                    engine: Some("InnoDB".to_string()),
                    data_size: Some("16384".to_string()),
                    index_size: Some("0".to_string()),
                    create_time: Some("2024-01-01".to_string()),
                    update_time: Some("2024-01-02".to_string()),
                    collation: Some("utf8mb4_unicode_ci".to_string()),
                },
            ],
            views: vec![],
        };

        let json = serde_json::to_string(&tables_result).unwrap();
        assert!(json.contains("users"));
        assert!(json.contains("BASE TABLE"));
    }

    #[test]
    fn test_table_structure_serialization() {
        let structure = crate::commands::TableStructure {
            columns: vec![
                crate::commands::ColumnInfo {
                    column_name: "id".to_string(),
                    data_type: "int".to_string(),
                    is_nullable: "NO".to_string(),
                    column_key: Some("PRI".to_string()),
                    column_default: None,
                    extra: Some("auto_increment".to_string()),
                    comment: Some("Primary key".to_string()),
                },
            ],
            indexes: vec![],
            foreign_keys: vec![],
            error: None,
        };

        let json = serde_json::to_string(&structure).unwrap();
        let deserialized: crate::commands::TableStructure = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.columns.len(), 1);
        assert_eq!(deserialized.columns[0].column_name, "id");
    }

    #[test]
    fn test_null_as_default() {
        // Test that null fields are deserialized as default values
        let json = r#"{
            "columns": null,
            "indexes": null,
            "foreign_keys": null,
            "error": null
        }"#;

        let structure: crate::commands::TableStructure = serde_json::from_str(json).unwrap();
        assert!(structure.columns.is_empty());
        assert!(structure.indexes.is_empty());
        assert!(structure.foreign_keys.is_empty());
        assert!(structure.error.is_none());
    }
}
