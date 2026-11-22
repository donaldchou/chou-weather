<%
// chou-weather 共用函式（JScript）
// 時間規則：obs_time = 台灣時間、該小時「結束」的時間；24:00 那筆記為隔天 00:00，obs_date 算前一天、obs_hour=24
// 和 Next.js 專案 lib/data.ts、lib/agri.ts 的計算規則一致

var SITE_ELEV = 1200, LAPSE = 0.6;

// 網頁欄位代號 → 資料庫欄位
var COL = {
	t: 'temp_c', rh: 'rh_pct', rain: 'rain_mm', ws: 'wind_ms', gust: 'gust_ms', wd: 'wind_dir', p: 'pressure_hpa',
	sun: 'sunshine_h', rad: 'radiation_mj', dew: 'dewpoint_c', cloud: 'cloud_pct', et0: 'et0_mm', vpd: 'vpd_kpa',
	soilT0: 'soil_t0_c', soilT28: 'soil_t28_c', soilM0: 'soil_m0_pct', soilM28: 'soil_m28_pct'
};
var ALL_FIELDS = ['t', 'rh', 'rain', 'ws', 'gust', 'wd', 'p', 'sun', 'rad', 'dew', 'cloud', 'et0', 'vpd', 'soilT0', 'soilT28', 'soilM0', 'soilM28'];

// 上巴陵綜合：各項目依序取用的測站（與 lib/data.ts COMPOSITE_ORDER 相同）
var COMPOSITE_ORDER = {
	t: ['C0C800', 'C0UB60', 'C0UA30', 'C0UA10', 'C0U710'],
	rh: ['C0C800', 'C0UB60', 'C0UA30', 'C0UA10', 'C0U710'],
	rain: ['C0C800', 'wra-21C070', 'wra-21C090', 'C1C840', 'wra-21C080', 'C0C460'],
	ws: ['C0C800', 'C0UB60', 'C0UA30'],
	gust: ['C0C800', 'C0UB60', 'C0UA30'],
	p: ['C0C800', 'C0UB60'],
	dew: ['openmeteo'], rad: ['openmeteo'], sun: ['openmeteo'], cloud: ['openmeteo'], et0: ['openmeteo'], vpd: ['openmeteo'],
	soilT0: ['openmeteo'], soilT28: ['openmeteo'], soilM0: ['openmeteo'], soilM28: ['openmeteo']
};

// 不合理數值 → null（與 scripts/fetch-data.mjs 相同）
var CLEAN = {
	t: [-20, 45], rh: [1, 100], rain: [0, 300], ws: [0, 80], gust: [0, 100], wd: [0, 360], p: [500, 1100], sun: [0, 1.01], rad: [0, 5]
};
function clean(f, v) {
	if (v === null || v === undefined || v === '') return null;
	v = Number(v);
	if (isNaN(v)) return null;
	var r = CLEAN[f];
	if (r && (v < r[0] || v > r[1])) return null;
	return v;
}

// ---------------- 時間 ----------------
function pad2(n) { return (n < 10 ? '0' : '') + n; }
/** Date → 'YYYY-MM-DD HH'（主機為台灣時間） */
function hourKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()); }
function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
/** 'YYYY-MM-DD HH' 或 'YYYY-MM-DDTHH:MM...' → Date */
function parseKey(s) {
	return new Date(+s.substr(0, 4), +s.substr(5, 2) - 1, +s.substr(8, 2), +s.substr(11, 2), +(s.substr(14, 2) || 0), 0);
}
function addHours(d, h) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + h, 0, 0); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 0, 0, 0); }
/** 這一小時屬於哪一天（00:00 那筆屬於前一天） */
function obsDate(d) { return dateStr(addHours(d, -1)); }
function obsHour(d) { return d.getHours() === 0 ? 24 : d.getHours(); }
function jetDate(d) { return '#' + dateStr(d) + ' ' + pad2(d.getHours()) + ':00:00#'; }
/** 查詢範圍用：前後各放寬 30 分鐘，避免日期浮點誤差比對不到 */
function jetFrom(d) { var x = new Date(d.getTime() - 1800000); return '#' + dateStr(x) + ' ' + pad2(x.getHours()) + ':' + pad2(x.getMinutes()) + ':00#'; }
function jetTo(d) { var x = new Date(d.getTime() + 1800000); return '#' + dateStr(x) + ' ' + pad2(x.getHours()) + ':' + pad2(x.getMinutes()) + ':00#'; }
/** Access 日期的精確數值（1899-12-30 起的天數 + 小時/24），寫入時用，避免 getVarDate 的浮點誤差 */
function oaDate(d) {
	var days = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
	return days + d.getHours() / 24;
}
/** 從資料庫讀到的日期 → 'YYYY-MM-DD HH'（四捨五入到整點） */
function dbHourKey(v) { return hourKey(new Date(Math.round(new Date(v).getTime() / 3600000) * 3600000)); }
function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

