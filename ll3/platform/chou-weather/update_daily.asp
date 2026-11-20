<%@ Language="JScript" CodePage=65001 %>
<!--#include file="config.asp"-->
<!--#include file="lib.asp"-->
<%
// 每天校正：用氣象署 CODiS 檢定後的逐時資料覆蓋即時資料，並補上 Open-Meteo（土壤、日射、蒸發散）
// GET update_daily.asp?key=...&days=3（往回抓幾天，預設 3，最多 31）
Response.CodePage = 65001;
Response.Charset = 'utf-8';
Response.ContentType = 'text/plain';
Server.ScriptTimeout = 600;
checkKey();

var CWA_STATIONS = [['C0C800', 'auto_C0'], ['C0UB60', 'auto_C0'], ['C0UA30', 'auto_C0'], ['C0UA10', 'auto_C0'], ['C0C460', 'auto_C0'], ['C1C840', 'auto_C1']];
var OM_VARS = {
	t: 'temperature_2m', rh: 'relative_humidity_2m', dew: 'dew_point_2m', rain: 'precipitation', ws: 'wind_speed_10m',
	cloud: 'cloud_cover', rad: 'shortwave_radiation', sun: 'sunshine_duration', et0: 'et0_fao_evapotranspiration',
	vpd: 'vapour_pressure_deficit', soilT0: 'soil_temperature_0_to_7cm', soilT28: 'soil_temperature_28_to_100cm',
	soilM0: 'soil_moisture_0_to_7cm', soilM28: 'soil_moisture_28_to_100cm'
};

var days = parseInt(Request.QueryString('days'), 10);
if (isNaN(days) || days < 1) days = 3;
if (days > 31) days = 31;
var today = addDays(new Date(), 0), log = [], errors = [], c = openDb();

function out(s) { Response.Write(s + '\r\n'); log.push(s); }
function g(o, f) { return o && o[f] !== undefined ? o[f] : null; }

// ---- 1. 氣象署 CODiS
var start = addDays(today, -days), touched = ['composite'];
for (var k = 0; k < CWA_STATIONS.length; k++) {
	var sid = CWA_STATIONS[k][0];
	try {
		var body = 'date=' + dateStr(start) + 'T00:00:00.000%2B08:00&type=report_date&stn_ID=' + sid + '&stn_type=' + CWA_STATIONS[k][1]
			+ '&start=' + dateStr(start) + 'T00:00:00&end=' + dateStr(today) + 'T23:59:59&more=&item=';
		var j = parseJSON(httpRequest('POST', 'https://codis.cwa.gov.tw/api/station', body));
		var dts = j.data && j.data.length ? j.data[0].dts : [], rows = [];
		for (var i = 0; i < dts.length; i++) {
			var d = dts[i], tm = /T23:59/.test(d.DataTime) ? addDays(parseKey(d.DataTime.substr(0, 10) + ' 00'), 1) : parseKey(d.DataTime);
			rows.push({ station: sid, time: tm, v: {
				t: clean('t', g(d.AirTemperature, 'Instantaneous')), rh: clean('rh', g(d.RelativeHumidity, 'Instantaneous')),
				rain: clean('rain', g(d.Precipitation, 'Accumulation')), ws: clean('ws', g(d.WindSpeed, 'Mean')),
				gust: clean('gust', g(d.PeakGust, 'Maximum')), wd: clean('wd', g(d.WindDirection, 'Mean')),
				p: clean('p', g(d.StationPressure, 'Instantaneous')), sun: clean('sun', g(d.SunshineDuration, 'Total')),
				rad: clean('rad', g(d.GlobalSolarRadiation, 'Accumulation'))
			} });
		}
		out('CODiS ' + sid + '：' + dts.length + ' 小時，寫入 ' + upsertHourly(c, rows, false));
		touched.push(sid);
	} catch (e) { errors.push('CODiS ' + sid + ' ' + e.message); out('CODiS ' + sid + ' 失敗：' + e.message); }
}

// ---- 2. Open-Meteo（再分析資料約晚 5 天，抓 14~7 天前）
var omFrom = addDays(today, -14), omTo = addDays(today, -7);
try {
	var vars = [];
	for (var f in OM_VARS) vars.push(OM_VARS[f]);
	var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=24.6745&longitude=121.4146&elevation=1200'
		+ '&start_date=' + dateStr(omFrom) + '&end_date=' + dateStr(omTo) + '&hourly=' + vars.join(',') + '&timezone=Asia%2FTaipei&wind_speed_unit=ms';
	var h = parseJSON(httpRequest('GET', url)).hourly, rows2 = [];
	for (var i2 = 0; i2 < h.time.length; i2++) {
		var v = {};
		for (f in OM_VARS) {
			var x = h[OM_VARS[f]][i2];
			if (x === null || x === undefined) { v[f] = null; continue; }
			if (f === 'sun') x = x / 3600;
			if (f === 'rad') x = x * 3600 / 1e6;
			if (f === 'soilM0' || f === 'soilM28') x = Math.round(x * 1000) / 10;
			v[f] = (f === 'rad' || f === 'sun' || f === 'et0' || f === 'vpd') ? Math.round(x * 100) / 100 : r1(x);
		}
		// Open-Meteo 的時間是該小時開始 → +1 小時對齊
		rows2.push({ station: 'openmeteo', time: addHours(parseKey(h.time[i2].replace('T', ' ')), 1), v: v });
	}
	out('Open-Meteo：' + h.time.length + ' 小時，寫入 ' + upsertHourly(c, rows2, false));
	touched.push('openmeteo');
} catch (e) { errors.push('Open-Meteo ' + e.message); out('Open-Meteo 失敗：' + e.message); }

// ---- 3. 重算綜合資料與逐日統計
try {
	var from = new Date(omFrom.getFullYear(), omFrom.getMonth(), omFrom.getDate(), 1);
	var to = addHours(today, 24);
	out('綜合資料重算：' + rebuildComposite(c, from, to) + ' 小時');
	out('逐日統計重算：' + rebuildDaily(c, touched, omFrom, today) + ' 筆');
	touchStations(c, touched);
} catch (e) { errors.push('重算 ' + e.message); out('重算失敗：' + e.message); }

writeLog(c, 'daily', errors.length === 0, log.join('；'));
c.Close();
out(errors.length ? 'ERROR' : 'OK');
if (errors.length) Response.Status = '500 Internal Server Error';
%>
