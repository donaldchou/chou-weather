# 用 data-export\*.csv 建立 weather.mdb（Jet 4.0 / Access 2000 格式，給 ll3 的 ASP 使用）
# 必須用 32 位元 PowerShell 執行（Jet 4.0 只有 32 位元）：
#   C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile -File scripts\build-mdb.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exp = Join-Path $root 'data-export'
$mdb = Join-Path $root 'data-export\weather.mdb'
if ([IntPtr]::Size -ne 4) { throw '請用 32 位元 PowerShell 執行（C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe）' }
if (Test-Path $mdb) { Remove-Item $mdb -Force }

$connStr = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$mdb;Jet OLEDB:Engine Type=5"
$cat = New-Object -ComObject ADOX.Catalog
$cat.Create($connStr) | Out-Null
$cn = $cat.ActiveConnection

function Invoke-Sql([string]$sql) {
  try { $cn.Execute($sql) | Out-Null } catch { Write-Host "SQL 失敗：$sql"; throw }
}

# ---- 資料表
Invoke-Sql @"
CREATE TABLE stations (
  station_id TEXT(20) NOT NULL CONSTRAINT pk_stations PRIMARY KEY,
  station_name TEXT(50), source_type TEXT(20), source_name TEXT(50),
  elevation_m DOUBLE, dist_km DOUBLE, data_from TEXT(10), data_to TEXT(10),
  field_list TEXT(255), remark MEMO)
"@

$hourCols = 'temp_c','rh_pct','rain_mm','wind_ms','gust_ms','wind_dir','pressure_hpa','sunshine_h','radiation_mj','dewpoint_c','cloud_pct','et0_mm','vpd_kpa','soil_t0_c','soil_t28_c','soil_m0_pct','soil_m28_pct'
Invoke-Sql ("CREATE TABLE hourly (station_id TEXT(20) NOT NULL, obs_time DATETIME NOT NULL, obs_date TEXT(10), obs_hour SHORT, " +
  (($hourCols | % { "$_ DOUBLE" }) -join ', ') + ")")

$dayDbl = 'temp_mean','temp_max','temp_min','rh_mean','rain_mm','wind_mean','gust_max','sunshine_h','radiation_mj','et0_mm'
$dayInt = 'chill_h','frost_h','wet_h','heat_h','spray_h','temp_hours','rain_hours'
Invoke-Sql ("CREATE TABLE daily (station_id TEXT(20) NOT NULL, obs_date TEXT(10) NOT NULL, " +
  (($dayDbl | % { "$_ DOUBLE" }) + ($dayInt | % { "$_ SHORT" }) -join ', ') + ")")

Invoke-Sql "CREATE TABLE info (item_name TEXT(50) NOT NULL CONSTRAINT pk_info PRIMARY KEY, item_value MEMO)"

# ---- 測站（中文欄位直接用 ADO 寫入，避免文字驅動程式的編碼問題）
$rs = New-Object -ComObject ADODB.Recordset
$rs.Open('stations', $cn, 1, 3, 2)  # keyset, optimistic, table
foreach ($s in (Import-Csv (Join-Path $exp 'stations.csv') -Encoding UTF8)) {
  $rs.AddNew()
  foreach ($k in 'station_id','station_name','source_type','source_name','data_from','data_to','field_list','remark') { $rs.Fields.Item($k).Value = $s.$k }
  $rs.Fields.Item('elevation_m').Value = [double]$s.elevation_m
  $rs.Fields.Item('dist_km').Value = [double]$s.dist_km
  $rs.Update()
}
$rs.Close()

# ---- 逐時、逐日：用 Jet 文字驅動程式整批匯入（schema.ini 指定型別）
$txt = "[Text;FMT=Delimited;HDR=Yes;DATABASE=$exp]"
$sw = [Diagnostics.Stopwatch]::StartNew()
$all = 'station_id, obs_time, obs_date, obs_hour, ' + ($hourCols -join ', ')
Invoke-Sql "INSERT INTO hourly ($all) SELECT $all FROM $txt.[hourly#csv]"
Write-Host ("hourly 匯入 {0:N0} 秒" -f $sw.Elapsed.TotalSeconds)
$all = 'station_id, obs_date, ' + (($dayDbl + $dayInt) -join ', ')
Invoke-Sql "INSERT INTO daily ($all) SELECT $all FROM $txt.[daily#csv]"

# ---- 索引
Invoke-Sql "CREATE UNIQUE INDEX pk_hourly ON hourly (station_id, obs_time) WITH PRIMARY"
Invoke-Sql "CREATE INDEX ix_hourly_time ON hourly (obs_time)"
Invoke-Sql "CREATE INDEX ix_hourly_date ON hourly (station_id, obs_date)"
Invoke-Sql "CREATE UNIQUE INDEX pk_daily ON daily (station_id, obs_date) WITH PRIMARY"

# ---- 說明
$info = [ordered]@{
  generated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  time_rule    = 'obs_time 為台灣時間、該小時結束的時間（例：01:00 代表 00:00~01:00；24 點那筆記為隔天 00:00，obs_date 仍算前一天、obs_hour=24）'
  stations     = 'composite=上巴陵綜合（氣溫依海拔換算、實測為主）；C0xxxx/C1xxxx=中央氣象署；wra-xxxxx=經濟部水利署雨量站；openmeteo=Open-Meteo 模式推估'
  units        = 'temp_c °C, rh_pct %, rain_mm mm, wind_ms/gust_ms m/s, wind_dir 度, pressure_hpa hPa, sunshine_h 小時, radiation_mj MJ/m2, et0_mm mm, vpd_kpa kPa, soil_m %'
  daily_rules  = 'chill_h 0~7.2°C 小時；frost_h ≤2°C；wet_h 濕度≥90% 且 15~28°C；heat_h ≥30°C；spray_h 白天無雨、風速<3、濕度<90%、5~30°C'
  source_app   = 'https://github.com/donaldchou/chou-weather'
}
$rs = New-Object -ComObject ADODB.Recordset
$rs.Open('info', $cn, 1, 3, 2)
foreach ($k in $info.Keys) { $rs.AddNew(); $rs.Fields.Item('item_name').Value = $k; $rs.Fields.Item('item_value').Value = $info[$k]; $rs.Update() }
$rs.Close()

foreach ($t in 'stations','hourly','daily','info') {
  $r = $cn.Execute("SELECT COUNT(*) FROM $t")
  Write-Host ("{0,-9} {1,10:N0} 筆" -f $t, $r.Fields.Item(0).Value)
}
$cn.Close()
Write-Host ("完成：{0}（{1:N1} MB）" -f $mdb, ((Get-Item $mdb).Length / 1MB))
