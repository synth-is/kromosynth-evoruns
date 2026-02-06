#!/usr/bin/env node
// Test script to verify the fixed decompression

const { getRunDB } = require('../evorun-db');
const path = require('path');

const REAL_FOLDER_NAME = '01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';
const CONFIG_ROOT = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';

async function testFixedDecompression() {
  console.log('Testing fixed decompression...\n');

  try {
    const evorunPath = path.join(CONFIG_ROOT, REAL_FOLDER_NAME);
    const db = getRunDB(evorunPath);
    
    if (!db) {
      console.log('No database connection');
      return;
    }
    
    // Get the first genome ID
    const genomeIds = await db.listAllGenomeIds();
    const firstId = genomeIds[0];
    console.log('Testing with genome ID:', firstId);
    
    // Test async genome retrieval
    console.log('\n--- Testing async genome retrieval ---');
    const genomeData = await db.getGenome(firstId);
    console.log('Genome data type:', typeof genomeData);
    
    if (genomeData && typeof genomeData === 'object') {
      console.log('✅ SUCCESS: Genome data is an object');
      console.log('Genome keys:', Object.keys(genomeData));
      console.log('Sample genome data:', JSON.stringify(genomeData).substring(0, 200) + '...');
    } else {
      console.log('❌ FAILED: Genome data is not an object:', genomeData);
    }
    
    // Test sync genome retrieval
    console.log('\n--- Testing sync genome retrieval ---');
    const genomeSyncData = db.getGenomeSync(firstId);
    console.log('Sync genome data type:', typeof genomeSyncData);
    
    if (genomeSyncData && typeof genomeSyncData === 'object') {
      console.log('✅ SUCCESS: Sync genome data is an object');
      console.log('Sync genome keys:', Object.keys(genomeSyncData));
    } else {
      console.log('❌ FAILED: Sync genome data is not an object:', genomeSyncData);
    }
    
    // Test features if available
    const featureIds = await db.listAllFeatureGenomeIds();
    if (featureIds.length > 0) {
      const firstFeatureId = featureIds[0];
      console.log('\n--- Testing feature retrieval ---');
      console.log('Testing with feature ID:', firstFeatureId);
      
      const featureData = await db.getFeature(firstFeatureId);
      console.log('Feature data type:', typeof featureData);
      
      if (featureData && typeof featureData === 'object') {
        console.log('✅ SUCCESS: Feature data is an object');
        console.log('Feature keys:', Object.keys(featureData));
        console.log('Sample feature data:', JSON.stringify(featureData).substring(0, 200) + '...');
      } else {
        console.log('❌ FAILED: Feature data is not an object:', featureData);
      }
    } else {
      console.log('\n--- No features available for testing ---');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testFixedDecompression().then(() => {
  console.log('\nTest completed');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
