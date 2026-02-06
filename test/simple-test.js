const Database = require('better-sqlite3');
const path = require('path');
const zlib = require('zlib');

const REAL_FOLDER_NAME = '01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_XConSimFoc';
const CONFIG_ROOT = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';

const evorunPath = path.join(CONFIG_ROOT, REAL_FOLDER_NAME);
const genomesDbPath = path.join(evorunPath, 'genomes.sqlite');

console.log('Opening database:', genomesDbPath);
const genomesDb = new Database(genomesDbPath, { readonly: true });

console.log('Getting first row...');
const row = genomesDb.prepare('SELECT * FROM genomes LIMIT 1').get();

console.log('Row ID:', row.id);
console.log('Row data type:', typeof row.data);
console.log('Is Buffer:', Buffer.isBuffer(row.data));

if (Buffer.isBuffer(row.data)) {
  console.log('Attempting decompression...');
  try {
    const decompressed = zlib.gunzipSync(row.data);
    const json = JSON.parse(decompressed.toString());
    console.log('SUCCESS: Decompressed JSON keys:', Object.keys(json));
  } catch (err) {
    console.error('Decompression failed:', err.message);
  }
} else {
  console.log('Data is not a Buffer:', row.data);
}

genomesDb.close();
console.log('Done.');
