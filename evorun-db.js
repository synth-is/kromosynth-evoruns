// evorun-db.js - Database access module for evolutionary runs
// Adapted from genome-db.js for the evorun browser server

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

// Promisify zlib functions
const gunzip = promisify(zlib.gunzip);

// Connection pool for databases
const dbPool = new Map();
const DB_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function makeRunDbApi({
  genomesDb,
  featuresDb,
  getGenome,
  getFeature,
  runPath
}) {
  return {
    async getGenome(id) {
      if (!genomesDb || !getGenome) return null;
      const row = getGenome.get(id);
      if (!row) return null;
      try {
        // Ensure row.data is a proper Buffer
        let buffer = row.data;
        if (!Buffer.isBuffer(buffer)) {
          // Handle case where Buffer was serialized to JSON
          if (buffer && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
            buffer = Buffer.from(buffer.data);
          } else {
            throw new Error('Invalid data format: expected Buffer');
          }
        }
        
        // Decompress the gzipped data
        const jsonData = await gunzip(buffer);
        const parsedData = JSON.parse(jsonData.toString());
        
        // Check if the parsed data is itself a serialized Buffer
        if (parsedData && parsedData.type === 'Buffer' && Array.isArray(parsedData.data)) {
          // Reconstruct the Buffer and parse it again
          const innerBuffer = Buffer.from(parsedData.data);
          // Try to decompress again in case it's double-compressed
          try {
            const innerJsonData = await gunzip(innerBuffer);
            return JSON.parse(innerJsonData.toString());
          } catch (innerErr) {
            // If it's not compressed, try to parse as string
            try {
              return JSON.parse(innerBuffer.toString());
            } catch (parseErr) {
              // If it's not JSON, return the buffer itself
              return parsedData;
            }
          }
        }
        
        return parsedData;
      } catch (err) {
        console.error(`Error decompressing genome ${id}:`, err);
        return null;
      }
    },
    
    async getFeature(id) {
      if (!featuresDb || !getFeature) return null;
      const row = getFeature.get(id);
      if (!row) return null;
      try {
        // Ensure row.data is a proper Buffer
        let buffer = row.data;
        if (!Buffer.isBuffer(buffer)) {
          // Handle case where Buffer was serialized to JSON
          if (buffer && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
            buffer = Buffer.from(buffer.data);
          } else {
            throw new Error('Invalid data format: expected Buffer');
          }
        }
        
        // Decompress the gzipped data
        const jsonData = await gunzip(buffer);
        const parsedData = JSON.parse(jsonData.toString());
        
        // Check if the parsed data is itself a serialized Buffer
        if (parsedData && parsedData.type === 'Buffer' && Array.isArray(parsedData.data)) {
          // Reconstruct the Buffer and parse it again
          const innerBuffer = Buffer.from(parsedData.data);
          // Try to decompress again in case it's double-compressed
          try {
            const innerJsonData = await gunzip(innerBuffer);
            return JSON.parse(innerJsonData.toString());
          } catch (innerErr) {
            // If it's not compressed, try to parse as string
            try {
              return JSON.parse(innerBuffer.toString());
            } catch (parseErr) {
              // If it's not JSON, return the buffer itself
              return parsedData;
            }
          }
        }
        
        return parsedData;
      } catch (err) {
        console.error(`Error decompressing feature ${id}:`, err);
        return null;
      }
    },
    
    getGenomeSync(id) {
      if (!genomesDb || !getGenome) return null;
      const row = getGenome.get(id);
      if (!row) return null;
      try {
        // Ensure row.data is a proper Buffer
        let buffer = row.data;
        if (!Buffer.isBuffer(buffer)) {
          // Handle case where Buffer was serialized to JSON
          if (buffer && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
            buffer = Buffer.from(buffer.data);
          } else {
            throw new Error('Invalid data format: expected Buffer');
          }
        }
        
        // Decompress the gzipped data
        const jsonData = zlib.gunzipSync(buffer);
        const parsedData = JSON.parse(jsonData.toString());
        
        // Check if the parsed data is itself a serialized Buffer
        if (parsedData && parsedData.type === 'Buffer' && Array.isArray(parsedData.data)) {
          // Reconstruct the Buffer and parse it again
          const innerBuffer = Buffer.from(parsedData.data);
          // Try to decompress again in case it's double-compressed
          try {
            const innerJsonData = zlib.gunzipSync(innerBuffer);
            return JSON.parse(innerJsonData.toString());
          } catch (innerErr) {
            // If it's not compressed, try to parse as string
            try {
              return JSON.parse(innerBuffer.toString());
            } catch (parseErr) {
              // If it's not JSON, return the buffer itself
              return parsedData;
            }
          }
        }
        
        return parsedData;
      } catch (err) {
        console.error(`Error decompressing genome ${id}:`, err);
        return null;
      }
    },
    
    getFeatureSync(id) {
      if (!featuresDb || !getFeature) return null;
      const row = getFeature.get(id);
      if (!row) return null;
      try {
        // Ensure row.data is a proper Buffer
        let buffer = row.data;
        if (!Buffer.isBuffer(buffer)) {
          // Handle case where Buffer was serialized to JSON
          if (buffer && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
            buffer = Buffer.from(buffer.data);
          } else {
            throw new Error('Invalid data format: expected Buffer');
          }
        }
        
        // Decompress the gzipped data
        const jsonData = zlib.gunzipSync(buffer);
        const parsedData = JSON.parse(jsonData.toString());
        
        // Check if the parsed data is itself a serialized Buffer
        if (parsedData && parsedData.type === 'Buffer' && Array.isArray(parsedData.data)) {
          // Reconstruct the Buffer and parse it again
          const innerBuffer = Buffer.from(parsedData.data);
          // Try to decompress again in case it's double-compressed
          try {
            const innerJsonData = zlib.gunzipSync(innerBuffer);
            return JSON.parse(innerJsonData.toString());
          } catch (innerErr) {
            // If it's not compressed, try to parse as string
            try {
              return JSON.parse(innerBuffer.toString());
            } catch (parseErr) {
              // If it's not JSON, return the buffer itself
              return parsedData;
            }
          }
        }
        
        return parsedData;
      } catch (err) {
        console.error(`Error decompressing feature ${id}:`, err);
        return null;
      }
    },
    
    close() {
      if (genomesDb) genomesDb.close();
      if (featuresDb) featuresDb.close();
      if (runPath && dbPool.has(runPath)) {
        dbPool.delete(runPath);
      }
    },
    
    get hasGenomeDb() {
      return genomesDb !== null;
    },
    
    get hasFeatureDb() {
      return featuresDb !== null;
    },
    
    /**
     * List all genome IDs for which features are available in the features DB.
     * Returns an array of genome IDs (as strings).
     */
    async listAllFeatureGenomeIds() {
      if (!featuresDb) return [];
      try {
        const stmt = featuresDb.prepare('SELECT id FROM features');
        const rows = stmt.all();
        return rows.map(row => row.id);
      } catch (err) {
        console.error('Error listing feature genome IDs:', err);
        return [];
      }
    },
    
    /**
     * List all genome IDs available in the genomes DB.
     * Returns an array of genome IDs (as strings).
     */
    async listAllGenomeIds() {
      if (!genomesDb) return [];
      try {
        const stmt = genomesDb.prepare('SELECT id FROM genomes');
        const rows = stmt.all();
        return rows.map(row => row.id);
      } catch (err) {
        console.error('Error listing genome IDs:', err);
        return [];
      }
    }
  };
}