// ---------------- JSON（自己解析，不用 eval） ----------------
function parseJSON(text) {
	var i = 0, s = text;
	function ws() { while (i < s.length && ' \t\r\n'.indexOf(s.charAt(i)) >= 0) i++; }
	function val() {
		ws();
		var c = s.charAt(i);
		if (c === '{') {
			i++; var o = {}; ws();
			if (s.charAt(i) === '}') { i++; return o; }
			while (true) {
				ws(); var k = str(); ws();
				if (s.charAt(i) !== ':') throw new Error('JSON: 缺少 : 於 ' + i);
				i++; o[k] = val(); ws();
				if (s.charAt(i) === ',') { i++; continue; }
				if (s.charAt(i) === '}') { i++; return o; }
				throw new Error('JSON: 物件格式錯誤於 ' + i);
			}
		}
		if (c === '[') {
			i++; var a = []; ws();
			if (s.charAt(i) === ']') { i++; return a; }
			while (true) {
				a.push(val()); ws();
				if (s.charAt(i) === ',') { i++; continue; }
				if (s.charAt(i) === ']') { i++; return a; }
				throw new Error('JSON: 陣列格式錯誤於 ' + i);
			}
		}
		if (c === '"') return str();
		if (s.substr(i, 4) === 'true') { i += 4; return true; }
		if (s.substr(i, 5) === 'false') { i += 5; return false; }
		if (s.substr(i, 4) === 'null') { i += 4; return null; }
		var m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.substr(i, 40));
		if (!m) throw new Error('JSON: 無法解析於 ' + i);
		i += m[0].length;
		return Number(m[0]);
	}
	function str() {
		if (s.charAt(i) !== '"') throw new Error('JSON: 需要字串於 ' + i);
		i++;
		var out = '', start = i;
		while (true) {
			var c = s.charAt(i);
			if (c === '"') { out += s.substring(start, i); i++; return out; }
			if (c === '\\') {
				out += s.substring(start, i);
				var e = s.charAt(i + 1);
				if (e === 'u') { out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; }
				else { out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })[e] || e; i += 2; }
				start = i;
				continue;
			}
			if (i >= s.length) throw new Error('JSON: 字串未結束');
			i++;
		}
	}
	var v = val();
	return v;
}

// ---------------- HTTP ----------------
function httpRequest(method, url, body) {
	var x = Server.CreateObject('MSXML2.ServerXMLHTTP.6.0');
	x.setTimeouts(10000, 15000, 60000, 60000);
	x.open(method, url, false);
	if (method === 'POST') x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	x.send(body || null);
	if (x.status !== 200) throw new Error('HTTP ' + x.status + ' ' + url);
	return x.responseText;
}

// ---------------- 資料庫 ----------------
function openDb() {
	var c = Server.CreateObject('ADODB.Connection');
	c.Open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + Server.MapPath(DB_PATH));
	return c;
}

function ensureLogTable(c) {
	try { c.Execute('SELECT TOP 1 id FROM update_log'); }
	catch (e) { c.Execute('CREATE TABLE update_log (id COUNTER CONSTRAINT pk_update_log PRIMARY KEY, run_time DATETIME, kind TEXT(20), ok BIT, message MEMO)'); }
}
function writeLog(c, kind, ok, msg) {
	ensureLogTable(c);
	var rs = Server.CreateObject('ADODB.Recordset');
	rs.Open('update_log', c, 1, 3, 2);
	rs.AddNew();
	rs('run_time').Value = new Date().getVarDate();
	rs('kind').Value = kind;
	rs('ok').Value = ok;
	rs('message').Value = String(msg).substr(0, 60000);
	rs.Update();
	rs.Close();
}

/**
 * 寫入逐時資料（有就更新、沒有就新增）。只寫入不是 null 的欄位。
 * rows: [{ station: 'C0C800', time: Date, v: { t: 1.2, rh: 90, ... } }]
 * overwriteNull=true 時，v 裡明確給 null 的欄位也會清成 null（綜合資料重算用）
 */
