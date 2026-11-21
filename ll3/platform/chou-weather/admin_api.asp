<%@ Language="JScript" CodePage=65001 %>
<!--#include file="config.asp"-->
<!--#include file="lib.asp"-->
<%
// chou-weather 後台 API：只給 Vercel（Next.js）呼叫，POST key=API_KEY&action=...
// 帳號（users）、天氣資料（stations / hourly / daily）、更新紀錄（update_log）
// 回傳一律 HTTP 200 + JSON：{"ok":true,"data":...} 或 {"ok":false,"status":400,"error":"..."}
// （IIS 會把 4xx/5xx 的內容換成制式錯誤頁，所以錯誤碼放在 JSON 裡）
// 密碼不在這裡計算：Vercel 用 bcrypt 雜湊後只把 password_hash 傳過來存
Response.CodePage = 65001;
Response.Charset = 'utf-8';
Response.ContentType = 'application/json';
Server.ScriptTimeout = 300;

function fail(status, msg) { var e = new Error(msg); e.status = status; return e; }

// ---------------- JSON 輸出 ----------------
function jsonStr(s) {
	return '"' + String(s).replace(/[\\"\u0000-\u001f  ]/g, function (c) {
		var m = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
		return m[c] || '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
	}) + '"';
}
function isoLocal(d) {
	return dateStr(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function toJSON(v) {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	if (typeof v === 'string') return jsonStr(v);
	if (v instanceof Date) return jsonStr(isoLocal(v));
	if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(toJSON(v[i])); return '[' + a.join(',') + ']'; }
	var o = [];
	for (var k in v) o.push(jsonStr(k) + ':' + toJSON(v[k]));
	return '{' + o.join(',') + '}';
}
/** ADO 欄位值 → JS 值（日期轉 Date、空值轉 null） */
function adoVal(f) {
	var v = f.Value;
	if (v === null || v === undefined) return null;
	if (f.Type === 7 || f.Type === 135) return new Date(v);
	if (f.Type === 11) return !!v;
	if (typeof v === 'number') return v;
	return String(v);
}

// ---------------- 參數 ----------------
function param(name) {
	var v = String(Request.Form(name));
	return v === 'undefined' ? '' : v;
}
function need(name) {
	var v = param(name);
	if (v === '') throw fail(400, '缺少參數 ' + name);
	return v;
}
function dayParam(name) {
	var s = need(name);
	if (!/^\d{4}-\d\d-\d\d$/.test(s)) throw fail(400, name + ' 要是 YYYY-MM-DD');
	return new Date(+s.substr(0, 4), +s.substr(5, 2) - 1, +s.substr(8, 2));
}
function hourParam(name) {
	var s = need(name);
	if (!/^\d{4}-\d\d-\d\d \d\d$/.test(s)) throw fail(400, name + ' 要是 YYYY-MM-DD HH');
	return parseKey(s);
}
function stationParam(c) {
	var s = need('station');
	if (!/^[A-Za-z0-9\-]{3,20}$/.test(s)) throw fail(400, '測站代號不正確');
	var rs = c.Execute('SELECT COUNT(*) FROM stations WHERE station_id=' + sqlStr(s)), n = rs(0).Value;
	rs.Close();
	if (!n) throw fail(404, '找不到測站 ' + s);
	return s;
}

// ---------------- 帳號 ----------------
var USER_COLS = ['id', 'email', 'name', 'role', 'active', 'last_login', 'created_at', 'updated_at'];

function ensureUsers(c) {
	try { c.Execute('SELECT TOP 1 id FROM users'); return; } catch (e) {}
	c.Execute('CREATE TABLE users (id TEXT(16) CONSTRAINT pk_users PRIMARY KEY, email TEXT(120) NOT NULL, password_hash TEXT(100) NOT NULL, ' +
		'name TEXT(50), role TEXT(10) NOT NULL, active BIT, last_login DATETIME, created_at DATETIME, updated_at DATETIME)');
	c.Execute('CREATE UNIQUE INDEX ux_users_email ON users (email)');
}
function userRow(rs, withHash) {
	var u = {};
	for (var i = 0; i < USER_COLS.length; i++) u[USER_COLS[i]] = adoVal(rs(USER_COLS[i]));
	if (withHash) u.password_hash = String(rs('password_hash').Value);
	return u;
}
function findUser(c, where, withHash) {
	var rs = c.Execute('SELECT * FROM users WHERE ' + where), u = rs.EOF ? null : userRow(rs, withHash);
	rs.Close();
	return u;
}
function newId() {
	var s = '', a = 'abcdefghijklmnopqrstuvwxyz0123456789';
	for (var i = 0; i < 10; i++) s += a.charAt(Math.floor(Math.random() * a.length));
	return s;
}
function cleanEmail(s) {
	s = String(s).replace(/^\s+|\s+$/g, '').toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 120) throw fail(400, 'email 格式不正確');
	return s;
}
function cleanRole(s) {
	if (s !== 'admin' && s !== 'user') throw fail(400, '身分只能是 admin（管理者）或 user（一般使用者）');
	return s;
}
function cleanHash(s) {
	if (!/^\$2[aby]\$\d\d\$[.\/A-Za-z0-9]{53}$/.test(s)) throw fail(400, '密碼雜湊格式不正確');
	return s;
}
function countAdmins(c, exceptId) {
	var rs = c.Execute("SELECT COUNT(*) FROM users WHERE role='admin' AND active=True" + (exceptId ? ' AND id<>' + sqlStr(exceptId) : ''));
	var n = rs(0).Value;
	rs.Close();
	return n;
}

