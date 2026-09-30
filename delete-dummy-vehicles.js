#!/usr/bin/env node
/**
 * DELETE dummy vehicles from Catalyst database
 * Keeps only the 6 real Cartrack trucks:
 * DCD8955, DCD8954, DCD8953, NFX5791, NAJ6018, NAN9911
 *
 * Usage: node delete-dummy-vehicles.js
 */

const https = require('https');

const API_BASE_URL = 'https://rarelogistics123-936920553.development.catalystserverless.com';

// Dummy plate numbers to DELETE
const DUMMY_PLATES = [
  'CLB 7712',
  'ILC 2298', 
  'NGP 1204',
  'ABC 3391',
  'DVO 8823',
  'CEB 5540',
  'BCL 6650'
];

// Real plate numbers to KEEP
const REAL_PLATES = [
  'DCD8955',
  'DCD8954',
  'DCD8953',
  'NFX5791',
  'NAJ6018',
  'NAN9911'
];

async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getAllVehicles() {
  console.log('📡 Fetching all vehicles...');
  const result = await request('GET', '/vehicles');
  if (result.status !== 200) {
    throw new Error(`Failed to fetch vehicles: ${result.status}`);
  }
  return result.body || [];
}

async function deleteVehicle(rowid) {
  console.log(`  ⏳ Attempting to delete ROWID: ${rowid}...`);
  
  // Note: There may not be a DELETE endpoint, so we'll try PATCH with deletion marker
  // or we'll need to use Catalyst's ZCQL to delete
  
  // For now, we'll just identify which ones need to be deleted
  // The actual deletion requires Catalyst backend support
  return rowid;
}

async function main() {
  try {
    console.log('🚛 IntelliFleet Dummy Vehicle Cleanup\n');
    console.log(`Dummy plates to DELETE: ${DUMMY_PLATES.join(', ')}`);
    console.log(`Real plates to KEEP: ${REAL_PLATES.join(', ')}\n`);

    const allVehicles = await getAllVehicles();
    console.log(`✅ Found ${allVehicles.length} total vehicles in database\n`);

    const dummyVehicles = allVehicles.filter(v => 
      DUMMY_PLATES.some(plate => v.plate_no && v.plate_no.includes(plate))
    );

    const realVehicles = allVehicles.filter(v =>
      REAL_PLATES.some(plate => v.plate_no && v.plate_no.includes(plate))
    );

    console.log(`📊 BREAKDOWN:`);
    console.log(`   Real vehicles found: ${realVehicles.length}`);
    realVehicles.forEach(v => {
      console.log(`   ✅ ROWID: ${v.ROWID} | Plate: ${v.plate_no}`);
    });

    console.log(`\n   Dummy vehicles found: ${dummyVehicles.length}`);
    dummyVehicles.forEach(v => {
      console.log(`   ❌ ROWID: ${v.ROWID} | Plate: ${v.plate_no}`);
    });

    console.log('\n⚠️  To delete the dummy vehicles, you need to:\n');
    console.log('OPTION 1 - Delete via Catalyst Admin:');
    console.log('  1. Log into your Catalyst console');
    console.log('  2. Navigate to Data -> vehicles table');
    dummyVehicles.forEach(v => {
      console.log(`  3. Find and DELETE ROWID: ${v.ROWID} (plate: ${v.plate_no})`);
    });

    console.log('\nOPTION 2 - Delete via backend function (admin-module):');
    console.log('  Create a POST /admin/delete-vehicles endpoint with body:');
    console.log(`  {
  "rowids": [${dummyVehicles.map(v => `"${v.ROWID}"`).join(', ')}]
}`);

    console.log('\nOPTION 3 - Delete via ZCQL query (Catalyst console):');
    dummyVehicles.forEach(v => {
      console.log(`  DELETE FROM vehicles WHERE ROWID = ${v.ROWID}`);
    });

    console.log('\n🎯 After deletion, verify with:');
    console.log('  curl https://rarelogistics123-936920553.development.catalystserverless.com/vehicles');
    console.log('  Should return exactly 6 real vehicles');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
