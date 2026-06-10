require('dotenv').config({path: require('path').join(__dirname, '.env')});
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { realtime: { transport: ws } });

const BRIDGE_VERSION = 'v5-health';
const STARTED_AT = new Date();
let lastPunchAt = null;
let lastDevicePollAt = null;
let lastEmployeeCacheLoadAt = null;
let deviceSerial = null;
let punchesSavedSinceBoot = 0;
let punchesTodayCache = { count: null, asOf: 0 };

const empCache = new Map();

async function loadEmployeeCache() {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id, zkteco_user_id')
      .eq('status', 'Active')
      .not('zkteco_user_id', 'is', null);
    if (error) {
      console.error('[' + new Date().toISOString() + '] Cache load failed:', error.message);
      return;
    }
    empCache.clear();
    for (const row of data) {
      empCache.set(String(row.zkteco_user_id), row.id);
    }
    lastEmployeeCacheLoadAt = new Date();
    console.log('[' + new Date().toISOString() + '] Employee cache loaded: ' + empCache.size + ' entries');
  } catch (e) {
    console.error('[' + new Date().toISOString() + '] Cache load exception:', e.message);
  }
}

async function resolveEmployeeId(pin) {
  if (empCache.has(pin)) return empCache.get(pin);
  const pinNum = parseInt(pin, 10);
  if (isNaN(pinNum)) {
    empCache.set(pin, null);
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id')
      .eq('zkteco_user_id', pinNum)
      .eq('status', 'Active')
      .maybeSingle();
    if (error) {
      console.error('[' + new Date().toISOString() + '] PIN lookup error for ' + pin + ':', error.message);
      return null;
    }
    const empId = data ? data.id : null;
    empCache.set(pin, empId);
    if (empId) console.log('[' + new Date().toISOString() + '] Lazy-cached new PIN ' + pin + ' -> ' + empId);
    return empId;
  } catch (e) {
    console.error('[' + new Date().toISOString() + '] PIN lookup exception for ' + pin + ':', e.message);
    return null;
  }
}

async function getPunchesTodayCount() {
  const now = Date.now();
  if (punchesTodayCache.count !== null && now - punchesTodayCache.asOf < 60000) {
    return punchesTodayCache.count;
  }
  try {
    const istNow = new Date();
    const istDateStr = istNow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const startUTC = new Date(istDateStr + 'T00:00:00+05:30').toISOString();
    const endUTC = new Date(istDateStr + 'T23:59:59+05:30').toISOString();
    const { count, error } = await supabase
      .from('attendance_punches')
      .select('id', { count: 'exact', head: true })
      .gte('punched_at', startUTC)
      .lte('punched_at', endUTC);
    if (error) return null;
    punchesTodayCache = { count: count || 0, asOf: now };
    return count || 0;
  } catch (e) {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '';

  if (url === '/health' || url.startsWith('/health?')) {
    const punchesToday = await getPunchesTodayCount();
    const now = new Date();
    const body = JSON.stringify({
      status: 'ok',
      bridge_version: BRIDGE_VERSION,
      server_time: now.toISOString(),
      started_at: STARTED_AT.toISOString(),
      uptime_seconds: Math.floor((now.getTime() - STARTED_AT.getTime()) / 1000),
      pid: process.pid,
      device_serial: deviceSerial,
      last_device_poll_at: lastDevicePollAt ? lastDevicePollAt.toISOString() : null,
      last_device_poll_age_seconds: lastDevicePollAt ? Math.floor((now.getTime() - lastDevicePollAt.getTime()) / 1000) : null,
      last_punch_at: lastPunchAt ? lastPunchAt.toISOString() : null,
      last_punch_age_seconds: lastPunchAt ? Math.floor((now.getTime() - lastPunchAt.getTime()) / 1000) : null,
      employee_cache_size: empCache.size,
      employee_cache_loaded_at: lastEmployeeCacheLoadAt ? lastEmployeeCacheLoadAt.toISOString() : null,
      employee_cache_age_seconds: lastEmployeeCacheLoadAt ? Math.floor((now.getTime() - lastEmployeeCacheLoadAt.getTime()) / 1000) : null,
      punches_saved_since_boot: punchesSavedSinceBoot,
      punches_today: punchesToday
    }, null, 2);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  // IMPORTANT (clock): The X2008 in ADMS push mode reads this HTTP "Date" header
  // and sets its own clock from it on every poll. Send TRUE current time only.
  // Do NOT add any offset here. A previous "+ 30 * 60 * 1000" offset pushed the
  // device 30 min ahead of IST and re-applied on every poll (fixed 2026-06-10).
  // The device's displayed timezone is configured on the device itself, not here.
  const adjustedDate = new Date(Date.now());
  res.setHeader('Date', adjustedDate.toUTCString());
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    console.log(new Date().toISOString(), req.method, url, body.substring(0,300));

    const snMatch = url.match(/[?&]SN=([^&]+)/);
    if (snMatch) deviceSerial = snMatch[1];
    if (url.includes('/iclock/')) lastDevicePollAt = new Date();

    if (url.includes('/iclock/cdata') && req.method === 'GET') {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('GET OPTION FROM:0\nATTLOGStamp=0\nOPERLOGStamp=0\nATTPHOTOStamp=0\nErrorDelay=30\nDelay=10\nTransTimes=00:00;23:59\nTransInterval=1\nTransFlag=TransData AttLog OpLog\nRealtime=1\nEncrypt=0\n');
    } else if (url.includes('/iclock/cdata') && req.method === 'POST') {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OK: ' + (body.split('\n').length - 1));
      if (body.length > 0) {
        const lines = body.trim().split('\n');
        for (const line of lines) {
          try {
            const parts = line.trim().split('\t');
            if (parts.length >= 2) {
              const pin = parts[0];
              const time = parts[1];
              if (pin && time && time.includes('-')) {
                const employeeId = await resolveEmployeeId(String(pin));
                const punchedAt = new Date(time.replace(' ', 'T') + '+05:30').toISOString();
                const { error } = await supabase.from('attendance_punches').upsert({
                  employee_id: employeeId,
                  device_user_id: String(pin),
                  punched_at: punchedAt,
                  device_id: 'FACTORY_ZK1',
                  raw_data: { line }
                }, { onConflict: 'device_user_id,punched_at' });
                if (error) console.error('DB Error:', error.message);
                else {
                  punchesSavedSinceBoot++;
                  lastPunchAt = new Date();
                  console.log('Saved punch: PIN=' + pin + ' Time=' + time + ' EmpID=' + (employeeId || 'NULL'));
                }
              }
            }
          } catch (e) {
            console.error('Punch processing error:', e.message, 'Line:', line);
          }
        }
      }
    } else if (url.includes('/iclock/getrequest')) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OK');
    } else if (url.includes('/iclock/devicecmd')) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OK');
    } else {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OK');
    }
  });
});

async function main() {
  await loadEmployeeCache();
  setInterval(loadEmployeeCache, 30 * 60 * 1000);
  server.listen(8080, () => console.log('Comfy Bridge ' + BRIDGE_VERSION + ' listening on port 8080'));
}

main();
