<%@ Language="JScript" CodePage=65001 EnableSessionState=False %>
<!--#include file="config.asp"-->
<!--#include file="lib.asp"-->
<%
// 網頁圖表的資料（Vercel proxy 確認使用者有登入後，帶 X-LL3-Key 標頭轉過來）
//   data.asp?f=index   測站清單＋有哪些年份（即時由 weather.mdb 產生）
//   data.asp?f=2025    2025 年的逐時資料（\database\weather_json\2025.json，檔案不存在就先從 weather.mdb 匯出）
//   加上 &v=版本 時（網頁用檔案修改時間當版本）瀏覽器可以長期快取
Response.CodePage = 65001;
Response.Charset = 'utf-8';
Server.ScriptTimeout = 600;

function deny(status, msg) {
	Response.Status = status;
	Response.ContentType = 'text/plain';
	Response.Write(msg);
	Response.End();
}

var key = String(Request.ServerVariables('HTTP_X_LL3_KEY'));
if (key !== API_KEY) deny('403 Forbidden', 'forbidden');

var f = String(Request.QueryString('f'));
var SITE = '{"name":"上巴陵","lat":24.6745,"lon":121.4146,"elevation":1200}';
var ORDER = ['C0C800', 'C0UB60', 'C0UA30', 'C0UA10', 'C0C460', 'C0U710', 'C1C840', 'wra-21C070', 'wra-21C090', 'wra-21C080', 'openmeteo'];

function q(s) {
	return '"' + String(s).replace(/[\\"\u0000-\u001f]/g, function (ch) {
		return ch === '\\' ? '\\\\' : ch === '"' ? '\\"' : '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4);
	}) + '"';
}

if (f === 'index') {
	var c = openDb(), rs = c.Execute("SELECT * FROM stations WHERE station_id<>'composite'"), byId = {};
	while (!rs.EOF) {
		var id = String(rs('station_id').Value), fl = String(rs('field_list').Value || '').split(' '), fq = [];
		for (var i = 0; i < fl.length; i++) if (fl[i]) fq.push(q(fl[i]));
		byId[id] = '{"id":' + q(id) + ',"source":' + q(rs('source_type').Value) + ',"name":' + q(rs('station_name').Value) +
			',"elevation":' + Number(rs('elevation_m').Value) + ',"distKm":' + Number(rs('dist_km').Value || 0) +
			',"from":' + q(rs('data_from').Value || '') + ',"to":' + q(rs('data_to').Value || '') +
			',"note":' + q(rs('remark').Value || '') + ',"fields":[' + fq.join(',') + '],"count":{}}';
		rs.MoveNext();
	}
	rs.Close();
	var ids = [], k;
	for (k = 0; k < ORDER.length; k++) if (byId[ORDER[k]]) { ids.push(byId[ORDER[k]]); delete byId[ORDER[k]]; }
	for (k in byId) ids.push(byId[k]);
	// 年份：FIRST_YEAR ~ 今年，版本＝檔案修改時間（還沒產生的給 0）
	var fso = Server.CreateObject('Scripting.FileSystemObject'), dir = jsonDirPath(), now = new Date(), years = [];
	for (var y = FIRST_YEAR; y <= now.getFullYear(); y++) {
		var p = dir + '\\' + y + '.json', v = fso.FileExists(p) ? new Date(fso.GetFile(p).DateLastModified).getTime() : 0;
		years.push('{"year":' + y + ',"v":' + v + '}');
	}
	var last = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23);
	var hours = Math.round((last - new Date(FIRST_YEAR, 0, 1, 1)) / 3600000) + 2;
	c.Close();
	Response.ContentType = 'application/json';
	Response.CacheControl = 'private, no-store';
	Response.Write('{"generatedAt":"' + dateStr(now) + 'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':00+08:00","start":"' + FIRST_YEAR +
		'-01-01T01","hours":' + hours + ',"site":' + SITE + ',"stations":[' + ids.join(',') + '],"years":[' + years.join(',') + ']}');

} else if (/^\d{4}$/.test(f) && +f >= FIRST_YEAR && +f <= new Date().getFullYear() + 1) {
	var path = jsonDirPath() + '\\' + f + '.json', fso2 = Server.CreateObject('Scripting.FileSystemObject');
	if (!fso2.FileExists(path)) { var c2 = openDb(); exportYear(c2, +f); c2.Close(); }
	Response.ContentType = 'application/json';
	Response.CacheControl = (String(Request.QueryString('v')) !== 'undefined' && String(Request.QueryString('v')) !== '0'
		? 'private, max-age=31536000, immutable' : 'private, no-cache');
	// 一年約 1~2 MB，在 ASP 預設的 4 MB 緩衝範圍內，一次輸出
	var st = Server.CreateObject('ADODB.Stream');
	st.Type = 1;
	st.Open();
	st.LoadFromFile(path);
	Response.BinaryWrite(st.Read());
	st.Close();

} else {
	deny('400 Bad Request', 'f 要是 index 或年份');
}
%>
