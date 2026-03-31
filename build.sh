#!/bin/bash

# 构建项目并复制资源文件

echo "正在构建项目..."
cd bookmark-app
npm run build

echo ""
echo "正在复制资源文件..."
cd ..

if [ -d "png" ]; then
    cp -r png bookmark-app/dist/
    echo "✓ 已复制 png 文件夹"
else
    echo "✗ png 文件夹不存在"
fi

if [ -d "gif" ]; then
    cp -r gif bookmark-app/dist/
    echo "✓ 已复制 gif 文件夹"
else
    echo "✗ gif 文件夹不存在"
fi

if [ -f "favicon.ico" ]; then
    cp favicon.ico bookmark-app/dist/
    echo "✓ 已复制 favicon.ico"
else
    echo "✗ favicon.ico 不存在"
fi

echo ""
echo "构建完成！现在可以加载扩展了。"
echo ""
echo "步骤："
echo "1. 打开 Chrome 扩展管理页面 (chrome://extensions/)"
echo "2. 启用开发者模式"
echo "3. 点击'加载已解压的扩展程序'"
echo "4. 选择 bookmark-app/dist 目录"