// ---------------- 天氣資料 ----------------
var HOURLY_OUT = ['t', 'rh', 'rain', 'ws', 'gust', 'wd', 'p', 'sun', 'rad', 'dew', 'cloud', 'et0', 'vpd', 'soilT0', 'soilT28', 'soilM0', 'soilM28'];
var DAILY_COLS = ['temp_mean', 'temp_max', 'temp_min', 'rh_mean', 'rain_mm', 'wind_mean', 'gust_max', 'sunshine_h', 'radiation_mj', 'et0_mm',
	'chill_h', 'frost_h', 'wet_h', 'heat_h', 'spray_h', 'temp_hours', 'rain_hours'];

/** 綜合資料會用到的測站 */
function isCompositeSource(sid) {
	for (var f in COMPOSITE_ORDER) for (var k = 0; k < COMPOSITE_ORDER[f].length; k++) if (COMPOSITE_ORDER[f][k] === sid) return true;
	return false;
}
/** 改了某站某小時後：重算該小時的綜合資料，以及該站、綜合當天的逐日統計 */
function afterHourChange(c, sid, t) {
	var ids = [sid];
	if (sid !== 'composite' && isCompositeSource(sid)) { rebuildComposite(c, t, t); ids.push('composite'); }
	var day = parseKey(obsDate(t) + ' 00');
	// 這一小時也是前一小時「下一小時有沒有下雨」的判斷依據，所以前一天也重算
	if (sid !== 'composite' && t.getHours() === 1) day = addDays(day, -1);
	var last = parseKey(obsDate(t) + ' 00');
	// 先刪掉這幾天的逐日統計再重算：當天逐時資料全被刪光時，逐日那筆也要跟著消失
	for (var i = 0; i < ids.length; i++) {
		c.Execute('DELETE FROM daily WHERE station_id=' + sqlStr(ids[i]) + " AND obs_date BETWEEN '" + dateStr(day) + "' AND '" + dateStr(last) + "'");
	}
	rebuildDaily(c, ids, day, last);
	touchStations(c, ids);
}

