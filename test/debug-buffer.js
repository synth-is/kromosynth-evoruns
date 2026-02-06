#!/usr/bin/env node
// Debug script to understand the Buffer format issue

const { getRunDB } = require('../evorun-db');
const path = require('path');
const zlib = require('zlib');

const REAL_FOLDER_NAME = '01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';
const CONFIG_ROOT = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';

async function debugBufferIssue() {
  console.log('Debugging Buffer decompression issue...\n');

  try {
    const evorunPath = path.join(CONFIG_ROOT, REAL_FOLDER_NAME);
    console.log('Using evorun path:', evorunPath);
    
    const db = getRunDB(evorunPath);
    
    if (!db) {
      console.log('No database connection');
      return;
    }
    
    console.log('Database connection established');
    
    // Get the first genome ID
    const genomeIds = await db.listAllGenomeIds();
    const firstId = genomeIds[0];
    console.log('Testing with genome ID:', firstId);
    
    // Get raw data using the internal methods
    const Database = require('better-sqlite3');
    const genomesDbPath = path.join(evorunPath, 'genomes.sqlite');
    const genomesDb = new Database(genomesDbPath, { readonly: true });
    const getGenome = genomesDb.prepare('SELECT * FROM genomes WHERE id = ?');
    
    const row = getGenome.get(firstId);
    console.log('\nRaw row data:');
    console.log('Type of row.data:', typeof row.data);
    console.log('Is Buffer?', Buffer.isBuffer(row.data));
    console.log('Constructor name:', row.data?.constructor?.name);
    
    if (Buffer.isBuffer(row.data)) {
      console.log('Data is already a Buffer, attempting decompression...');
      try {
        const decompressed = zlib.gunzipSync(row.data);
        const jsonData = JSON.parse(decompressed.toString());
        console.log('Success! Decompressed keys:', Object.keys(jsonData));
      } catch (err) {
        console.error('Decompression failed:', err.message);
      }
    } else {
      console.log('Data is not a Buffer, checking structure...');
      console.log('Sample of data:', JSON.stringify(row.data).substring(0, 200) + '...');
      
      // Try to reconstruct Buffer
      if (row.data && row.data.type === 'Buffer' && Array.isArray(row.data.data)) {
        console.log('Reconstructing Buffer from serialized format...');
        const buffer = Buffer.from(row.data.data);
        try {
          const decompressed = zlib.gunzipSync(buffer);
          const jsonData = JSON.parse(decompressed.toString());
          console.log('Success after reconstruction! Keys:', Object.keys(jsonData));
        } catch (err) {
          console.error('Decompression failed after reconstruction:', err.message);
        }
      }
    }
    
    genomesDb.close();
    
  } catch (error) {
    console.error('Error in debug:', error);
  }
}

debugBufferIssue().then(() => {
  console.log('Debug completed');
  process.exit(0);
}).catch(err => {
  console.error('Debug failed:', err);
  process.exit(1);
});
