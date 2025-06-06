#!/usr/bin/env node
// filepath: /Users/bjornpjo/Developer/apps/kromosynth-evoruns/test-sqlite-endpoints.js
// Test script for the SQLite genome and features endpoints

const http = require('http');

const SERVER_PORT = 3005;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

function makeRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testSQLiteEndpoints() {
  console.log('Testing SQLite Genome and Features Endpoints...\n');

  try {
    // First get a list of available evoruns to find one with SQLite databases
    console.log('1. Getting evorun summary to find test data...');
    const summary = await makeRequest('/evoruns/summary');
    
    if (summary.status !== 200) {
      console.error('Failed to get evorun summary:', summary.data);
      return;
    }

    // Find the first available evorun folder
    const groups = summary.data.groups;
    let testFolderName = null;
    let testUlid = null;

    for (const dateKey of Object.keys(groups)) {
      for (const nameKey of Object.keys(groups[dateKey])) {
        const runs = groups[dateKey][nameKey];
        if (runs.length > 0) {
          testFolderName = runs[0].folderName;
          testUlid = runs[0].ulid;
          break;
        }
      }
      if (testFolderName) break;
    }

    if (!testFolderName || !testUlid) {
      console.log('No test evorun folders found');
      return;
    }

    console.log(`Using test folder: ${testFolderName}`);
    console.log(`Using test ULID: ${testUlid}`);
    console.log();

    // Test listing available IDs
    console.log('2. Testing ID listing endpoint...');
    const idsResponse = await makeRequest(`/evoruns/${encodeURIComponent(testFolderName)}/ids`);
    console.log(`Status: ${idsResponse.status}`);
    if (idsResponse.status === 200) {
      const data = idsResponse.data;
      console.log(`Genome IDs available: ${data.genomeIds ? data.genomeIds.length : 0}`);
      console.log(`Feature IDs available: ${data.featureIds ? data.featureIds.length : 0}`);
      
      // Use the first available ID if our test ULID doesn't exist
      if (data.genomeIds && data.genomeIds.length > 0 && !data.genomeIds.includes(testUlid)) {
        testUlid = data.genomeIds[0];
        console.log(`Switching to available ULID: ${testUlid}`);
      }
    } else {
      console.log(`Error:`, idsResponse.data);
    }
    console.log();

    // Test genome endpoint
    console.log('3. Testing genome endpoint...');
    const genomeResponse = await makeRequest(`/evoruns/${encodeURIComponent(testFolderName)}/genome/${testUlid}`);
    console.log(`Status: ${genomeResponse.status}`);
    if (genomeResponse.status === 200) {
      console.log(`Successfully retrieved genome for ULID: ${testUlid}`);
      console.log(`Genome data keys:`, Object.keys(genomeResponse.data.genome || {}));
    } else {
      console.log(`Error:`, genomeResponse.data);
    }
    console.log();

    // Test features endpoint
    console.log('4. Testing features endpoint...');
    const featuresResponse = await makeRequest(`/evoruns/${encodeURIComponent(testFolderName)}/features/${testUlid}`);
    console.log(`Status: ${featuresResponse.status}`);
    if (featuresResponse.status === 200) {
      console.log(`Successfully retrieved features for ULID: ${testUlid}`);
      console.log(`Features data keys:`, Object.keys(featuresResponse.data.features || {}));
    } else {
      console.log(`Error:`, featuresResponse.data);
    }
    console.log();

    // Test combined data endpoint
    console.log('5. Testing combined data endpoint...');
    const dataResponse = await makeRequest(`/evoruns/${encodeURIComponent(testFolderName)}/data/${testUlid}`);
    console.log(`Status: ${dataResponse.status}`);
    if (dataResponse.status === 200) {
      const data = dataResponse.data;
      console.log(`Successfully retrieved combined data for ULID: ${testUlid}`);
      console.log(`Has genome: ${!!data.genome}`);
      console.log(`Has features: ${!!data.features}`);
    } else {
      console.log(`Error:`, dataResponse.data);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

if (require.main === module) {
  testSQLiteEndpoints();
}

module.exports = { makeRequest, testSQLiteEndpoints };
