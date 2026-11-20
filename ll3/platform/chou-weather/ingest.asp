<%@ Language="JScript" CodePage=65001 %>
<!--#include file="config.asp"-->
<!--#include file="lib.asp"-->
<%
// 接收 Vercel 中繼站送來的氣象署即時觀測，寫入 weather.mdb
// POST key=...&data=多行文字，每行：測站|YYYY-MM-DD HH|t=8.2,rh=91,rain=0,ws=0.6,gust=,wd=114,p=891.5
Response.CodePage = 65001;
Response.Charset = 'utf-8';
Response.ContentType = 'application/json';
Server.ScriptTimeout = 120;
checkKey();

var c = openDb(), log = [];
try {
	var lines = String(Request.Form('data')).split(/\r?\n/), rows = [], stations = {}, minT = null, maxT = null;
	for (var i = 0; i < lines.length; i++) {
		var p = lines[i].split('|');
		if (p.length !== 3 || !/^[A-Za-z0-9\-]{3,20}$/.test(p[0]) || !/^\d{4}-\d\d-\d\d \d\d$/.test(p[1])) continue;
		var v = {}, kv = p[2].split(','), any = false;
		for (var j = 0; j < kv.length; j++) {
			var pair = kv[j].split('=');
			if (pair.length !== 2 || !COL[pair[0]]) continue;
			var x = clean(pair[0], pair[1]);
			if (x !== null) { v[pair[0]] = x; any = true; }
		}
		if (!any) continue;
		var t = parseKey(p[1]);
		rows.push({ station: p[0], time: t, v: v });
		stations[p[0]] = 1;
		if (!minT || t < minT) minT = t;
		if (!maxT || t > maxT) maxT = t;
	}
	var n = upsertHourly(c, rows, false);
	log.push('逐時 ' + n + ' 筆');
	if (rows.length) {
		log.push('綜合 ' + rebuildComposite(c, minT, maxT) + ' 筆');
		var ids = ['composite'];
		for (var s in stations) ids.push(s);
		log.push('逐日 ' + rebuildDaily(c, ids, parseKey(obsDate(minT) + ' 00'), parseKey(obsDate(maxT) + ' 00')) + ' 筆');
		touchStations(c, ids);
		log.push('時間 ' + hourKey(minT) + ' ~ ' + hourKey(maxT));
	}
	writeLog(c, 'realtime', true, log.join('；'));
	Response.Write('{"ok":true,"message":"' + log.join('；').replace(/"/g, "'") + '"}');
} catch (e) {
	var logErr = '';
	try { writeLog(c, 'realtime', false, e.message + ' ' + log.join('；')); } catch (e2) { logErr = '（寫紀錄也失敗：' + e2.message + '）'; }
	// 不回 500：IIS 會把內容換成制式錯誤頁，看不到訊息。由呼叫端看 ok 判斷
	Response.Write('{"ok":false,"message":"' + String(e.message + logErr).replace(/["\\\r\n]/g, ' ') + '"}');
}
c.Close();
%>
