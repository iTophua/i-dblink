use crate::commands::{ConnectionInput, ConnectionOutput, GroupInput, GroupOutput, TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo};
use crate::db::{DbConnection, ConnectionGroup};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_input_deserialization() {
        let json = r#"{
            "id": "test-id",
            "name": "Test Connection",
            "db_type": "mysql",
            "host": "localhost",
            "port": 3306,
            "username": "root",
            "password": "secret",
            "database": "testdb",
            "group_id": "group-1",
            "color": "#1890ff",
            "ssh_enabled": false,
            "ssl_enabled": false
        }"#;

        let input: ConnectionInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.id, Some("test-id".to_string()));
        assert_eq!(input.name, "Test Connection");
        assert_eq!(input.db_type, "mysql");
        assert_eq!(input.host, "localhost");
        assert_eq!(input.port, 3306);
        assert_eq!(input.username, "root");
        assert_eq!(input.password, Some("secret".to_string()));
        assert_eq!(input.database, Some("testdb".to_string()));
        assert_eq!(input.group_id, Some("group-1".to_string()));
        assert_eq!(input.color, Some("#1890ff".to_string()));
        assert!(!input.ssh_enabled);
        assert!(!input.ssl_enabled);
    }

    #[test]
    fn test_connection_input_null_password() {
        let json = r#"{
            "name": "Test",
            "db_type": "mysql",
            "host": "localhost",
            "port": 3306,
            "username": "root",
            "password": null,
            "ssh_enabled": false,
            "ssl_enabled": false
        }"#;

        let input: ConnectionInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.password, None);
    }

    #[test]
    fn test_connection_input_optional_fields() {
        let json = r#"{
            "name": "Test",
            "db_type": "mysql",
            "host": "localhost",
            "port": 3306,
            "username": "root"
        }"#;

        let input: ConnectionInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.id, None);
        assert_eq!(input.password, None);
        assert_eq!(input.database, None);
        assert_eq!(input.group_id, None);
        assert_eq!(input.color, None);
        assert!(!input.ssh_enabled);
        assert!(!input.ssl_enabled);
    }

    #[test]
    fn test_connection_output_from_db_connection() {
        let db_conn = DbConnection {
            id: "test-id".to_string(),
            name: "Test".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            database: Some("testdb".to_string()),
            group_id: Some("group-1".to_string()),
            color: Some("#1890ff".to_string()),
            ssh_host: Some("ssh.example.com".to_string()),
            ssh_port: Some(22),
            ssh_username: Some("sshuser".to_string()),
            ssh_auth_method: Some("password".to_string()),
            ssh_private_key_path: None,
            ssl_enabled: Some(true),
            ssl_ca_path: Some("/path/to/ca".to_string()),
            ssl_cert_path: None,
            ssl_key_path: None,
            ssl_skip_verify: Some(false),
        };

        let output: ConnectionOutput = db_conn.into();
        assert_eq!(output.id, "test-id");
        assert_eq!(output.status, "disconnected");
        assert!(output.ssh_enabled);
        assert!(output.ssl_enabled);
    }

    #[test]
    fn test_connection_output_no_ssh_ssl() {
        let db_conn = DbConnection {
            id: "test-id".to_string(),
            name: "Test".to_string(),
            db_type: "mysql".to_string(),
            host: "localhost".to_string(),
            port: 3306,
            username: "root".to_string(),
            database: None,
            group_id: None,
            color: None,
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
        };

        let output: ConnectionOutput = db_conn.into();
        assert!(!output.ssh_enabled);
        assert!(!output.ssl_enabled);
    }

    #[test]
    fn test_group_input_deserialization() {
        let json = r#"{
            "id": "group-1",
            "name": "Production",
            "icon": "🚀",
            "color": "#ff4d4f",
            "parent_id": null
        }"#;

        let input: GroupInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.id, Some("group-1".to_string()));
        assert_eq!(input.name, "Production");
        assert_eq!(input.icon, "🚀");
        assert_eq!(input.color, "#ff4d4f");
        assert_eq!(input.parent_id, None);
    }

    #[test]
    fn test_group_output_from_connection_group() {
        let group = ConnectionGroup {
            id: "group-1".to_string(),
            name: "Production".to_string(),
            icon: "🚀".to_string(),
            color: "#ff4d4f".to_string(),
            parent_id: Some("parent-1".to_string()),
        };

        let output: GroupOutput = group.into();
        assert_eq!(output.id, "group-1");
        assert_eq!(output.name, "Production");
        assert_eq!(output.icon, "🚀");
        assert_eq!(output.color, "#ff4d4f");
        assert_eq!(output.parent_id, Some("parent-1".to_string()));
    }

    #[test]
    fn test_table_info_serialization() {
        let table = TableInfo {
            table_name: "users".to_string(),
            table_type: "BASE TABLE".to_string(),
            row_count: Some(100),
            comment: Some("Users table".to_string()),
            engine: Some("InnoDB".to_string()),
            data_size: Some("16384".to_string()),
            index_size: Some("0".to_string()),
            create_time: Some("2024-01-01 00:00:00".to_string()),
            update_time: Some("2024-01-02 00:00:00".to_string()),
            collation: Some("utf8mb4_unicode_ci".to_string()),
        };

        let json = serde_json::to_string(&table).unwrap();
        assert!(json.contains("users"));
        assert!(json.contains("BASE TABLE"));
        
        let deserialized: TableInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.table_name, "users");
        assert_eq!(deserialized.row_count, Some(100));
    }

    #[test]
    fn test_column_info_serialization() {
        let column = ColumnInfo {
            column_name: "id".to_string(),
            data_type: "int".to_string(),
            is_nullable: "NO".to_string(),
            column_key: Some("PRI".to_string()),
            column_default: None,
            extra: Some("auto_increment".to_string()),
            comment: Some("Primary key".to_string()),
        };

        let json = serde_json::to_string(&column).unwrap();
        let deserialized: ColumnInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.column_name, "id");
        assert_eq!(deserialized.column_key, Some("PRI".to_string()));
        assert_eq!(deserialized.column_default, None);
    }

    #[test]
    fn test_index_info_serialization() {
        let index = IndexInfo {
            index_name: "PRIMARY".to_string(),
            column_name: "id".to_string(),
            is_unique: true,
            is_primary: true,
            seq_in_index: 1,
        };

        let json = serde_json::to_string(&index).unwrap();
        let deserialized: IndexInfo = serde_json::from_str(&json).unwrap();
        assert!(deserialized.is_unique);
        assert!(deserialized.is_primary);
    }

    #[test]
    fn test_foreign_key_info_serialization() {
        let fk = ForeignKeyInfo {
            constraint_name: "fk_orders_user".to_string(),
            column_name: "user_id".to_string(),
            referenced_table: "users".to_string(),
            referenced_column: "id".to_string(),
        };

        let json = serde_json::to_string(&fk).unwrap();
        let deserialized: ForeignKeyInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.referenced_table, "users");
    }

    #[test]
    fn test_active_connections() {
        use tokio::runtime::Runtime;
        
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let active = crate::commands::ActiveConnections::new();
            
            assert!(!active.contains("conn-1").await);
            
            active.add("conn-1".to_string()).await;
            assert!(active.contains("conn-1").await);
            
            active.add("conn-2".to_string()).await;
            assert!(active.contains("conn-2").await);
            
            let removed = active.remove("conn-1").await;
            assert!(removed);
            assert!(!active.contains("conn-1").await);
            
            let removed = active.remove("non-existent").await;
            assert!(!removed);
        });
    }
}
