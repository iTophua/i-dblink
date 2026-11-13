package mcpserver

import (
	"testing"

	"idblink/backend"
)

func connWithSSH(id string) backend.ConnectionOutput {
	port := 2222
	host := "jump.example.com"
	user := "deploy"
	auth := "key"
	keyPath := "/Users/me/.ssh/id_ed25519"
	return backend.ConnectionOutput{
		ID:                id,
		Name:              "prod",
		DbType:            "mysql",
		Host:              "10.0.0.8",
		Port:              3306,
		Username:          "app",
		SSHEnabled:        true,
		SSHHost:           &host,
		SSHPort:           &port,
		SSHUsername:       &user,
		SSHAuthMethod:     &auth,
		SSHPrivateKeyPath: &keyPath,
	}
}

func TestParseSSHInputAndApplyNew(t *testing.T) {
	t.Run("password auth inferred", func(t *testing.T) {
		args := map[string]any{
			"ssh_host":     "jump.example.com",
			"ssh_port":     float64(2200),
			"ssh_username": "deploy",
			"ssh_password": "secret",
		}
		var input backend.ConnectionInput
		if err := applyNewSSH(parseSSHInput(args), &input); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !input.SSHEnabled || input.SSHHost == nil || *input.SSHHost != "jump.example.com" {
			t.Fatalf("host not applied: %+v", input)
		}
		if input.SSHPort == nil || *input.SSHPort != 2200 {
			t.Errorf("port = %v, want 2200", input.SSHPort)
		}
		if input.SSHAuthMethod == nil || *input.SSHAuthMethod != "password" {
			t.Errorf("auth method = %v, want password", input.SSHAuthMethod)
		}
		if input.SSHPassword == nil || *input.SSHPassword != "secret" {
			t.Errorf("password not applied")
		}
	})

	t.Run("key auth inferred from private key path", func(t *testing.T) {
		args := map[string]any{
			"ssh_host":             "jump.example.com",
			"ssh_private_key_path": "/home/me/.ssh/id_rsa",
			"ssh_passphrase":       "phrase",
			"ssh_auth_method":      "",
		}
		var input backend.ConnectionInput
		if err := applyNewSSH(parseSSHInput(args), &input); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if input.SSHAuthMethod == nil || *input.SSHAuthMethod != "key" {
			t.Errorf("auth method = %v, want key", input.SSHAuthMethod)
		}
		if input.SSHPrivateKeyPath == nil || *input.SSHPrivateKeyPath != "/home/me/.ssh/id_rsa" {
			t.Errorf("key path not applied")
		}
		if input.SSHPassphrase == nil || *input.SSHPassphrase != "phrase" {
			t.Errorf("passphrase not applied")
		}
	})

	t.Run("key auth without path is rejected", func(t *testing.T) {
		args := map[string]any{"ssh_host": "jump.example.com", "ssh_auth_method": "key"}
		var input backend.ConnectionInput
		if err := applyNewSSH(parseSSHInput(args), &input); err == nil {
			t.Fatal("want error for key auth without ssh_private_key_path")
		}
	})

	t.Run("missing host is rejected", func(t *testing.T) {
		var input backend.ConnectionInput
		if err := applyNewSSH(parseSSHInput(map[string]any{"ssh_password": "x"}), &input); err == nil {
			t.Fatal("want error for missing ssh_host")
		}
	})

	t.Run("invalid auth method is rejected", func(t *testing.T) {
		args := map[string]any{"ssh_host": "jump.example.com", "ssh_auth_method": "agent"}
		var input backend.ConnectionInput
		if err := applyNewSSH(parseSSHInput(args), &input); err == nil {
			t.Fatal("want error for unsupported auth method")
		}
	})
}

