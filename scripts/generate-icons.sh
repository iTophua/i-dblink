#!/bin/bash

# 图标生成脚本
# 使用 ImageMagick 从 SVG 生成所有需要的 PNG 尺寸

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    print_info "检查依赖..."
    
    if ! command -v magick &> /dev/null; then
        print_error "ImageMagick 未安装。请先安装 ImageMagick："
        echo "  macOS: brew install imagemagick"
        echo "  Ubuntu: sudo apt-get install imagemagick"
        exit 1
    fi
    
    print_success "ImageMagick 已安装"
}

# 生成通用 PNG 文件
generate_png_files() {
    local svg_file="$1"
    local output_dir="$2"
    
    print_info "生成通用 PNG 文件..."
    
    # 定义所有需要的尺寸
    local sizes=(
        "16x16"
        "32x32"
        "48x48"
        "64x64"
        "128x128"
        "128x128@2x"
        "256x256"
        "512x512"
    )
    
    for size in "${sizes[@]}"; do
        local output_file="${output_dir}/${size}.png"
        
        # 特殊处理 @2x 尺寸
        if [[ "$size" == *"@"* ]]; then
            # 提取基础尺寸，例如 128x128@2x -> 256x256
            local base_size=$(echo "$size" | sed 's/@2x//')
            local width=$(echo "$base_size" | cut -d'x' -f1)
            local height=$(echo "$base_size" | cut -d'x' -f2)
            local actual_size="$((width * 2))x$((height * 2))"
            print_info "  生成 $size -> ${actual_size} 像素"
            magick -background none -density 300 "$svg_file" -resize "${actual_size}!" "$output_file"
        else
            print_info "  生成 $size"
            magick -background none -density 300 "$svg_file" -resize "${size}!" "$output_file"
        fi
        
        if [ $? -eq 0 ]; then
            print_success "  ✓ $output_file"
        else
            print_error "  ✗ 生成 $output_file 失败"
        fi
    done
}

# 生成 Windows Store 磁贴图标
generate_windows_store_icons() {
    local svg_file="$1"
    local output_dir="$2"
    
    print_info "生成 Windows Store 磁贴图标..."
    
    # Windows Store 磁贴尺寸
    local sizes=(
        "Square30x30Logo"
        "Square44x44Logo"
        "Square71x71Logo"
        "Square89x89Logo"
        "Square107x107Logo"
        "Square142x142Logo"
        "Square150x150Logo"
        "Square284x284Logo"
        "Square310x310Logo"
        "StoreLogo"
    )
    
    for name in "${sizes[@]}"; do
        # 从名称中提取尺寸
        local size=$(echo "$name" | grep -o '[0-9]*x[0-9]*' | head -1)
        
        if [ -n "$size" ]; then
            local output_file="${output_dir}/${name}.png"
            print_info "  生成 $name (${size})"
            magick -background none -density 300 "$svg_file" -resize "${size}!" "$output_file"
            
            if [ $? -eq 0 ]; then
                print_success "  ✓ $output_file"
            else
                print_error "  ✗ 生成 $output_file 失败"
            fi
        fi
    done
    
    # StoreLogo 特殊处理（通常较小）
    local store_logo="${output_dir}/StoreLogo.png"
    if [ ! -f "$store_logo" ]; then
        print_info "  生成 StoreLogo (50x50)"
        magick -background none -density 300 "$svg_file" -resize "50x50!" "$store_logo"
    fi
}

# 生成 macOS 图标
generate_macos_icon() {
    local svg_file="$1"
    local output_dir="$2"
    
    print_info "生成 macOS 图标..."
    
    # macOS 需要 16x16 到 1024x1024 的多个尺寸
    local sizes=(
        "16x16"
        "32x32"
        "128x128"
        "256x256"
        "512x512"
        "1024x1024"
    )
    
    # 生成所有尺寸的 PNG
    for size in "${sizes[@]}"; do
        local output_file="${output_dir}/icon_${size}.png"
        print_info "  生成 macOS 图标: $size"
        magick -background none -density 300 "$svg_file" -resize "${size}!" "$output_file"
        
        if [ $? -eq 0 ]; then
            print_success "  ✓ $output_file"
        else
            print_error "  ✗ 生成 $output_file 失败"
        fi
    done
    
    # 注意：生成 .icns 文件需要 iconutil（macOS 专有工具）
    print_warning "注意：生成 .icns 文件需要 macOS 的 iconutil 工具"
    print_info "请运行以下命令生成 .icns 文件："
    echo "  mkdir icon.iconset"
    echo "  sips -z 16 16     icon_16x16.png --out icon.iconset/icon_16x16.png"
    echo "  sips -z 32 32     icon_16x16.png --out icon.iconset/icon_16x16@2x.png"
    echo "  sips -z 32 32     icon_32x32.png --out icon.iconset/icon_32x32.png"
    echo "  sips -z 64 64     icon_32x32.png --out icon.iconset/icon_32x32@2x.png"
    echo "  sips -z 128 128   icon_128x128.png --out icon.iconset/icon_128x128.png"
    echo "  sips -z 256 256   icon_128x128.png --out icon.iconset/icon_128x128@2x.png"
    echo "  sips -z 256 256   icon_256x256.png --out icon.iconset/icon_256x256.png"
    echo "  sips -z 512 512   icon_256x256.png --out icon.iconset/icon_256x256@2x.png"
    echo "  sips -z 512 512   icon_512x512.png --out icon.iconset/icon_512x512.png"
    echo "  sips -z 1024 1024 icon_1024x1024.png --out icon.iconset/icon_512x512@2x.png"
    echo "  iconutil -c icns icon.iconset -o icon.icns"
    echo "  rm -rf icon.iconset"
}

