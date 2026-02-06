// Test script to verify that the evorun browser server can now find evorun directories in subdirectories

const http = require('http');

const CONFIG = {
  baseUrl: 'http://127.0.0.1:3004',
  testFolderName: '01JTEP8ZPWP088KG7V0BX3WEFS_evoConf_singleMap_refSingleEmbeddings_mfcc-statistics_pca_retrainIncr50_zscoreNSynthTrain_TE-AudioSubregions_TE-MFCCFocusAreas'
};

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function testSubdirectorySupport() {
  try {
    console.log('Testing subdirectory support...\n');
    
    // First, get the summary to see available evoruns
    console.log('1. Getting evorun summary...');
    const summary = await makeRequest(`${CONFIG.baseUrl}/evoruns/summary`);
    
    if (summary.error) {
      console.error('Error getting summary:', summary.error);
      return;
    }
    
    console.log(`Found ${summary.totalRuns} total runs`);
    
    // Look for a test evorun in the groups
    let testUlid = null;
    let foundFolderName = null;
    
    for (const dateKey of Object.keys(summary.groups)) {
      for (const nameKey of Object.keys(summary.groups[dateKey])) {
        const runs = summary.groups[dateKey][nameKey];
        if (runs.length > 0) {
          const run = runs[0];
          console.log(`Found test evorun: ${run.folderName}`);
          console.log(`Relative path: ${run.relativePath}`);
          testUlid = run.ulid;
          foundFolderName = run.folderName;
          break;
        }
      }
      if (testUlid) break;
    }
    
    if (!testUlid || !foundFolderName) {
      console.log('No evoruns found to test with');
      return;
    }
    
    // Test data endpoint with the found evorun
    console.log(`\n2. Testing data endpoint with folder: ${foundFolderName}`);
    console.log(`Using ULID: ${testUlid}`);
    
    const dataUrl = `${CONFIG.baseUrl}/evoruns/${encodeURIComponent(foundFolderName)}/data/${testUlid}`;
    console.log(`Request URL: ${dataUrl}`);
    
    const data = await makeRequest(dataUrl);
    
    if (data.error) {
      console.error('❌ Error getting data:', data.error);
    } else {
      console.log('✅ Successfully retrieved data!');
      console.log('Response keys:', Object.keys(data));
      if (data.genome) {
        console.log('✅ Genome data found');
      }
      if (data.features) {
        console.log('✅ Features data found');
      }
    }
    
    // Test IDs endpoint
    console.log(`\n3. Testing IDs endpoint...`);
    const idsUrl = `${CONFIG.baseUrl}/evoruns/${encodeURIComponent(foundFolderName)}/ids`;
    const ids = await makeRequest(idsUrl);
    
    if (ids.error) {
      console.error('❌ Error getting IDs:', ids.error);
    } else {
      console.log('✅ Successfully retrieved IDs!');
      if (ids.genomeIds) {
        console.log(`Found ${ids.genomeIds.length} genome IDs`);
      }
      if (ids.featureIds) {
        console.log(`Found ${ids.featureIds.length} feature IDs`);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testSubdirectorySupport().then(() => {
  console.log('\nTest completed');
}).catch(err => {
  console.error('Test error:', err);
});
