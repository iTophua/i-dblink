package backend

import "testing"

func TestEncryptDecrypt(t *testing.T) {
	password := "my_secret_password_123!"
	encrypted, err := EncryptPassword(password)
	if err != nil {
		t.Fatalf("EncryptPassword failed: %v", err)
	}

	decrypted, err := DecryptPassword(encrypted)
	if err != nil {
		t.Fatalf("DecryptPassword failed: %v", err)
	}

	if decrypted != password {
		t.Errorf("decrypted password mismatch: got %q, want %q", decrypted, password)
	}
}

func TestSameMachineSameKey(t *testing.T) {
	key1, err := getKey()
	if err != nil {
		t.Fatalf("getKey() first call failed: %v", err)
	}
	key2, err := getKey()
	if err != nil {
		t.Fatalf("getKey() second call failed: %v", err)
	}

	if len(key1) != len(key2) {
		t.Fatalf("key length mismatch: %d vs %d", len(key1), len(key2))
	}
	for i := range key1 {
		if key1[i] != key2[i] {
			t.Error("key mismatch on same machine")
			break
		}
	}
}
