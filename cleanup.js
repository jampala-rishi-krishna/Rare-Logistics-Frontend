#!/usr/bin/env node
/**
 * DELETE dummy vehicles from Catalyst database
 * Run: node cleanup.js
 */

const https = require('https');

const API_BASE = 'https://rarelogistics123-936920553.development.catalystserverless.com';
const DUMMY_PLATES = ['CLB 7712', 'ILC 2298', 'NGP 1204', 'ABC 3391', 'DVO 8823', 'CEB 5540', 'BCL 6650'];
const REAL_PLATES = ['DCD8955', 'DCD8954', 'DCD8953', 'NFX5791', 'NAJ6018', 'NAN9911'];

async function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    console.log('🚛 IntelliFleet Cleanup - Deleting Dummy Vehicles\n');
    console.log(`API: ${API_BASE}\n`);
    
    console.log('📡 Fetching all vehicles...');
    const vehicles = await httpGet('/vehicles');
    console.log(`✅ Found ${vehicles.length} total vehicles\n`);

    // Categorize vehicles
    const dummy = vehicles.filter(v => DUMMY_PLATES.some(p => v.plate_no && v.plate_no.includes(p)));
    const real = vehicles.filter(v => REAL_PLATES.some(p => v.plate_no && v.plate_no.includes(p)));
    const other = vehicles.filter(v => !DUMMY_PLATES.some(p => v.plate_no && v.plate_no.includes(p)) && !REAL_PLATES.some(p => v.plate_no && v.plate_no.includes(p)));

    console.log(`📊 BREAKDOWN:`);
    console.log(`   ✅ Real Cartrack trucks: ${real.length}`);
    real.forEach(v => console.log(`      ${v.ROWID} | ${v.plate_no}`));
    
    console.log(`\n   ❌ Dummy vehicles to DELETE: ${dummy.length}`);
    dummy.forEach(v => console.log(`      ${v.ROWID} | ${v.plate_no}`));

    if (other.length > 0) {
      console.log(`\n   ⚠️  Unknown vehicles: ${other.length}`);
      other.forEach(v => console.log(`      ${v.ROWID} | ${v.plate_no}`));
    }

    if (dummy.length === 0) {
      console.log('\n✅ No dummy vehicles found! Database is clean.');
      return;
    }

    console.log(`\n⚠️  To delete these ${dummy.length} dummy vehicles, you need to manually delete them.`);
    console.log('\nOption 1 - Via Catalyst Console:\n');
    dummy.forEach(v => {
      console.log(`  DELETE FROM vehicles WHERE ROWID = ${v.ROWID}`);
    });

    console.log('\nOption 2 - Via Database Admin Tool:');
    console.log('  1. Log into https://catalyst.zoho.in/');
    console.log('  2. Go to Data Store → vehicles table');
    console.log('  3. Delete these ROWIDs:');
    dummy.forEach(v => {
      console.log(`     - ${v.ROWID} (${v.plate_no})`);
    });

    console.log('\nOption 3 - One-by-one SQL:');
    dummy.forEach(v => {
      console.log(`  curl -X DELETE "${API_BASE}/vehicles/${v.ROWID}"`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
