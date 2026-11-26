package backend

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// 对话历史的入口是绑定方法，长度不能只靠前端约束
func TestAIChatStoreLimits(t *testing.T) {
	assert.NoError(t, aiChatContextAllowed(strings.Repeat("x", aiChatContextMaxBytes)))
	assert.Error(t, aiChatContextAllowed(strings.Repeat("x", aiChatContextMaxBytes+1)))

	// 标题按字符截断，不会把多字节字符切成半个
	title := strings.Repeat("对", aiChatTitleMaxRunes+5)
	clip := truncateRunes(title, aiChatTitleMaxRunes)
	assert.Equal(t, aiChatTitleMaxRunes+len([]rune("…(truncated)")), len([]rune(clip)))
	assert.True(t, strings.HasSuffix(clip, "…(truncated)"))
}