function upsertHourly(c, rows, overwriteNull) {
	if (!rows.length) return 0;
	var byStation = {};
	for (var k = 0; k < rows.length; k++) (byStation[rows[k].station] = byStation[rows[k].station] || []).push(rows[k]);
	var n = 0;
	for (var sid in byStation) {
		var list = byStation[sid], minT = list[0].time, maxT = list[0].time;
		for (k = 1; k < list.length; k++) { if (list[k].time < minT) minT = list[k].time; if (list[k].time > maxT) maxT = list[k].time; }
		// 同一小時有多筆（例如氣象與雨量分開送）→ 先合併
		var todo = {};
		for (k = 0; k < list.length; k++) {
			var key0 = hourKey(list[k].time);
			if (!todo[key0]) todo[key0] = { time: list[k].time, v: {} };
			for (var f1 in list[k].v) {
				var v1 = list[k].v[f1];
				if (v1 !== undefined && (v1 !== null || overwriteNull || todo[key0].v[f1] === undefined)) todo[key0].v[f1] = v1;
			}
		}
		var rs = Server.CreateObject('ADODB.Recordset');
		rs.Open('SELECT * FROM hourly WHERE station_id=' + sqlStr(sid) + ' AND obs_time BETWEEN ' + jetFrom(minT) + ' AND ' + jetTo(maxT), c, 1, 3);
		// 已存在的列：掃描時直接更新（不用書籤，JScript 無法保存 ADO 書籤）
		while (!rs.EOF) {
			var ek = dbHourKey(rs('obs_time').Value), item = todo[ek];
			if (item) {
				if (applyValues(rs, item.v, overwriteNull)) {
					try { rs.Update(); } catch (e) { throw new Error(sid + ' ' + ek + '（更新）：' + e.message); }
					n++;
				}
				delete todo[ek];
			}
			rs.MoveNext();
		}
		// 剩下的是新的小時
		for (var nk in todo) {
			var any = false;
			for (var f0 in todo[nk].v) if (todo[nk].v[f0] !== null) any = true;
			if (!any) continue;
			rs.AddNew();
			rs('station_id').Value = sid;
			rs('obs_time').Value = oaDate(todo[nk].time);
			rs('obs_date').Value = obsDate(todo[nk].time);
			rs('obs_hour').Value = obsHour(todo[nk].time);
			applyValues(rs, todo[nk].v, overwriteNull);
			try { rs.Update(); } catch (e) { throw new Error(sid + ' ' + nk + '（新增）：' + e.message); }
			n++;
		}
		rs.Close();
	}
	return n;
}

/** 把數值寫進目前這一列；回傳有沒有寫任何欄位 */
function applyValues(rs, v, overwriteNull) {
	var changed = false;
	for (var f in v) {
		if (v[f] === undefined || (v[f] === null && !overwriteNull)) continue;
		rs(COL[f]).Value = v[f];
		changed = true;
	}
	return changed;
}

/** 讀取一段時間內、指定測站的逐時資料 → { 'C0C800': { 'YYYY-MM-DD HH': {t:..}} } */
function readHourly(c, stations, fromT, toT) {
	var ids = [];
	for (var k = 0; k < stations.length; k++) ids.push(sqlStr(stations[k]));
	var rs = c.Execute('SELECT * FROM hourly WHERE station_id IN (' + ids.join(',') + ') AND obs_time BETWEEN ' + jetFrom(fromT) + ' AND ' + jetTo(toT));
	var out = {};
	while (!rs.EOF) {
		var sid = String(rs('station_id').Value), key = dbHourKey(rs('obs_time').Value), o = {};
		for (var i = 0; i < ALL_FIELDS.length; i++) {
			var v = rs(COL[ALL_FIELDS[i]]).Value;
			o[ALL_FIELDS[i]] = (v === null || v === undefined) ? null : Number(v);
		}
		(out[sid] = out[sid] || {})[key] = o;
		rs.MoveNext();
	}
	rs.Close();
	return out;
}

function stationElevations(c) {
	var rs = c.Execute('SELECT station_id, elevation_m FROM stations'), e = {};
	while (!rs.EOF) { e[String(rs('station_id').Value)] = Number(rs('elevation_m').Value); rs.MoveNext(); }
	rs.Close();
	return e;
}

function r1(v) { return Math.round(v * 10) / 10; }