# 生成 Windows ICO 文件
generate_windows_ico() {
    local svg_file="$1"
    local output_dir="$2"
    
    print_info "生成 Windows ICO 文件..."
    
    # ICO 文件需要多个尺寸
    local ico_sizes=(
        "16x16"
        "32x32"
        "48x48"
        "64x64"
        "128x128"
        "256x256"
    )
    
    # 先生成所有尺寸的 PNG
    local temp_dir=$(mktemp -d)
    local png_files=()
    
    for size in "${ico_sizes[@]}"; do
        local temp_file="${temp_dir}/icon_${size}.png"
        magick -background none -density 300 "$svg_file" -resize "${size}!" "$temp_file"
        png_files+=("$temp_file")
    done
    
    # 使用 ImageMagick 合并为 ICO
    magick "${png_files[@]}" "${output_dir}/icon.ico"
    
    if [ $? -eq 0 ]; then
        print_success "  ✓ ${output_dir}/icon.ico"
    else
        print_error "  ✗ 生成 ${output_dir}/icon.ico 失败"
    fi
    
    # 清理临时文件
    rm -rf "$temp_dir"
}

# 生成前端 favicon
generate_favicon() {
    local svg_file="$1"
    local output_dir="$2"
    
    print_info "生成前端 favicon..."
    
    # favicon 通常为 32x32 或 16x16
    local favicon_file="${output_dir}/favicon.png"
    magick -background none -density 300 "$svg_file" -resize "32x32!" "$favicon_file"
    
    if [ $? -eq 0 ]; then
        print_success "  ✓ $favicon_file"
    else
        print_error "  ✗ 生成 $favicon_file 失败"
    fi
}

# 主函数
main() {
    print_info "开始生成应用图标..."
    
    # 检查依赖
    check_dependencies
    
    # 设置路径
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(dirname "$script_dir")"
    local svg_file="${project_root}/backend/icons/icon_simple.svg"
    local icons_dir="${project_root}/backend/icons"
    local build_dir="${project_root}/build"
    local frontend_dir="${project_root}/frontend/public"
    
    # 检查 SVG 文件是否存在
    if [ ! -f "$svg_file" ]; then
        print_error "SVG 文件不存在: $svg_file"
        exit 1
    fi
    
    print_info "使用 SVG 文件: $svg_file"
    
    # 创建必要的目录
    mkdir -p "$build_dir/darwin"
    
    # 生成通用 PNG 文件
    generate_png_files "$svg_file" "$icons_dir"
    
    # 生成 Windows Store 图标
    generate_windows_store_icons "$svg_file" "$icons_dir"
    
    # 生成 macOS 图标
    generate_macos_icon "$svg_file" "$icons_dir"
    
    # 生成 Windows ICO 文件
    generate_windows_ico "$svg_file" "$icons_dir"
    
    # 生成前端 favicon
    generate_favicon "$svg_file" "$frontend_dir"
    
    # 复制到构建目录
    print_info "复制图标到构建目录..."
    cp "$icons_dir/icon.svg" "$build_dir/appicon.svg"
    cp "$icons_dir/icon.png" "$build_dir/appicon.png"
    
    print_success "图标生成完成！"
    print_info "生成的文件位于："
    echo "  - $icons_dir/ (主要图标目录)"
    echo "  - $build_dir/ (构建目录)"
    echo "  - $frontend_dir/favicon.png (前端 favicon)"
    
    print_warning "注意："
    echo "  1. .icns 文件需要使用 macOS 的 iconutil 工具生成"
    echo "  2. 建议在 macOS 上测试图标效果"
    echo "  3. 图标已更新为新的设计风格"
}

# 运行主函数
main "$@"