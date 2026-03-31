@echo off

REM 复制资源文件到 dist 目录

echo 正在复制资源文件到 dist 目录...

REM 复制 png 文件
if exist "..\png" (
    xcopy "..\png\*" "dist\png\" /E /I /Y
    echo ✓ 已复制 png 文件夹
) else (
    echo ✗ png 文件夹不存在
)

REM 复制 gif 文件
if exist "..\gif" (
    xcopy "..\gif\*" "dist\gif\" /E /I /Y
    echo ✓ 已复制 gif 文件夹
) else (
    echo ✗ gif 文件夹不存在
)

REM 复制 favicon
if exist "..\favicon-16x16.ico" (
    copy "..\favicon-16x16.ico" "dist\"
    echo ✓ 已复制 favicon-16x16.ico
) else (
    echo ✗ favicon-16x16.ico 不存在
)

echo.
echo 资源文件复制完成！
echo.
echo 现在可以加载扩展了：
echo 1. 打开 Chrome 扩展管理页面 (chrome://extensions/)
echo 2. 启用开发者模式
echo 3. 点击'加载已解压的扩展程序'
echo 4. 选择 bookmark-app\dist 目录

pause
