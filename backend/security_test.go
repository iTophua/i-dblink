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
	key1 := getKey()
	key2 := getKey()

	for i := range key1 {
		if key1[i] != key2[i] {
			t.Error("key mismatch on same machine")
			break
		}
	}
}
