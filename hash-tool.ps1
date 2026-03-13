[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "File Hash Tool"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) {
    $scriptDir = Get-Location
}

while ($true) {
    Clear-Host
    Write-Host "========================================"
    Write-Host "          文件哈希工具"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "  [1] 单文件/文件夹模式"
    Write-Host "  [2] 双文件夹对比模式"
    Write-Host "  [0] 退出"
    Write-Host ""
    $mode = Read-Host "请选择模式"

    if ($mode -eq "0" -or $mode -eq "exit") {
        break
    }

    if ($mode -eq "2") {
        Write-Host ""
        $folder1 = Read-Host "请输入文件夹1路径"
        if ([string]::IsNullOrWhiteSpace($folder1)) {
            Write-Host "[错误] 未输入路径"
            Write-Host "按任意键继续..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            continue
        }
        $folder2 = Read-Host "请输入文件夹2路径"
        if ([string]::IsNullOrWhiteSpace($folder2)) {
            Write-Host "[错误] 未输入路径"
            Write-Host "按任意键继续..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            continue
        }
        Write-Host ""
        Write-Host "正在对比..."
        $scriptPath = Join-Path $scriptDir "hash-script.js"
        $folder1 = $folder1.Trim('"')
        $folder2 = $folder2.Trim('"')
        & node $scriptPath --compare $folder1 $folder2
        Write-Host ""
    } elseif ($mode -eq "1" -or $mode -eq "") {
        Write-Host ""
        Write-Host "  提示: 可拖拽文件或文件夹到此窗口"
        Write-Host "  提示: 多个文件用 ; 分隔"
        Write-Host ""
        $target = Read-Host "请输入路径"
        if ([string]::IsNullOrWhiteSpace($target)) {
            Write-Host "[错误] 未输入路径"
            Write-Host "按任意键继续..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            continue
        }
        Write-Host ""
        Write-Host "正在处理..."
        $scriptPath = Join-Path $scriptDir "hash-script.js"
        $target = $target.Trim('"')
        & node $scriptPath $target
        Write-Host ""
    } else {
        Write-Host "[错误] 无效的选择"
        Write-Host "按任意键继续..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        continue
    }

    Write-Host "按任意键继续..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
