#!/usr/bin/env node
// Debug script to test database decompression directly

const { getRunDB } = require('../evorun-db');
const path = require('path');

const REAL_FOLDER_NAME = '01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';
const CONFIG_ROOT = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';

async function testDatabaseDirectly() {
  console.log('Testing database decompression directly...\n');

  try {
    const evorunPath = path.join(CONFIG_ROOT, REAL_FOLDER_NAME);
    console.log('Evorun path:', evorunPath);
    
    const db = getRunDB(evorunPath);
    console.log('Database connection:', {
      hasGenomeDb: db?.hasGenomeDb,
      hasFeatureDb: db?.hasFeatureDb
    });
    
    if (!db) {
      console.log('No database connection');
      return;
    }
    
    // List some genome IDs
    const genomeIds = await db.listAllGenomeIds();
    console.log(`Found ${genomeIds.length} genomes`);
    
    if (genomeIds.length > 0) {
      const firstGenomeId = genomeIds[0];
      console.log(`\nTesting genome retrieval for: ${firstGenomeId}`);
      
      // Test async method
      const genomeDataAsync = await db.getGenome(firstGenomeId);
      console.log('Async result type:', typeof genomeDataAsync);
      console.log('Async result keys:', genomeDataAsync ? Object.keys(genomeDataAsync) : 'null');
      console.log('Async result sample:', genomeDataAsync ? JSON.stringify(genomeDataAsync).substring(0, 200) + '...' : 'null');
      
      // Test sync method
      const genomeDataSync = db.getGenomeSync(firstGenomeId);
      console.log('\nSync result type:', typeof genomeDataSync);
      console.log('Sync result keys:', genomeDataSync ? Object.keys(genomeDataSync) : 'null');
      console.log('Sync result sample:', genomeDataSync ? JSON.stringify(genomeDataSync).substring(0, 200) + '...' : 'null');
    }
    
    // Test features too
    const featureIds = await db.listAllFeatureGenomeIds();
    console.log(`\nFound ${featureIds.length} features`);
    
    if (featureIds.length > 0) {
      const firstFeatureId = featureIds[0];
      console.log(`\nTesting feature retrieval for: ${firstFeatureId}`);
      
      const featureDataAsync = await db.getFeature(firstFeatureId);
      console.log('Feature async result type:', typeof featureDataAsync);
      console.log('Feature async result keys:', featureDataAsync ? Object.keys(featureDataAsync) : 'null');
      console.log('Feature async result sample:', featureDataAsync ? JSON.stringify(featureDataAsync).substring(0, 200) + '...' : 'null');
    }
    
  } catch (error) {
    console.error('Error in database test:', error);
  }
}

if (require.main === module) {
  testDatabaseDirectly();
}