// ---------------- 主程式 ----------------
var c = null, out;
try {
	if (param('key') !== API_KEY) throw fail(403, 'forbidden');
	c = openDb();
	var action = need('action'), data = null;

	if (action === 'user_by_email') {
		ensureUsers(c);
		data = findUser(c, 'email=' + sqlStr(cleanEmail(need('email'))), true);

	} else if (action === 'user_get') {
		ensureUsers(c);
		data = findUser(c, 'id=' + sqlStr(need('id')), false);

	} else if (action === 'user_list') {
		ensureUsers(c);
		var rsU = c.Execute('SELECT * FROM users ORDER BY role, created_at');
		data = [];
		while (!rsU.EOF) { data.push(userRow(rsU, false)); rsU.MoveNext(); }
		rsU.Close();

	} else if (action === 'user_create') {
		ensureUsers(c);
		var email = cleanEmail(need('email'));
		if (findUser(c, 'email=' + sqlStr(email), false)) throw fail(409, email + ' 已經有帳號了');
		var rsC = Server.CreateObject('ADODB.Recordset');
		rsC.Open('users', c, 1, 3, 2);
		rsC.AddNew();
		var id = newId();
		rsC('id').Value = id;
		rsC('email').Value = email;
		rsC('password_hash').Value = cleanHash(need('password_hash'));
		rsC('name').Value = param('name').substr(0, 50);
		rsC('role').Value = cleanRole(param('role') || 'user');
		rsC('active').Value = true;
		rsC('created_at').Value = new Date().getVarDate();
		rsC('updated_at').Value = new Date().getVarDate();
		rsC.Update();
		rsC.Close();
		data = findUser(c, 'id=' + sqlStr(id), false);

	} else if (action === 'user_update') {
		ensureUsers(c);
		var uid = need('id'), cur = findUser(c, 'id=' + sqlStr(uid), false);
		if (!cur) throw fail(404, '找不到這個使用者');
		var rsE = Server.CreateObject('ADODB.Recordset');
		rsE.Open('SELECT * FROM users WHERE id=' + sqlStr(uid), c, 1, 3);
		if (param('name') !== '' || param('clear_name') === '1') rsE('name').Value = param('name').substr(0, 50);
		if (param('role') !== '') {
			var role = cleanRole(param('role'));
			if (cur.role === 'admin' && role !== 'admin' && countAdmins(c, uid) === 0) throw fail(400, '至少要保留一位啟用中的管理者');
			rsE('role').Value = role;
		}
		if (param('active') !== '') {
			var act = param('active') === '1';
			if (!act && cur.role === 'admin' && countAdmins(c, uid) === 0) throw fail(400, '至少要保留一位啟用中的管理者');
			rsE('active').Value = act;
		}
		if (param('password_hash') !== '') rsE('password_hash').Value = cleanHash(param('password_hash'));
		if (param('touch_login') === '1') rsE('last_login').Value = new Date().getVarDate();
		else rsE('updated_at').Value = new Date().getVarDate();
		rsE.Update();
		rsE.Close();
		data = findUser(c, 'id=' + sqlStr(uid), false);

	} else if (action === 'user_delete') {
		ensureUsers(c);
		var did = need('id'), du = findUser(c, 'id=' + sqlStr(did), false);
		if (!du) throw fail(404, '找不到這個使用者');
		if (du.role === 'admin' && countAdmins(c, did) === 0) throw fail(400, '至少要保留一位啟用中的管理者');
		c.Execute('DELETE FROM users WHERE id=' + sqlStr(did));
		data = { deleted: did };

	} else if (action === 'stations') {
		var rsS = c.Execute('SELECT * FROM stations ORDER BY station_id');
		data = [];
		while (!rsS.EOF) {
			var st = {};
			for (var fi = 0; fi < rsS.Fields.Count; fi++) st[rsS.Fields.Item(fi).Name] = adoVal(rsS.Fields.Item(fi));
			data.push(st);
			rsS.MoveNext();
		}
		rsS.Close();
		// 各站逐時筆數
		var rsN = c.Execute('SELECT station_id, COUNT(*) AS n FROM hourly GROUP BY station_id'), counts = {};
		while (!rsN.EOF) { counts[String(rsN('station_id').Value)] = Number(rsN('n').Value); rsN.MoveNext(); }
		rsN.Close();
		for (var si = 0; si < data.length; si++) data[si].hourly_count = counts[data[si].station_id] || 0;

	} else if (action === 'hourly') {
		var hs = stationParam(c), hf = dayParam('from'), ht = dayParam('to');
		if (ht < hf) throw fail(400, '結束日期不能早於開始日期');
		if ((ht - hf) / 86400000 > 31) throw fail(400, '一次最多查 31 天');
		var hrows = readHourly(c, [hs], new Date(hf.getFullYear(), hf.getMonth(), hf.getDate(), 1), new Date(ht.getFullYear(), ht.getMonth(), ht.getDate() + 1, 0))[hs] || {};
		data = [];
		var keys = [];
		for (var hk in hrows) keys.push(hk);
		keys.sort();
		for (var ki = 0; ki < keys.length; ki++) {
			var row = { time: keys[ki] };
			for (var fj = 0; fj < HOURLY_OUT.length; fj++) row[HOURLY_OUT[fj]] = hrows[keys[ki]][HOURLY_OUT[fj]];
			data.push(row);
		}

	} else if (action === 'hourly_save') {
		var ss = stationParam(c), st0 = hourParam('time'), vals = parseJSON(need('values')), v = {}, anyV = false;
		for (var vf in vals) {
			if (!COL[vf]) throw fail(400, '不認識的欄位 ' + vf);
			if (vals[vf] === null || vals[vf] === '') { v[vf] = null; continue; }
			var num = Number(vals[vf]);
			if (isNaN(num)) throw fail(400, vf + ' 要是數字');
			if (clean(vf, num) === null) throw fail(400, vf + ' 數值 ' + num + ' 超出合理範圍');
			v[vf] = num;
			anyV = true;
		}
		var nSaved = upsertHourly(c, [{ station: ss, time: st0, v: v }], true);
		// 全部欄位都清空 → 刪掉這一列
		if (!anyV) c.Execute('DELETE FROM hourly WHERE station_id=' + sqlStr(ss) + ' AND obs_time BETWEEN ' + jetFrom(st0) + ' AND ' + jetTo(st0) +
			' AND temp_c IS NULL AND rh_pct IS NULL AND rain_mm IS NULL AND wind_ms IS NULL AND gust_ms IS NULL AND wind_dir IS NULL AND pressure_hpa IS NULL' +
			' AND sunshine_h IS NULL AND radiation_mj IS NULL AND dewpoint_c IS NULL AND cloud_pct IS NULL AND et0_mm IS NULL AND vpd_kpa IS NULL' +
			' AND soil_t0_c IS NULL AND soil_t28_c IS NULL AND soil_m0_pct IS NULL AND soil_m28_pct IS NULL');
		afterHourChange(c, ss, st0);
		writeLog(c, 'admin', true, '後台修改 ' + ss + ' ' + hourKey(st0) + '：' + toJSON(v) + '（' + param('by') + '）');
		data = { saved: nSaved };

	} else if (action === 'hourly_delete') {
		var ds = stationParam(c), dt = hourParam('time');
		c.Execute('DELETE FROM hourly WHERE station_id=' + sqlStr(ds) + ' AND obs_time BETWEEN ' + jetFrom(dt) + ' AND ' + jetTo(dt));
		afterHourChange(c, ds, dt);
		writeLog(c, 'admin', true, '後台刪除 ' + ds + ' ' + hourKey(dt) + ' 逐時資料（' + param('by') + '）');
		data = { deleted: hourKey(dt) };

	} else if (action === 'daily') {
		var ys = stationParam(c), yf = dayParam('from'), yt = dayParam('to');
		if ((yt - yf) / 86400000 > 400) throw fail(400, '一次最多查 400 天');
		var rsD = c.Execute('SELECT * FROM daily WHERE station_id=' + sqlStr(ys) + " AND obs_date BETWEEN '" + dateStr(yf) + "' AND '" + dateStr(yt) + "' ORDER BY obs_date");
		data = [];
		while (!rsD.EOF) {
			var drow = { date: String(rsD('obs_date').Value) };
			for (var dc = 0; dc < DAILY_COLS.length; dc++) drow[DAILY_COLS[dc]] = adoVal(rsD(DAILY_COLS[dc]));
			data.push(drow);
			rsD.MoveNext();
		}
		rsD.Close();

	} else if (action === 'logs') {
		ensureLogTable(c);
		var where = [], kind = param('kind'), okp = param('ok');
		if (kind !== '') { if (!/^[a-z_]{1,20}$/.test(kind)) throw fail(400, 'kind 不正確'); where.push('kind=' + sqlStr(kind)); }
		if (okp === '1') where.push('ok=True');
		if (okp === '0') where.push('ok=False');
		var w = where.length ? ' WHERE ' + where.join(' AND ') : '';
		var size = Math.min(200, Math.max(1, +param('size') || 50)), page = Math.max(1, +param('page') || 1);
		var rsT = c.Execute('SELECT COUNT(*) FROM update_log' + w), total = Number(rsT(0).Value);
		rsT.Close();
		// Jet 沒有 OFFSET：取前 page*size 筆再跳過
		var rsL = c.Execute('SELECT TOP ' + (page * size) + ' id, run_time, kind, ok, message FROM update_log' + w + ' ORDER BY id DESC'), items = [], idx = 0;
		while (!rsL.EOF) {
			if (idx >= (page - 1) * size) items.push({ id: Number(rsL('id').Value), time: adoVal(rsL('run_time')), kind: String(rsL('kind').Value), ok: !!rsL('ok').Value, message: String(rsL('message').Value || '') });
			idx++;
			rsL.MoveNext();
		}
		rsL.Close();
		data = { total: total, page: page, size: size, items: items };

	} else {
		throw fail(400, '不認識的 action：' + action);
	}
	out = '{"ok":true,"data":' + toJSON(data) + '}';
} catch (e) {
	out = '{"ok":false,"status":' + (e.status || 500) + ',"error":' + jsonStr(e.message || String(e)) + '}';
}
if (c) try { c.Close(); } catch (e2) {}
Response.Write(out);
%>