/** 重算一段時間的上巴陵綜合資料 */
function rebuildComposite(c, fromT, toT) {
	var src = {};
	for (var f in COMPOSITE_ORDER) for (var k = 0; k < COMPOSITE_ORDER[f].length; k++) src[COMPOSITE_ORDER[f][k]] = 1;
	var ids = [];
	for (var s in src) ids.push(s);
	var data = readHourly(c, ids, fromT, toT), elev = stationElevations(c), rows = [];
	for (var t = fromT; t <= toT; t = addHours(t, 1)) {
		var key = hourKey(t), v = {}, any = false;
		for (f in COMPOSITE_ORDER) {
			v[f] = null;
			var order = COMPOSITE_ORDER[f];
			for (k = 0; k < order.length; k++) {
				var x = data[order[k]] && data[order[k]][key] ? data[order[k]][key][f] : null;
				if (x !== null && x !== undefined) {
					v[f] = f === 't' ? r1(x + ((elev[order[k]] - SITE_ELEV) / 100) * LAPSE) : x;
					any = true;
					break;
				}
			}
		}
		if (any) rows.push({ station: 'composite', time: t, v: v });
	}
	return upsertHourly(c, rows, true);
}

/** 重算指定測站、日期範圍的逐日統計與農事指標（規則同 lib/agri.ts） */
function rebuildDaily(c, stations, fromDate, toDate) {
	// 需要的逐時範圍：fromDate 01:00 ~ toDate+1 01:00（多 1 小時給「下一小時沒下雨」判斷）
	var fromT = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 1);
	var toT = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1, 1);
	var data = readHourly(c, stations, fromT, toT), n = 0;
	for (var si = 0; si < stations.length; si++) {
		var sid = stations[si], h = data[sid] || {};
		for (var d = fromDate; d <= toDate; d = addDays(d, 1)) {
			var t = [], rh = [], rain = [], ws = [], gust = [], sun = [], rad = [], et0 = [];
			var chill = 0, frost = 0, wet = 0, heat = 0, spray = 0;
			for (var hh = 1; hh <= 24; hh++) {
				var tm = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh), o = h[hourKey(tm)];
				if (!o) continue;
				if (o.t !== null) t.push(o.t);
				if (o.rh !== null) rh.push(o.rh);
				if (o.rain !== null) rain.push(o.rain);
				if (o.ws !== null) ws.push(o.ws);
				if (o.gust !== null) gust.push(o.gust);
				if (o.sun !== null) sun.push(o.sun);
				if (o.rad !== null) rad.push(o.rad);
				if (o.et0 !== null) et0.push(o.et0);
				if (o.t !== null) {
					if (o.t >= 0 && o.t <= 7.2) chill++;
					if (o.t <= 2) frost++;
					if (o.t >= 30) heat++;
					if (o.rh !== null && o.rh >= 90 && o.t >= 15 && o.t <= 28) wet++;
					var hour = tm.getHours(), nx = h[hourKey(addHours(tm, 1))], next = nx ? nx.rain : null;
					if (hour > 6 && hour <= 18 && o.rain === 0 && (next === null || next === 0)
						&& (o.ws === null || o.ws < 3) && o.rh !== null && o.rh < 90 && o.t >= 5 && o.t <= 30) spray++;
				}
			}
			if (!t.length && !rain.length && !et0.length) continue;
			var row = {
				temp_mean: mean(t), temp_max: t.length ? Math.max.apply(null, t) : null, temp_min: t.length ? Math.min.apply(null, t) : null,
				rh_mean: mean(rh), rain_mm: sum(rain), wind_mean: mean(ws), gust_max: gust.length ? Math.max.apply(null, gust) : null,
				sunshine_h: sum(sun), radiation_mj: sum(rad), et0_mm: sum(et0),
				chill_h: t.length ? chill : null, frost_h: t.length ? frost : null, wet_h: t.length ? wet : null,
				heat_h: t.length ? heat : null, spray_h: t.length ? spray : null,
				temp_hours: t.length, rain_hours: rain.length
			};
			var rs = Server.CreateObject('ADODB.Recordset');
			rs.Open('SELECT * FROM daily WHERE station_id=' + sqlStr(sid) + " AND obs_date='" + dateStr(d) + "'", c, 1, 3);
			if (rs.EOF) { rs.AddNew(); rs('station_id').Value = sid; rs('obs_date').Value = dateStr(d); }
			for (var col in row) rs(col).Value = row[col];
			rs.Update();
			rs.Close();
			n++;
		}
	}
	return n;
}
function mean(a) { if (!a.length) return null; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return r1(s / a.length); }
function sum(a) { if (!a.length) return null; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return Math.round(s * 10) / 10; }

/** 更新 stations.data_to */
function touchStations(c, ids) {
	for (var k = 0; k < ids.length; k++) {
		var rs = c.Execute('SELECT MAX(obs_date) FROM hourly WHERE station_id=' + sqlStr(ids[k]));
		var last = rs(0).Value;
		rs.Close();
		if (last) c.Execute('UPDATE stations SET data_to=' + sqlStr(last) + ' WHERE station_id=' + sqlStr(ids[k]));
	}
}

