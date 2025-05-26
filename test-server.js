#!/usr/bin/env node
// filepath: /Users/bjornpjo/Developer/apps/kromosynth-evoruns/test-server.js
// Test script for the evorun browser server

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

async function testServer() {
  console.log('Testing Evorun Browser Server...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await makeRequest('/health');
    console.log(`Status: ${health.status}`);
    console.log(`Response:`, health.data);
    console.log();

    // Test config endpoint
    console.log('2. Testing config endpoint...');
    const config = await makeRequest('/config');
    console.log(`Status: ${config.status}`);
    console.log(`Response:`, config.data);
    console.log();

    // Test evorun summary
    console.log('3. Testing evorun summary...');
    const summary = await makeRequest('/evoruns/summary');
    console.log(`Status: ${summary.status}`);
    if (summary.status === 200) {
      console.log(`Total runs found: ${summary.data.totalRuns}`);
      console.log(`Groups:`, Object.keys(summary.data.groups).length);
      
      // Show first few groups as example
      const groupKeys = Object.keys(summary.data.groups).slice(0, 2);
      for (const groupKey of groupKeys) {
        console.log(`  ${groupKey}:`, Object.keys(summary.data.groups[groupKey]));
      }
    } else {
      console.log(`Error:`, summary.data);
    }
    console.log();

    // Test with different granularity
    console.log('4. Testing evorun summary with week granularity...');
    const summaryWeek = await makeRequest('/evoruns/summary?granularity=week');
    console.log(`Status: ${summaryWeek.status}`);
    if (summaryWeek.status === 200) {
      console.log(`Granularity: ${summaryWeek.data.granularity}`);
      console.log(`Groups:`, Object.keys(summaryWeek.data.groups).slice(0, 3));
    } else {
      console.log(`Error:`, summaryWeek.data);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

if (require.main === module) {
  testServer();
}

module.exports = { makeRequest, testServer };
