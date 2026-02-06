#!/usr/bin/env node
// Deep debug script to understand the data flow

const { getRunDB } = require('../evorun-db');
const path = require('path');
const Database = require('better-sqlite3');

const REAL_FOLDER_NAME = '01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';
const CONFIG_ROOT = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';

async function deepDebug() {
  console.log('Deep debugging the data flow...\n');

  try {
    const evorunPath = path.join(CONFIG_ROOT, REAL_FOLDER_NAME);
    
    // Direct database access
    const genomesDbPath = path.join(evorunPath, 'genomes.sqlite');
    const genomesDb = new Database(genomesDbPath, { readonly: true });
    
    // Check the schema
    const schema = genomesDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='genomes'").get();
    console.log('Database schema:', schema.sql);
    
    // Get raw data
    const getGenome = genomesDb.prepare('SELECT * FROM genomes LIMIT 1');
    const row = getGenome.get();
    
    console.log('\nRaw database row:');
    console.log('ID:', row.id);
    console.log('Data type:', typeof row.data);
    console.log('Is Buffer:', Buffer.isBuffer(row.data));
    console.log('Constructor:', row.data?.constructor?.name);
    
    // Check if it's already JSON-serialized Buffer
    if (!Buffer.isBuffer(row.data) && typeof row.data === 'object') {
      console.log('Data appears to be JSON-serialized Buffer');
      console.log('Data keys:', Object.keys(row.data));
      console.log('Type field:', row.data.type);
      console.log('Data field length:', row.data.data?.length);
    }
    
    genomesDb.close();
    
    // Now test through our API
    console.log('\n--- Testing through API ---');
    const db = getRunDB(evorunPath);
    const genomeIds = await db.listAllGenomeIds();
    const firstId = genomeIds[0];
    
    console.log('Getting genome through API...');
    const apiResult = await db.getGenome(firstId);
    console.log('API result type:', typeof apiResult);
    console.log('API result keys:', apiResult ? Object.keys(apiResult) : 'null');
    
    if (apiResult && apiResult.type === 'Buffer') {
      console.log('API is still returning Buffer object - the fix didn\'t work');
    } else {
      console.log('API returned proper JSON object');
    }
    
  } catch (error) {
    console.error('Error in deep debug:', error);
  }
}

deepDebug().then(() => {
  console.log('\nDeep debug completed');
  process.exit(0);
}).catch(err => {
  console.error('Deep debug failed:', err);
  process.exit(1);
});
