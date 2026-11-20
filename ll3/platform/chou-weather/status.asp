<%@ Language="JScript" CodePage=65001 %>
<!--#include file="config.asp"-->
<!--#include file="lib.asp"-->
<%
// 檢查更新狀況：最近的更新紀錄、各測站最新一筆資料
Response.CodePage = 65001;
Response.Charset = 'utf-8';
Response.ContentType = 'text/plain';

var c = openDb();
ensureLogTable(c);
Response.Write('主機時間 ' + hourKey(new Date()) + '\r\n\r\n== 最近 10 次更新\r\n');
var rs = c.Execute('SELECT TOP 10 run_time, kind, ok, message FROM update_log ORDER BY id DESC');
while (!rs.EOF) {
	var t = new Date(rs('run_time').Value);
	Response.Write(dateStr(t) + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + '  ' + rs('kind').Value + '  ' + (rs('ok').Value ? 'OK ' : 'ERR') + '  ' + rs('message').Value + '\r\n');
	rs.MoveNext();
}
rs.Close();

Response.Write('\r\n== 各測站最新一筆\r\n');
rs = c.Execute('SELECT s.station_id, s.station_name, MAX(h.obs_time) AS last_time FROM stations s LEFT JOIN hourly h ON s.station_id = h.station_id GROUP BY s.station_id, s.station_name ORDER BY s.station_id');
while (!rs.EOF) {
	var lt = rs('last_time').Value;
	Response.Write(rs('station_id').Value + '  ' + rs('station_name').Value + '  ' + (lt !== null && lt !== undefined ? dbHourKey(lt) + ':00' : '-') + '\r\n');
	rs.MoveNext();
}
rs.Close();

Response.Write('\r\n== 上巴陵綜合 最近 6 小時\r\n');
rs = c.Execute("SELECT TOP 6 obs_time, temp_c, rh_pct, rain_mm, wind_ms FROM hourly WHERE station_id='composite' ORDER BY obs_time DESC");
while (!rs.EOF) {
	Response.Write(dbHourKey(rs('obs_time').Value) + ':00  氣溫 ' + rs('temp_c').Value + '°C  濕度 ' + rs('rh_pct').Value + '%  雨量 ' + rs('rain_mm').Value + 'mm  風速 ' + rs('wind_ms').Value + 'm/s\r\n');
	rs.MoveNext();
}
rs.Close();
c.Close();
%>
