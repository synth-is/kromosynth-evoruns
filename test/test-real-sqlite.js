#!/usr/bin/env node
// Test script for the SQLite endpoints using real database files

const http = require('http');

const SERVER_PORT = 3005;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

// Use the actual folder name you provided
const REAL_FOLDER_NAME = '01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';

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
  console.log('Testing SQLite endpoints with real data...\n');

  try {
    // Test 1: List genome IDs from the real folder
    console.log('1. Testing genome IDs listing...');
    const genomeIds = await makeRequest(`/evoruns/${encodeURIComponent(REAL_FOLDER_NAME)}/genomes`);
    console.log(`Status: ${genomeIds.status}`);
    if (genomeIds.status === 200) {
      console.log(`Found ${genomeIds.data.genomeIds.length} genomes`);
      console.log(`First few genome IDs:`, genomeIds.data.genomeIds.slice(0, 5));
    } else {
      console.log(`Error:`, genomeIds.data);
    }
    console.log();

    // Test 2: List feature IDs from the real folder
    console.log('2. Testing feature IDs listing...');
    const featureIds = await makeRequest(`/evoruns/${encodeURIComponent(REAL_FOLDER_NAME)}/features`);
    console.log(`Status: ${featureIds.status}`);
    if (featureIds.status === 200) {
      console.log(`Found ${featureIds.data.featureIds.length} features`);
      console.log(`First few feature IDs:`, featureIds.data.featureIds.slice(0, 5));
    } else {
      console.log(`Error:`, featureIds.data);
    }
    console.log();

    // Test 3: Get a specific genome (if we found any)
    if (genomeIds.status === 200 && genomeIds.data.genomeIds.length > 0) {
      const firstGenomeId = genomeIds.data.genomeIds[0];
      console.log(`3. Testing genome retrieval for ID: ${firstGenomeId}`);
      const genome = await makeRequest(`/evoruns/${encodeURIComponent(REAL_FOLDER_NAME)}/genome/${firstGenomeId}`);
      console.log(`Status: ${genome.status}`);
      if (genome.status === 200) {
        console.log(`Genome data type:`, typeof genome.data.genome);
        console.log(`Genome keys:`, Object.keys(genome.data.genome || {}).slice(0, 5));
      } else {
        console.log(`Error:`, genome.data);
      }
      console.log();
    }

    // Test 4: Get a specific feature (if we found any)
    if (featureIds.status === 200 && featureIds.data.featureIds.length > 0) {
      const firstFeatureId = featureIds.data.featureIds[0];
      console.log(`4. Testing feature retrieval for ID: ${firstFeatureId}`);
      const feature = await makeRequest(`/evoruns/${encodeURIComponent(REAL_FOLDER_NAME)}/features/${firstFeatureId}`);
      console.log(`Status: ${feature.status}`);
      if (feature.status === 200) {
        console.log(`Feature data type:`, typeof feature.data.feature);
        console.log(`Feature keys:`, Object.keys(feature.data.feature || {}).slice(0, 5));
      } else {
        console.log(`Error:`, feature.data);
      }
      console.log();
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

if (require.main === module) {
  testSQLiteEndpoints();
}

module.exports = { testSQLiteEndpoints };
