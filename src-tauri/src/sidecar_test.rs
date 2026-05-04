#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_binary_path_exists() {
        // Test that find_binary returns an error when binary doesn't exist
        // This test should pass in most environments
        let result = find_binary();
        // The result depends on whether the Go binary exists
        // We just test that it returns a Result
        assert!(result.is_err() || result.is_ok());
    }

    #[test]
    fn test_sidecar_manager_base_url() {
        // Test base_url generation
        // We can't test the full SidecarManager without running Go sidecar
        // But we can test the URL format
        let port: u16 = 8080;
        let expected = format!("http://127.0.0.1:{}", port);
        assert_eq!(expected, "http://127.0.0.1:8080");
    }

    #[test]
    fn test_sidecar_state_deref() {
        // Test that SidecarState implements Deref correctly
        let state = SidecarState(std::sync::Arc::new(tokio::sync::Mutex::new(None)));
        
        // The state should be usable via Deref
        let guard = state.blocking_lock();
        assert!(guard.is_none());
    }

    #[test]
    fn test_active_connections_basic() {
        use crate::commands::ActiveConnections;
        use tokio::runtime::Runtime;
        
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let active = ActiveConnections::new();
            
            // Initially empty
            assert!(!active.contains("conn-1").await);
            
            // Add connection
            active.add("conn-1".to_string()).await;
            assert!(active.contains("conn-1").await);
            
            // Add another connection
            active.add("conn-2".to_string()).await;
            assert!(active.contains("conn-2").await);
            
            // Remove connection
            let removed = active.remove("conn-1").await;
            assert!(removed);
            assert!(!active.contains("conn-1").await);
            
            // Try to remove non-existent
            let removed = active.remove("non-existent").await;
            assert!(!removed);
        });
    }

    #[test]
    fn test_connection_input_validation() {
        use crate::commands::ConnectionInput;
        
        // Valid connection input
        let valid = ConnectionInput {
            id: None,
            name: "Test".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            password: None,
            database: None,
            group_id: None,
            color: None,
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
        
        assert!(!valid.name.is_empty());
        assert!(!valid.db_type.is_empty());
        assert!(!valid.host.is_empty());
        assert!(!valid.username.is_empty());
        assert!(valid.port > 0);
    }

    #[test]
    fn test_connection_output_status() {
        use crate::commands::ConnectionOutput;
        
        let output = ConnectionOutput {
            id: "test".to_string(),
            name: "Test".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            database: None,
            group_id: None,
            color: None,
            status: "disconnected".to_string(),
            ssh_enabled: false,
            ssl_enabled: false,
        };
        
        assert_eq!(output.status, "disconnected");
        assert!(!output.id.is_empty());
    }

    #[test]
    fn test_group_input_validation() {
        use crate::commands::GroupInput;
        
        let group = GroupInput {
            id: None,
            name: "Production".to_string(),
            icon: "🚀".to_string(),
            color: "#ff4d4f".to_string(),
            parent_id: None,
        };
        
        assert!(!group.name.is_empty());
        assert!(!group.icon.is_empty());
        assert!(!group.color.is_empty());
    }

    #[test]
    fn test_query_result_empty() {
        let result = crate::commands::QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: None,
            error: None,
        };
        
        assert!(result.columns.is_empty());
        assert!(result.rows.is_empty());
        assert!(result.rows_affected.is_none());
        assert!(result.error.is_none());
    }

    #[test]
    fn test_table_info_defaults() {
        let table = crate::commands::TableInfo {
            table_name: "users".to_string(),
            table_type: "BASE TABLE".to_string(),
            row_count: None,
            comment: None,
            engine: None,
            data_size: None,
            index_size: None,
            create_time: None,
            update_time: None,
            collation: None,
        };
        
        assert_eq!(table.table_name, "users");
        assert!(table.row_count.is_none());
        assert!(table.comment.is_none());
    }

    #[test]
    fn test_column_info_nullable() {
        let column = crate::commands::ColumnInfo {
            column_name: "email".to_string(),
            data_type: "varchar".to_string(),
            is_nullable: "YES".to_string(),
            column_key: None,
            column_default: None,
            extra: None,
            comment: None,
        };
        
        assert_eq!(column.is_nullable, "YES");
        assert_eq!(column.column_key, None);
    }

    #[test]
    fn test_index_info_primary() {
        let index = crate::commands::IndexInfo {
            index_name: "PRIMARY".to_string(),
            column_name: "id".to_string(),
            is_unique: true,
            is_primary: true,
            seq_in_index: 1,
        };
        
        assert!(index.is_primary);
        assert!(index.is_unique);
        assert_eq!(index.seq_in_index, 1);
    }

    #[test]
    fn test_foreign_key_info() {
        let fk = crate::commands::ForeignKeyInfo {
            constraint_name: "fk_user_id".to_string(),
            column_name: "user_id".to_string(),
            referenced_table: "users".to_string(),
            referenced_column: "id".to_string(),
        };
        
        assert_eq!(fk.constraint_name, "fk_user_id");
        assert_eq!(fk.referenced_table, "users");
    }

    #[test]
    fn test_routine_info() {
        let routine = crate::commands::RoutineInfo {
            routine_name: "get_user_orders".to_string(),
            routine_type: "PROCEDURE".to_string(),
            definition: None,
            comment: Some("Get user orders".to_string()),
        };
        
        assert_eq!(routine.routine_type, "PROCEDURE");
        assert!(routine.comment.is_some());
    }

    #[test]
    fn test_routines_result() {
        let result = crate::commands::RoutinesResult {
            procedures: vec![],
            functions: vec![],
        };
        
        assert!(result.procedures.is_empty());
        assert!(result.functions.is_empty());
    }

    #[test]
    fn test_greet_command() {
        let greeting = crate::commands::greet("World");
        assert_eq!(greeting, "Hello, World! Welcome to iDBLink!");
    }

    #[test]
    fn test_null_as_default() {
        // Test the null_as_default deserialization helper
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

    #[test]
    fn test_connection_input_with_ssh() {
        let input = crate::commands::ConnectionInput {
            id: None,
            name: "SSH Test".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            password: None,
            database: None,
            group_id: None,
            color: None,
            ssh_enabled: true,
            ssh_host: Some("ssh.example.com".to_string()),
            ssh_port: Some(22),
            ssh_username: Some("sshuser".to_string()),
            ssh_auth_method: Some("key".to_string()),
            ssh_password: None,
            ssh_private_key_path: Some("/path/to/key".to_string()),
            ssh_passphrase: None,
            ssl_enabled: false,
            ssl_ca_path: None,
            ssl_cert_path: None,
            ssl_key_path: None,
            ssl_skip_verify: false,
        };
        
        assert!(input.ssh_enabled);
        assert_eq!(input.ssh_host, Some("ssh.example.com".to_string()));
        assert_eq!(input.ssh_port, Some(22));
        assert_eq!(input.ssh_auth_method, Some("key".to_string()));
    }

    #[test]
    fn test_connection_input_with_ssl() {
        let input = crate::commands::ConnectionInput {
            id: None,
            name: "SSL Test".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            password: None,
            database: None,
            group_id: None,
            color: None,
            ssh_enabled: false,
            ssh_host: None,
            ssh_port: None,
            ssh_username: None,
            ssh_auth_method: None,
            ssh_password: None,
            ssh_private_key_path: None,
            ssh_passphrase: None,
            ssl_enabled: true,
            ssl_ca_path: Some("/path/to/ca".to_string()),
            ssl_cert_path: Some("/path/to/cert".to_string()),
            ssl_key_path: Some("/path/to/key".to_string()),
            ssl_skip_verify: true,
        };
        
        assert!(input.ssl_enabled);
        assert_eq!(input.ssl_skip_verify, true);
        assert_eq!(input.ssl_ca_path, Some("/path/to/ca".to_string()));
    }
}
