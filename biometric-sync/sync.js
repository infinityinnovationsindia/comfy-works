#!/usr/bin/env node
/**
 * Comfy Works — Biometric Sync Service
 * Connects to ZKTeco X2008 at factory every 5 minutes
 * Pulls attendance punches → pushes to Supabase attendance_punches table
 *
 * Run on factory local machine (Windows or Linux):
 *   npm install
 *   cp .env.example .env     # fill in your values
 *   node sync.js             # direct run
 *   pm2 start ecosystem.config.js  # production (auto-restart)
 *
 * IMPORTANT: The biometric device maps users by an integer user ID.
 * By convention, Comfy Works maps:
 *   ZKTeco user ID 1 → CF-001
 *   ZKTeco user ID 2 → CF-002
 *   etc.
 * Enroll each employee in the ZKTeco device using their CF number (digits only).
 */

require('dotenv').config();
const ZKLib = require('node-zklib');
const { createClient } = require('@supabase/supabase-js');

// ── Config ─────────────────────────────────────────────────────
const DEVICE_IP      = process.env.ZKTECO_IP   || '192.168.29.110';
const DEVICE_PORT    = parseInt(process.env.ZKTECO_PORT || '4370');
const TIMEOUT_MS     = parseInt(process.env.ZKTECO_TIMEOUT_MS || '10000');
const INTERVAL_MS    = parseInt(process.env.SYNC_INTERVAL_MS  || '300000'); // 5 min
const DEVICE_ID      = 'FACTORY_X2008';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Track last sync time — on first run, pull last 2 hours to catch any gap
let lastSyncTime = new Date(Date.now() - 2 * 60 * 60 * 1000);

// ── Logging ────────────────────────────────────────────────────
function log(msg)  { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] WARN: ${msg}`); }
function err(msg)  { console.error(`[${new Date().toISOString()}] ERROR: ${msg}`); }

// ── Employee lookup cache (refresh every 10 minutes) ───────────
let empCache = new Map(); // zkUserId (number) → employee uuid
let empCacheTime = 0;

async function refreshEmpCache() {
  const now = Date.now();
  if (now - empCacheTime < 10 * 60 * 1000) return;
  const { data, error } = await supabase
    .from('employees')
    .select('id, employee_no')
    .eq('status', 'Active');
  if (error) { warn('Could not refresh employee cache: ' + error.message); return; }
  empCache.clear();
  for (const emp of data) {
    const digits = parseInt(emp.employee_no.replace('CF-', ''), 10);
    if (!isNaN(digits)) empCache.set(digits, emp.id);
  }
  empCacheTime = now;
  log(`Employee cache refreshed: ${empCache.size} employees`);
}

// ── Main sync ──────────────────────────────────────────────────
async function syncAttendance() {
  log(`Starting sync — pulling records since ${lastSyncTime.toISOString()}`);

  await refreshEmpCache();

  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, TIMEOUT_MS, 4000);

  try {
    await zk.createSocket();
    log('Connected to ZKTeco device');

    // node-zklib v0.6.x API
    const { data: logs } = await zk.getAttendances();

    if (!logs || logs.length === 0) {
      log('No attendance records on device');
      return;
    }

    // Filter to new records only
    const newRecords = logs.filter(r => {
      const t = new Date(r.attTime);
      return !isNaN(t.getTime()) && t > lastSyncTime;
    });

    log(`Found ${newRecords.length} new punch(es) out of ${logs.length} total on device`);

    let inserted = 0;
    let skipped  = 0;

    for (const record of newRecords) {
      const zkUserId = parseInt(String(record.deviceUserId), 10);
      const empId    = empCache.get(zkUserId);

      if (!empId) {
        warn(`No employee found for ZK user ID ${zkUserId} — enroll in ZKTeco with CF number`);
        continue;
      }

      const punchedAt = new Date(record.attTime).toISOString();

      // ZKTeco inOutStatus: 0=Check-In, 1=Check-Out, 4=OT-In, 5=OT-Out
      // Treat 0,4 as Check-In; 1,5 as Check-Out
      const punchType = [0,4].includes(record.inOutStatus) ? 'Check-In' : 'Check-Out';

      // Deduplication: check if this exact punch already exists
      const { data: existing } = await supabase
        .from('attendance_punches')
        .select('id')
        .eq('employee_id', empId)
        .eq('punched_at', punchedAt)
        .single();

      if (existing) { skipped++; continue; }

      const { error: insErr } = await supabase.from('attendance_punches').insert({
        employee_id: empId,
        punched_at:  punchedAt,
        punch_type:  punchType,
        device_id:   DEVICE_ID,
        raw_data:    record,
      });

      if (insErr) {
        err(`Failed to insert punch for emp ${empId}: ${insErr.message}`);
      } else {
        inserted++;
      }
    }

    log(`Sync complete: ${inserted} inserted, ${skipped} duplicates skipped`);
    lastSyncTime = new Date();

  } catch (e) {
    err('Sync failed: ' + (e.message || e));
  } finally {
    try { await zk.disconnect(); } catch (_) {}
  }
}

// ── Entry point ────────────────────────────────────────────────
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    err('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
  }
  log(`Comfy Biometric Sync starting`);
  log(`Device: ${DEVICE_IP}:${DEVICE_PORT}`);
  log(`Sync interval: ${INTERVAL_MS / 1000}s`);

  await syncAttendance();
  setInterval(syncAttendance, INTERVAL_MS);
}

main().catch(e => { err(e); process.exit(1); });
