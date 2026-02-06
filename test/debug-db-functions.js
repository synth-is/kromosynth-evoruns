#!/usr/bin/env node
// Debug script to test database functions directly

const { getRunDB } = require('../evorun-db');

const REAL_FOLDER_PATH = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';

async function debugDatabase() {
  console.log('Testing database functions directly...\n');
  console.log('Script started');

  try {
    console.log('Requiring database module...');
    // Get database connection
    console.log('1. Getting database connection...');
    const db = getRunDB(REAL_FOLDER_PATH);
    
    if (!db) {
      console.log('❌ No database connection returned');
      return;
    }
    
    console.log('✅ Database connection established');
    console.log(`   Has genome DB: ${db.hasGenomeDb}`);
    console.log(`   Has feature DB: ${db.hasFeatureDb}`);
    console.log();

    // Test listing genome IDs
    if (db.hasGenomeDb) {
      console.log('2. Testing genome ID listing...');
      const genomeIds = await db.listAllGenomeIds();
      console.log(`✅ Found ${genomeIds.length} genome IDs`);
      
      if (genomeIds.length > 0) {
        const firstId = genomeIds[0];
        console.log(`   Testing with first ID: ${firstId}`);
        
        // Test async genome retrieval
        console.log('   Testing async getGenome...');
        const genomeAsync = await db.getGenome(firstId);
        console.log(`   Async result type: ${typeof genomeAsync}`);
        console.log(`   Async result is null: ${genomeAsync === null}`);
        
        if (genomeAsync && typeof genomeAsync === 'object') {
          console.log(`   Async genome keys: ${Object.keys(genomeAsync).slice(0, 5)}`);
        }
        
        // Test sync genome retrieval
        console.log('   Testing sync getGenomeSync...');
        const genomeSync = db.getGenomeSync(firstId);
        console.log(`   Sync result type: ${typeof genomeSync}`);
        console.log(`   Sync result is null: ${genomeSync === null}`);
        
        if (genomeSync && typeof genomeSync === 'object') {
          console.log(`   Sync genome keys: ${Object.keys(genomeSync).slice(0, 5)}`);
        }
      }
    } else {
      console.log('2. ❌ No genome database available');
    }
    console.log();

    // Test listing feature IDs
    if (db.hasFeatureDb) {
      console.log('3. Testing feature ID listing...');
      const featureIds = await db.listAllFeatureGenomeIds();
      console.log(`✅ Found ${featureIds.length} feature IDs`);
      
      if (featureIds.length > 0) {
        const firstId = featureIds[0];
        console.log(`   Testing with first ID: ${firstId}`);
        
        // Test async feature retrieval
        console.log('   Testing async getFeature...');
        const featureAsync = await db.getFeature(firstId);
        console.log(`   Async result type: ${typeof featureAsync}`);
        console.log(`   Async result is null: ${featureAsync === null}`);
        
        if (featureAsync && typeof featureAsync === 'object') {
          console.log(`   Async feature keys: ${Object.keys(featureAsync).slice(0, 5)}`);
        }
        
        // Test sync feature retrieval
        console.log('   Testing sync getFeatureSync...');
        const featureSync = db.getFeatureSync(firstId);
        console.log(`   Sync result type: ${typeof featureSync}`);
        console.log(`   Sync result is null: ${featureSync === null}`);
        
        if (featureSync && typeof featureSync === 'object') {
          console.log(`   Sync feature keys: ${Object.keys(featureSync).slice(0, 5)}`);
        }
      }
    } else {
      console.log('3. ❌ No feature database available');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
    console.error('Stack trace:', error.stack);
  }
}

if (require.main === module) {
  console.log('Main module check passed');
  debugDatabase().then(() => {
    console.log('Debug function completed');
  }).catch(err => {
    console.error('Debug function failed:', err);
  });
}