/**
 * Get a database connection for a specific run
 * @param {string} runPath - Path to the evolution run directory
 * @returns {Object} Database API object or null if databases don't exist
 */
function getRunDB(runPath) {
  if (dbPool.has(runPath)) {
    const entry = dbPool.get(runPath);
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
    return entry.api;
  }
  
  // Check if genome and feature databases exist
  const genomesDbPath = path.join(runPath, 'genomes.sqlite');
  const featuresDbPath = path.join(runPath, 'features.sqlite');
  
  const genomesDbExists = fs.existsSync(genomesDbPath);
  const featuresDbExists = fs.existsSync(featuresDbPath);
  
  if (!genomesDbExists && !featuresDbExists) {
    return null; // Databases don't exist
  }
  
  // Open the databases in read-only mode
  const genomesDb = genomesDbExists 
    ? new Database(genomesDbPath, { readonly: true })
    : null;
  const featuresDb = featuresDbExists 
    ? new Database(featuresDbPath, { readonly: true })
    : null;
  
  // Optimize for read performance
  if (genomesDb) {
    genomesDb.pragma('journal_mode = WAL');
    genomesDb.pragma('synchronous = NORMAL');
    genomesDb.pragma('cache_size = 10000');
  }
  
  if (featuresDb) {
    featuresDb.pragma('journal_mode = WAL');
    featuresDb.pragma('synchronous = NORMAL');
    featuresDb.pragma('cache_size = 10000');
  }
  
  // Prepare statements if databases exist
  const getGenome = genomesDb ? genomesDb.prepare('SELECT data FROM genomes WHERE id = ?') : null;
  const getFeature = featuresDb ? featuresDb.prepare('SELECT data FROM features WHERE id = ?') : null;

  // Create API
  const api = makeRunDbApi({
    genomesDb,
    featuresDb,
    getGenome,
    getFeature,
    runPath
  });
  
  // Add to pool
  const timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
  dbPool.set(runPath, { 
    api, 
    genomesDb, 
    featuresDb, 
    timeout
  });
  
  console.log(`Opened database connection for ${runPath}`);
  return api;
}

/**
 * Close a database connection for a specific run
 * @param {string} runPath - Path to the evolution run directory
 */
function closeRunDB(runPath) {
  if (dbPool.has(runPath)) {
    const entry = dbPool.get(runPath);
    clearTimeout(entry.timeout);
    
    if (entry.genomesDb) entry.genomesDb.close();
    if (entry.featuresDb) entry.featuresDb.close();
    
    dbPool.delete(runPath);
    console.log(`Closed idle database connection for ${runPath}`);
  }
}

/**
 * Close all database connections
 */
function closeAllConnections() {
  for (const [runPath, entry] of dbPool.entries()) {
    clearTimeout(entry.timeout);
    
    if (entry.genomesDb) entry.genomesDb.close();
    if (entry.featuresDb) entry.featuresDb.close();
  }
  dbPool.clear();
  console.log('Closed all database connections');
}

// Clean up connections on process exit
process.on('exit', closeAllConnections);
process.on('SIGINT', () => {
  closeAllConnections();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeAllConnections();
  process.exit(0);
});

module.exports = {
  getRunDB,
  closeRunDB,
  closeAllConnections
};