// ---------------- 網頁圖表用的年度 JSON ----------------
// 每年一個檔：\database\weather_json\YYYY.json，從 weather.mdb 匯出（weather.mdb 是正本，JSON 只是讀得快的副本）
// 內容：{"year":2026,"start":"2026-01-01T01","hours":8760,"generatedAt":"...","stations":{"C0C800":{"t":"12.3,,13.1,…"}}}
//   第 0 筆 = 1/1 01:00（00:00~01:00 這一小時），最後一筆 = 隔年 1/1 00:00；逗號分隔、空白＝沒有資料
//   綜合資料（composite）不放，網頁自己用各測站算
var JSON_DIR = '\\database\\weather_json';
var FIRST_YEAR = 2010;

function jsonDirPath() {
	var p = Server.MapPath(JSON_DIR), fso = Server.CreateObject('Scripting.FileSystemObject');
	if (!fso.FolderExists(p)) fso.CreateFolder(p);
	return p;
}
function yearHours(year) { return Math.round((new Date(year + 1, 0, 1, 0) - new Date(year, 0, 1, 1)) / 3600000) + 1; }

/** 從 weather.mdb 匯出某一年 → YYYY.json，回傳 { year, stations, bytes, ms } */
function exportYear(c, year) {
	var t0 = new Date(year, 0, 1, 1), t1 = new Date(year + 1, 0, 1, 0), n = yearHours(year), started = new Date();
	var rs = c.Execute("SELECT * FROM hourly WHERE station_id<>'composite' AND obs_time BETWEEN " + jetFrom(t0) + ' AND ' + jetTo(t1));
	var F = rs.Fields, fSid = F.Item('station_id'), fTime = F.Item('obs_time'), fc = [], k;
	for (k = 0; k < ALL_FIELDS.length; k++) fc.push(F.Item(COL[ALL_FIELDS[k]]));
	var st = {}, base = t0.getTime();
	while (!rs.EOF) {
		var i = Math.round((new Date(fTime.Value).getTime() - base) / 3600000);
		if (i >= 0 && i < n) {
			var sid = String(fSid.Value), s = st[sid] || (st[sid] = {});
			for (k = 0; k < fc.length; k++) {
				var v = fc[k].Value;
				if (v !== null && v !== undefined) (s[ALL_FIELDS[k]] || (s[ALL_FIELDS[k]] = new Array(n)))[i] = Math.round(v * 100) / 100;
			}
		}
		rs.MoveNext();
	}
	rs.Close();
	var parts = [], ns = 0;
	for (var id in st) {
		var fl = [];
		for (var f in st[id]) {
			var a = st[id][f];
			if (a.length < n) a[n - 1] = undefined;
			fl.push('"' + f + '":"' + a.join(',') + '"');
		}
		parts.push('"' + id + '":{' + fl.join(',') + '}');
		ns++;
	}
	var now = new Date(), text = '{"year":' + year + ',"start":"' + year + '-01-01T01","hours":' + n + ',"generatedAt":"' +
		dateStr(now) + 'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()) + '+08:00","stations":{' + parts.join(',') + '}}';
	var dir = jsonDirPath(), fso = Server.CreateObject('Scripting.FileSystemObject');
	var tmp = dir + '\\' + year + '.tmp', dst = dir + '\\' + year + '.json';
	var ts = fso.CreateTextFile(tmp, true, false);
	ts.Write(text);
	ts.Close();
	if (fso.FileExists(dst)) fso.DeleteFile(dst, true);
	fso.MoveFile(tmp, dst);
	return { year: year, stations: ns, bytes: text.length, ms: new Date() - started };
}

/** 某段時間有變動 → 重產涵蓋到的年份（1/1 00:00 屬於前一年的檔） */
function exportYearsFor(c, fromT, toT) {
	var y0 = addHours(fromT, -1).getFullYear(), y1 = addHours(toT, -1).getFullYear(), r = [];
	for (var y = y0; y <= y1; y++) if (y >= FIRST_YEAR) r.push(exportYear(c, y));
	return r;
}

function checkKey() {
	var k = String(Request.QueryString('key')) || '';
	if (k === 'undefined' || k === '') k = String(Request.Form('key'));
	if (k !== API_KEY) {
		Response.Status = '403 Forbidden';
		Response.Write('forbidden');
		Response.End();
	}
}
%>
