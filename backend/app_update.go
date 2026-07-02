package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AppVersion 应用版本号，编译时通过 ldflags 注入
var AppVersion = "0.1.0"

// UpdateInfo 更新信息
type UpdateInfo struct {
	CurrentVersion string `json:"current_version"`
	LatestVersion  string `json:"latest_version"`
	HasUpdate      bool   `json:"has_update"`
	ReleaseNotes   string `json:"release_notes"`
	DownloadURL    string `json:"download_url"`
	PublishedAt    string `json:"published_at"`
}

// GitHubRelease GitHub Release API 响应
type GitHubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	PublishedAt string `json:"published_at"`
	HTMLURL     string `json:"html_url"`
	Assets      []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// CheckForUpdate 检查是否有新版本
func (a *App) CheckForUpdate() (UpdateInfo, error) {
	result := UpdateInfo{
		CurrentVersion: AppVersion,
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/nicexiaobai123/iDBLink/releases/latest")
	if err != nil {
		return result, fmt.Errorf("检查更新失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// 没有 release
		result.HasUpdate = false
		return result, nil
	}
	if resp.StatusCode != http.StatusOK {
		return result, fmt.Errorf("GitHub API 返回状态码: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return result, fmt.Errorf("读取响应失败: %w", err)
	}

	var release GitHubRelease
	if err := json.Unmarshal(body, &release); err != nil {
		return result, fmt.Errorf("解析响应失败: %w", err)
	}

	latestVersion := normalizeVersion(release.TagName)
	currentVersion := normalizeVersion(AppVersion)

	result.LatestVersion = release.TagName
	result.ReleaseNotes = release.Body
	result.DownloadURL = release.HTMLURL
	result.PublishedAt = release.PublishedAt
	result.HasUpdate = compareVersions(latestVersion, currentVersion) > 0

	return result, nil
}

// GetAppVersion 获取当前应用版本
func (a *App) GetAppVersion() string {
	return AppVersion
}

// normalizeVersion 去掉版本号前的 v 前缀
func normalizeVersion(v string) string {
	return strings.TrimPrefix(strings.TrimSpace(v), "v")
}

// compareVersions 比较两个语义化版本号，返回 1/0/-1
func compareVersions(a, b string) int {
	aParts := strings.Split(a, ".")
	bParts := strings.Split(b, ".")

	// 补齐到 3 段
	for len(aParts) < 3 {
		aParts = append(aParts, "0")
	}
	for len(bParts) < 3 {
		bParts = append(bParts, "0")
	}

	for i := 0; i < 3; i++ {
		aNum := parseInt(aParts[i])
		bNum := parseInt(bParts[i])
		if aNum > bNum {
			return 1
		}
		if aNum < bNum {
			return -1
		}
	}
	return 0
}

func parseInt(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		} else {
			break
		}
	}
	return n
}
