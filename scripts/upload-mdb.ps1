# 上傳 data-export\weather.mdb 到 ll3 的 /database/weather.mdb（FTP 帳號 ll3_db，根目錄就是 /database）
# 用法：$env:FTP_PW='密碼'; powershell -File scripts\upload-mdb.ps1 [-Force]
# 線上已經有 weather.mdb 時：先下載備份到 data-export\backup\，沒加 -Force 就不覆蓋
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$pw = $env:FTP_PW
if (-not $pw) { throw '請先設定 $env:FTP_PW' }
$root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $root 'data-export\weather.mdb'
if (-not (Test-Path $local)) { throw "找不到 $local，請先執行 build-mdb.ps1" }
$url = 'ftp://www.ll3.com.tw:2222/weather.mdb'
$cred = "ll3_db:$pw"

$list = & curl.exe -s -S --connect-timeout 20 --ftp-pasv -l -u $cred 'ftp://www.ll3.com.tw:2222/'
if ($LASTEXITCODE -ne 0) { throw "FTP 連線失敗（curl $LASTEXITCODE）" }
if ($list -contains 'weather.mdb') {
  $bk = Join-Path $root ("data-export\backup\weather_{0}.mdb" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item -ItemType Directory -Force (Split-Path $bk) | Out-Null
  & curl.exe -s -S --ftp-pasv -u $cred -o $bk $url
  Write-Host "線上已有 weather.mdb，已備份到 $bk"
  if (-not $Force) { Write-Host '沒有加 -Force，不覆蓋。'; exit 1 }
}
& curl.exe -s -S --ftp-pasv -u $cred -T $local $url
if ($LASTEXITCODE -ne 0) { throw "上傳失敗（curl $LASTEXITCODE）" }
$size = & curl.exe -s -S --ftp-pasv -u $cred -I $url | Select-String 'Content-Length: (\d+)' | % { [long]$_.Matches[0].Groups[1].Value }
$want = (Get-Item $local).Length
Write-Host ("上傳完成：線上 {0:N0} bytes / 本機 {1:N0} bytes → {2}" -f $size, $want, $(if ($size -eq $want) { '大小一致' } else { '大小不符！' }))