func TestApplySSHUpdate(t *testing.T) {
	t.Run("no ssh args keeps existing config", func(t *testing.T) {
		existing := connWithSSH("id1")
		var input backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"name": "renamed"}, &input, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !input.SSHEnabled {
			t.Fatal("SSH should stay enabled")
		}
		if input.SSHHost == nil || *input.SSHHost != "jump.example.com" {
			t.Errorf("host not preserved: %v", input.SSHHost)
		}
		if input.SSHPort == nil || *input.SSHPort != 2222 {
			t.Errorf("port not preserved: %v", input.SSHPort)
		}
		if input.SSHPrivateKeyPath == nil || *input.SSHPrivateKeyPath != "/Users/me/.ssh/id_ed25519" {
			t.Errorf("key path not preserved")
		}
	})

	t.Run("ssh_enabled=false disables tunnel", func(t *testing.T) {
		existing := connWithSSH("id1")
		var input backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"ssh_enabled": false}, &input, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if input.SSHEnabled {
			t.Fatal("SSH should be disabled")
		}
		if input.SSHHost != nil {
			t.Errorf("host should be cleared, got %v", *input.SSHHost)
		}
	})

	t.Run("ssh_port=0 keeps existing port and explicit port overrides", func(t *testing.T) {
		existing := connWithSSH("id1")
		var zero backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"ssh_port": float64(0)}, &zero, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if zero.SSHPort == nil || *zero.SSHPort != 2222 {
			t.Errorf("port = %v, want existing 2222", zero.SSHPort)
		}

		var changed backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"ssh_port": float64(2200)}, &changed, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if changed.SSHPort == nil || *changed.SSHPort != 2200 {
			t.Errorf("port = %v, want 2200", changed.SSHPort)
		}
	})

	t.Run("partial update keeps host and key auth", func(t *testing.T) {
		existing := connWithSSH("id1")
		var input backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"ssh_username": "ops"}, &input, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if input.SSHHost == nil || *input.SSHHost != "jump.example.com" {
			t.Errorf("host should be preserved")
		}
		if input.SSHUsername == nil || *input.SSHUsername != "ops" {
			t.Errorf("username not overridden")
		}
		if input.SSHAuthMethod == nil || *input.SSHAuthMethod != "key" {
			t.Errorf("auth method should stay key, got %v", input.SSHAuthMethod)
		}
		if input.SSHPrivateKeyPath == nil {
			t.Errorf("key path should be preserved")
		}
	})

	t.Run("switch to password auth clears inferred need for key", func(t *testing.T) {
		existing := connWithSSH("id1")
		var input backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"ssh_password": "newpass"}, &input, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if input.SSHAuthMethod == nil || *input.SSHAuthMethod != "password" {
			t.Errorf("auth method = %v, want password", input.SSHAuthMethod)
		}
		if input.SSHPassword == nil || *input.SSHPassword != "newpass" {
			t.Errorf("password not applied")
		}
	})

	t.Run("enable ssh on a direct connection requires host", func(t *testing.T) {
		existing := connWith("id2", "mysql", "10.0.0.9", 3306, "app", nil)
		var input backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{"ssh_password": "x"}, &input, &existing); err == nil {
			t.Fatal("want error when enabling SSH without ssh_host")
		}
	})

	t.Run("enable ssh on a direct connection with host", func(t *testing.T) {
		existing := connWith("id2", "mysql", "10.0.0.9", 3306, "app", nil)
		var input backend.ConnectionInput
		if err := applySSHUpdate(map[string]any{
			"ssh_host": "jump.example.com", "ssh_username": "deploy", "ssh_password": "x",
		}, &input, &existing); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !input.SSHEnabled || input.SSHHost == nil || *input.SSHHost != "jump.example.com" {
			t.Fatalf("ssh not enabled: %+v", input)
		}
	})
}

func TestConnectionInputFromExistingPreservesConfig(t *testing.T) {
	group := "g1"
	color := "#ff0000"
	ca := "/certs/ca.pem"
	existing := connWithSSH("id1")
	existing.GroupID = &group
	existing.Color = &color
	existing.SSLEnabled = true
	existing.SSLCaPath = &ca
	existing.SSLSkipVerify = true

	input := connectionInputFromExisting(existing)
	if input.ID != "id1" || input.Name != "prod" || input.Host != "10.0.0.8" {
		t.Errorf("basic fields not preserved: %+v", input)
	}
	if input.GroupID == nil || *input.GroupID != "g1" || input.Color == nil || *input.Color != "#ff0000" {
		t.Errorf("group/color not preserved")
	}
	if !input.SSLEnabled || input.SSLCAPath == nil || *input.SSLCAPath != "/certs/ca.pem" || !input.SSLSkipVerify {
		t.Errorf("SSL config not preserved: %+v", input)
	}
	if !input.SSHEnabled || input.SSHHost == nil || *input.SSHHost != "jump.example.com" {
		t.Errorf("SSH config not preserved: %+v", input)
	}
}
