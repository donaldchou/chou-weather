# 把 data-export\weather.mdb（完整重建版）裡「線上還沒有的早期年份」併進線上 weather.mdb 的下載檔
# 用法（32 位元 PowerShell）：merge-old-years.ps1 -Live 下載的線上檔.mdb -Full data-export\weather.mdb -Out 合併結果.mdb
# 只新增早於線上第一筆資料的 hourly / daily，2022 年起 cron 持續更新的資料完全不動；
# stations 補上線上沒有的測站，並更新 data_from（資料起始日）與說明。最後壓縮成 -Out。
param(
  [Parameter(Mandatory)] [string]$Live,
  [Parameter(Mandatory)] [string]$Full,
  [Parameter(Mandatory)] [string]$Out
)
$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -ne 4) { throw '請用 32 位元 PowerShell（C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe）執行' }
$Live = (Resolve-Path $Live).Path; $Full = (Resolve-Path $Full).Path
$work = [IO.Path]::ChangeExtension($Out, '.work.mdb')
Copy-Item $Live $work -Force

$c = New-Object -ComObject ADODB.Connection
$c.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$work")
function Get-Val($sql) { $r = $c.Execute($sql); $v = $r.Fields.Item(0).Value; $r.Close(); return $v }
$ext = "[;DATABASE=$Full]"

$firstH = Get-Val 'SELECT MIN(obs_time) FROM hourly'
$firstD = Get-Val 'SELECT MIN(obs_date) FROM daily'
Write-Host "線上第一筆：hourly $firstH、daily $firstD"
$cut = ([datetime]$firstH).AddMinutes(-30).ToString('MM/dd/yyyy HH:mm:ss')
$beforeH = Get-Val 'SELECT COUNT(*) FROM hourly'
$beforeD = Get-Val 'SELECT COUNT(*) FROM daily'

$n = 0
# 線上沒有的測站（例：太平山）整站全部資料都補上
$newSt = "f.station_id NOT IN (SELECT station_id FROM stations)"
$c.Execute("INSERT INTO hourly SELECT f.* FROM $ext.hourly AS f WHERE f.obs_time < #$cut# OR $newSt", [ref]$n, 1) | Out-Null
Write-Host "hourly 新增 $n 筆"
$c.Execute("INSERT INTO daily SELECT f.* FROM $ext.daily AS f WHERE f.obs_date < '$firstD' OR $newSt", [ref]$n, 1) | Out-Null
Write-Host "daily 新增 $n 筆"
$c.Execute("INSERT INTO stations SELECT f.* FROM $ext.stations AS f WHERE f.station_id NOT IN (SELECT station_id FROM stations)", [ref]$n, 1) | Out-Null
Write-Host "stations 新增 $n 站"
$c.Execute("UPDATE stations AS s INNER JOIN $ext.stations AS f ON s.station_id = f.station_id SET s.data_from = f.data_from, s.remark = f.remark", [ref]$n, 1) | Out-Null
Write-Host "stations 更新 data_from／說明 $n 站"

$afterH = Get-Val 'SELECT COUNT(*) FROM hourly'
$afterD = Get-Val 'SELECT COUNT(*) FROM daily'
Write-Host "hourly $beforeH → $afterH；daily $beforeD → $afterD；最早 $(Get-Val 'SELECT MIN(obs_time) FROM hourly')；最新 $(Get-Val 'SELECT MAX(obs_time) FROM hourly')"
$c.Close()

if (Test-Path $Out) { Remove-Item $Out -Force }
$jro = New-Object -ComObject JRO.JetEngine
$jro.CompactDatabase("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$work", "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$Out;Jet OLEDB:Engine Type=5")
Remove-Item $work -Force
Write-Host ("完成：{0}（{1:N1} MB）" -f $Out, ((Get-Item $Out).Length / 1MB))
