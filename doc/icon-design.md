# iDBLink 新应用图标设计

## 设计理念

新的图标采用了**几何抽象 + 未来科技感**的设计方向，完全摒弃了传统的数据库圆柱体设计，转而使用更现代、更抽象的视觉语言来表达"数据连接"的核心概念。

### 设计元素

1. **深空蓝背景** - 深蓝色到暗青色的渐变，营造科技感和深度感
2. **六边形网格** - 代表数据结构和组织，象征着数据的有序性和结构性
3. **中心六边形** - 抽象化的数据库核心，用几何图形替代传统的圆柱体
4. **数据流动线条** - 代表数据传输和连接，体现"Link"的概念
5. **发光效果** - 代表活跃的连接和数据流动
6. **粒子效果** - 装饰性元素，增加视觉层次感

### 色彩方案

- **主色调**：深蓝 `#0a1628` 到青色 `#00ffff` 的渐变
- **强调色**：亮青色 `#00ffff`，代表数据和连接
- **背景色**：深空蓝，营造科技感和专业感

### 设计特点

1. **独特性** - 完全不同于传统的数据库图标设计
2. **现代感** - 使用几何抽象和发光效果，体现未来科技感
3. **可扩展性** - 在不同尺寸下都能保持清晰度
4. **品牌一致性** - 保持了蓝色系的专业调性

## 文件结构

### 主要图标文件

- `backend/icons/icon.svg` - SVG 源文件（完整版，包含文本）
- `backend/icons/icon_simple.svg` - SVG 源文件（简化版，用于生成 PNG）
- `backend/icons/icon.icns` - macOS 应用图标
- `backend/icons/icon.ico` - Windows 应用图标

### 通用 PNG 文件

- `backend/icons/16x16.png` - 16x16 像素
- `backend/icons/32x32.png` - 32x32 像素
- `backend/icons/48x48.png` - 48x48 像素
- `backend/icons/64x64.png` - 64x64 像素
- `backend/icons/128x128.png` - 128x128 像素
- `backend/icons/128x128@2x.png` - 256x256 像素（Retina）
- `backend/icons/256x256.png` - 256x256 像素
- `backend/icons/512x512.png` - 512x512 像素

### Windows Store 磁贴图标

- `backend/icons/Square30x30Logo.png` - 30x30 像素
- `backend/icons/Square44x44Logo.png` - 44x44 像素
- `backend/icons/Square71x71Logo.png` - 71x71 像素
- `backend/icons/Square89x89Logo.png` - 89x89 像素
- `backend/icons/Square107x107Logo.png` - 107x107 像素
- `backend/icons/Square142x142Logo.png` - 142x142 像素
- `backend/icons/Square150x150Logo.png` - 150x150 像素
- `backend/icons/Square284x284Logo.png` - 284x284 像素
- `backend/icons/Square310x310Logo.png` - 310x310 像素

### 前端资源

- `frontend/public/favicon.png` - 浏览器 favicon（32x32 像素）

### 构建资源

- `build/appicon.png` - Wails 构建用的应用图标
- `build/appicon.svg` - 构建用的 SVG 文件

## 使用方法

### 重新生成图标

如果需要重新生成所有图标文件，可以运行以下脚本：

```bash
./scripts/generate-icons.sh
```

### 生成 macOS .icns 文件

如果需要重新生成 macOS .icns 文件，请按照以下步骤操作：

```bash
cd backend/icons
mkdir icon.iconset
sips -z 16 16 icon_16x16.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon_16x16.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon_32x32.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon_32x32.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon_128x128.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon_128x128.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon_256x256.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon_256x256.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon_512x512.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon_1024x1024.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

## 设计对比

### 旧图标

- **风格**：传统科技风格，蓝色渐变背景
- **元素**：白色数据库圆柱体 + 网络连接节点
- **色彩**：蓝色系渐变 `#0050b3` → `#1890ff`
- **特点**：直观但较为传统

### 新图标

- **风格**：几何抽象 + 未来科技感
- **元素**：六边形网格 + 数据流动线条 + 发光效果
- **色彩**：深空蓝到青色的渐变 `#0a1628` → `#00ffff`
- **特点**：独特、现代、具有未来感

## 技术细节

### SVG 文件说明

- **视图框**：128x128 像素
- **背景**：深蓝色渐变，带有细微的网格纹理
- **滤镜**：使用高斯模糊创建发光效果
- **渐变**：多种渐变效果，增加视觉层次

### 生成脚本

- **依赖**：ImageMagick（magick 命令）
- **平台**：macOS、Linux
- **输出**：所有必要的图标尺寸

## 注意事项

1. **字体问题**：完整版 SVG 包含文本元素，需要系统字体支持
2. **简化版本**：用于生成 PNG 的简化版本移除了文本元素，确保兼容性
3. **Retina 支持**：所有图标都支持 Retina 显示屏
4. **跨平台**：图标已适配 macOS、Windows 和 Web 平台

## 下一步

1. 在 macOS 上测试新图标的显示效果
2. 在 Windows 上测试新图标的显示效果
3. 更新应用程序的启动画面和关于对话框
4. 更新文档和营销材料中的图标

---

**设计日期**：2026年7月4日  
**设计师**：iDBLink Team  
**版本**：1.0.0