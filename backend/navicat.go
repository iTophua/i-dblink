package backend

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"

	"time"

	"github.com/google/uuid"
	"idblink/backend/localdb"
)

type ncxConnections struct {
	XMLName    xml.Name       `xml:"Connections"`
	Ver        string         `xml:"Ver,attr"`
	Connections []ncxConnection `xml:"Connection"`
}

type ncxConnection struct {
	ConnectionName string `xml:"ConnectionName,attr"`
	ConnType       string `xml:"ConnType,attr"`
	Host           string `xml:"Host,attr"`
	Port           string `xml:"Port,attr"`
	UserName       string `xml:"UserName,attr"`
	Password       string `xml:"Password,attr"`
	SavePassword   string `xml:"SavePassword,attr"`
	SSH            string `xml:"SSH,attr"`
	SSHHost        string `xml:"SSHHost,attr"`
	SSHPort        string `xml:"SSHPort,attr"`
	SSHUserName    string `xml:"SSHUserName,attr"`
	SSL            string `xml:"SSL,attr"`
	Remarks        string `xml:"Remarks,attr"`
}

var navicatConnTypeMap = map[string]string{
	"MYSQL":      "mysql",
	"MYSQL_SSH":  "mysql",
	"MariaDB":    "mariadb",
	"PGSQL":      "postgresql",
	"PGSQL_SSH":  "postgresql",
	"ORACLE":     "oracle",
	"ORACLE_SSH": "oracle",
	"MSSQL":      "sqlserver",
	"MSSQL_SSH":  "sqlserver",
	"SQLITE":     "sqlite",
	"REDIS":      "redis",
	"MONGODB":    "mongodb",
}

func decryptNavicatAES(encryptedHex string) (string, error) {
	key := []byte("libcckeylibcckey")
	iv := []byte("libcciv libcciv ")

	ciphertext, err := hex.DecodeString(encryptedHex)
	if err != nil {
		return "", fmt.Errorf("invalid hex: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	if len(ciphertext)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext not multiple of block size")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	padLen := int(plaintext[len(plaintext)-1])
	if padLen > 0 && padLen <= aes.BlockSize {
		plaintext = plaintext[:len(plaintext)-padLen]
	}

	return string(plaintext), nil
}

func parseNCX(xmlContent string) (*ncxConnections, error) {
	content := strings.TrimLeft(xmlContent, "\xef\xbb\xbf\uFEFF\x00\x00\xff\xfe")
	content = strings.TrimSpace(content)
	var ncx ncxConnections
	if err := xml.Unmarshal([]byte(content), &ncx); err != nil {
		return nil, fmt.Errorf("invalid NCX XML: %w", err)
	}
	return &ncx, nil
}

func ncxToDbConnection(nc ncxConnection) (*localdb.DbConnection, *string, error) {
	dbType, ok := navicatConnTypeMap[strings.ToUpper(nc.ConnType)]
	if !ok {
		dbType = strings.ToLower(nc.ConnType)
	}

	port := 3306
	if nc.Port != "" {
		if p, err := strconv.Atoi(nc.Port); err == nil {
			port = p
		}
	}

	name := nc.ConnectionName
	if name == "" {
		name = fmt.Sprintf("%s:%d", nc.Host, port)
	}

	now := time.Now()
	conn := &localdb.DbConnection{
		ID:        uuid.New().String(),
		Name:      name,
		DbType:    dbType,
		Host:      nc.Host,
		Port:      port,
		Username:  nc.UserName,
		CreatedAt: now,
		UpdatedAt: now,
	}

	var password *string
	if nc.SavePassword == "true" && nc.Password != "" {
		decrypted, err := decryptNavicatAES(nc.Password)
		if err == nil && decrypted != "" {
			password = &decrypted
		}
	}

	if strings.EqualFold(nc.SSH, "true") {
		conn.SSHHost = emptyIfNil(nc.SSHHost)
		if nc.SSHPort != "" {
			conn.SSHPort = &nc.SSHPort
		}
		conn.SSHUsername = emptyIfNil(nc.SSHUserName)
	}

	return conn, password, nil
}

func emptyIfNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
