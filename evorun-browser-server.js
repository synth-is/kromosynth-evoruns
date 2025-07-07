// REST server for browsing evolutionary runs with configurable root directory

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { getRunDB } = require('./evorun-db');

const app = express();
app.use(cors({ 
  origin: true 
}));

// Configuration
let CONFIG = {
  rootDirectory: process.env.EVORUN_ROOT_DIR || '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns',
  evorenderDirectory: process.env.EVORENDERS_ROOT_DIR || '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evorenders',
  port: process.env.PORT || 3004,
  dateGranularity: process.env.DATE_GRANULARITY || 'month' // month, week, day
};

// Middleware to parse JSON
app.use(express.json());

// Helper function to decode ULID timestamp
function decodeULIDTimestamp(ulid) {
  // ULID timestamp is first 10 characters (48 bits)
  const timestampPart = ulid.substring(0, 10);
  
  // Base32 decode the timestamp
  const base32Chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timestamp = 0;
  
  for (let i = 0; i < timestampPart.length; i++) {
    const char = timestampPart[i];
    const value = base32Chars.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid ULID character: ${char}`);
    }
    timestamp = timestamp * 32 + value;
  }
  
  return new Date(timestamp);
}

// Helper function to extract evorun name from folder name
function extractEvorunName(folderName) {
  // Split by underscore and remove the first part (ULID)
  const parts = folderName.split('_');
  if (parts.length < 2) {
    return folderName; // Return as-is if no underscore found
  }
  return parts.slice(1).join('_');
}

// Helper function to format date based on granularity
function formatDateByGranularity(date, granularity) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-based to 1-based
  
  switch (granularity) {
    case 'day':
      const day = date.getDate();
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    case 'week':
      // Get the ISO week number
      const startOfYear = new Date(year, 0, 1);
      const weekNumber = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
      return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    case 'month':
    default:
      return `${year}-${month.toString().padStart(2, '0')}`;
  }
}

// Helper function to scan directory recursively for evorun folders
async function scanEvorunDirectories(rootDir) {
  const evorunFolders = [];
  
  async function scanDirectory(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(currentDir, entry.name);
          
          // Check if this directory name looks like an evorun (starts with ULID)
          const ulidPattern = /^[0-9A-Z]{26}_/;
          if (ulidPattern.test(entry.name)) {
            // Skip folders with "_failed-genes" suffix
            if (!entry.name.endsWith('_failed-genes')) {
              evorunFolders.push({
                fullPath,
                folderName: entry.name,
                relativePath: path.relative(rootDir, fullPath)
              });
            }
          } else {
            // Recursively scan subdirectories
            await scanDirectory(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not scan directory ${currentDir}:`, error.message);
    }
  }
  
  await scanDirectory(rootDir);
  return evorunFolders;
}

// Helper function to validate and format render parameters
function formatRenderParams(duration, pitch, velocity) {
  // Convert to numbers and validate
  const dur = parseFloat(duration);
  const pit = parseInt(pitch);
  const vel = parseInt(velocity);
  
  if (isNaN(dur) || isNaN(pit) || isNaN(vel)) {
    throw new Error('Invalid render parameters: duration, pitch, and velocity must be numbers');
  }
  
  if (dur <= 0) {
    throw new Error('Duration must be positive');
  }
  
  if (pit < 0 || pit > 127) {
    throw new Error('Pitch must be between 0 and 127');
  }
  
  if (vel < 0 || vel > 127) {
    throw new Error('Velocity must be between 0 and 127');
  }
  
  // Format as expected in filename: duration_pitch_velocity
  return `${dur}_${pit}_${vel}`;
}

// Route to set configuration
app.post('/config', (req, res) => {
  const { rootDirectory, evorenderDirectory, dateGranularity } = req.body;
  
  if (rootDirectory) {
    CONFIG.rootDirectory = rootDirectory;
  }
  
  if (evorenderDirectory) {
    CONFIG.evorenderDirectory = evorenderDirectory;
  }
  
  if (dateGranularity && ['day', 'week', 'month'].includes(dateGranularity)) {
    CONFIG.dateGranularity = dateGranularity;
  }
  
  res.json({ 
    message: 'Configuration updated',
    config: CONFIG 
  });
});

// Route to get current configuration
app.get('/config', (req, res) => {
  res.json(CONFIG);
});

// Route to get evorun summary grouped by date and name
app.get('/evoruns/summary', async (req, res) => {
  try {
    const granularity = req.query.granularity || CONFIG.dateGranularity;
    
    if (!['day', 'week', 'month'].includes(granularity)) {
      return res.status(400).json({ 
        error: 'Invalid granularity. Must be one of: day, week, month' 
      });
    }
    
    // Check if root directory exists
    try {
      await fs.access(CONFIG.rootDirectory);
    } catch (error) {
      return res.status(404).json({ 
        error: `Root directory not found: ${CONFIG.rootDirectory}` 
      });
    }
    
    const evorunFolders = await scanEvorunDirectories(CONFIG.rootDirectory);
    
    // Group by date and then by name
    const groupedRuns = {};
    
    for (const folder of evorunFolders) {
      try {
        // Extract ULID from folder name
        const ulidMatch = folder.folderName.match(/^([0-9A-Z]{26})_/);
        if (!ulidMatch) {
          console.warn(`Could not extract ULID from folder: ${folder.folderName}`);
          continue;
        }
        
        const ulid = ulidMatch[1];
        const date = decodeULIDTimestamp(ulid);
        const dateKey = formatDateByGranularity(date, granularity);
        const evorunName = extractEvorunName(folder.folderName);
        
        // Initialize date group if not exists
        if (!groupedRuns[dateKey]) {
          groupedRuns[dateKey] = {};
        }
        
        // Initialize name group if not exists
        if (!groupedRuns[dateKey][evorunName]) {
          groupedRuns[dateKey][evorunName] = [];
        }
        
        // Add this run to the group
        groupedRuns[dateKey][evorunName].push({
          ulid,
          folderName: folder.folderName,
          relativePath: folder.relativePath,
          timestamp: date.toISOString()
        });
        
      } catch (error) {
        console.warn(`Error processing folder ${folder.folderName}:`, error.message);
      }
    }
    
    // Sort the results
    const sortedResult = {};
    const sortedDateKeys = Object.keys(groupedRuns).sort().reverse(); // Most recent first
    
    for (const dateKey of sortedDateKeys) {
      sortedResult[dateKey] = {};
      const sortedNameKeys = Object.keys(groupedRuns[dateKey]).sort();
      
      for (const nameKey of sortedNameKeys) {
        // Sort runs within each name group by timestamp (most recent first)
        sortedResult[dateKey][nameKey] = groupedRuns[dateKey][nameKey]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
    }
    
    res.json({
      granularity,
      rootDirectory: CONFIG.rootDirectory,
      totalRuns: evorunFolders.length,
      groups: sortedResult
    });
    
  } catch (error) {
    console.error('Error getting evorun summary:', error);
    res.status(500).json({ 
      error: 'Failed to get evorun summary: ' + error.message 
    });
  }
});

// Route to serve static files from evorun directories
app.get('/files/*', async (req, res) => {
  try {
    // Extract the file path from the URL
    const requestedPath = req.params[0]; // Everything after /files/
    
    if (!requestedPath) {
      return res.status(400).json({ error: 'No file path specified' });
    }
    
    // Construct the full file path
    const fullFilePath = path.join(CONFIG.rootDirectory, requestedPath);
    
    // Security check: ensure the path is within the root directory
    const resolvedPath = path.resolve(fullFilePath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Check if file exists
    try {
      await fs.access(fullFilePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if it's a file (not a directory)
    const stats = await fs.stat(fullFilePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }
    
    // Serve the file
    res.sendFile(resolvedPath);
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ 
      error: 'Failed to serve file: ' + error.message 
    });
  }
});

// Route to list files in a specific evorun directory
app.get('/evoruns/:evorunPath/files', async (req, res) => {
  try {
    const evorunPath = decodeURIComponent(req.params.evorunPath);
    const subdirectory = req.query.subdir || '';
    
    const targetPath = path.join(CONFIG.rootDirectory, evorunPath, subdirectory);
    
    // Security check
    const resolvedPath = path.resolve(targetPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    try {
      await fs.access(targetPath);
    } catch (error) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    
    const files = [];
    const directories = [];
    
    for (const entry of entries) {
      const relativePath = path.join(subdirectory, entry.name);
      
      if (entry.isDirectory()) {
        directories.push({
          name: entry.name,
          type: 'directory',
          path: relativePath
        });
      } else {
        const stats = await fs.stat(path.join(targetPath, entry.name));
        files.push({
          name: entry.name,
          type: 'file',
          path: relativePath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      }
    }
    
    res.json({
      currentPath: subdirectory,
      evorunPath,
      directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
      files: files.sort((a, b) => a.name.localeCompare(b.name))
    });
    
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ 
      error: 'Failed to list files: ' + error.message 
    });
  }
});

// Route to get genome data by ULID from SQLite database
app.get('/evoruns/:folderName/genome/:ulid', async (req, res) => {
  try {
    const { folderName, ulid } = req.params;
    
    // Construct the evorun directory path
    const evorunPath = path.join(CONFIG.rootDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Check if directory exists
    try {
      await fs.access(evorunPath);
    } catch (error) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }
    
    // Get database connection
    const db = getRunDB(evorunPath);
    if (!db || !db.hasGenomeDb) {
      return res.status(404).json({ error: 'Genome database not found for this evorun' });
    }
    
    // Retrieve genome data
    const genomeData = await db.getGenome(ulid);
    if (!genomeData) {
      return res.status(404).json({ error: `Genome not found: ${ulid}` });
    }
    
    res.json({
      ulid,
      folderName,
      genome: genomeData
    });
    
  } catch (error) {
    console.error('Error retrieving genome:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve genome: ' + error.message 
    });
  }
});

// Route to get feature data by ULID from SQLite database
app.get('/evoruns/:folderName/features/:ulid', async (req, res) => {
  try {
    const { folderName, ulid } = req.params;
    
    // Construct the evorun directory path
    const evorunPath = path.join(CONFIG.rootDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Check if directory exists
    try {
      await fs.access(evorunPath);
    } catch (error) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }
    
    // Get database connection
    const db = getRunDB(evorunPath);
    if (!db || !db.hasFeatureDb) {
      return res.status(404).json({ error: 'Features database not found for this evorun' });
    }
    
    // Retrieve feature data
    const featureData = await db.getFeature(ulid);
    if (!featureData) {
      return res.status(404).json({ error: `Features not found: ${ulid}` });
    }
    
    res.json({
      ulid,
      folderName,
      features: featureData
    });
    
  } catch (error) {
    console.error('Error retrieving features:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve features: ' + error.message 
    });
  }
});

// Route to get both genome and features data by ULID
app.get('/evoruns/:folderName/data/:ulid', async (req, res) => {
  try {
    const { folderName, ulid } = req.params;
    
    // Construct the evorun directory path
    const evorunPath = path.join(CONFIG.rootDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Check if directory exists
    try {
      await fs.access(evorunPath);
    } catch (error) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }
    
    // Get database connection
    const db = getRunDB(evorunPath);
    if (!db) {
      return res.status(404).json({ error: 'No databases found for this evorun' });
    }
    
    const result = { ulid, folderName };
    
    // Try to get genome data
    if (db.hasGenomeDb) {
      try {
        const genomeData = await db.getGenome(ulid);
        if (genomeData) {
          result.genome = genomeData;
        }
      } catch (error) {
        console.warn(`Error retrieving genome ${ulid}:`, error.message);
      }
    }
    
    // Try to get feature data
    if (db.hasFeatureDb) {
      try {
        const featureData = await db.getFeature(ulid);
        if (featureData) {
          result.features = featureData;
        }
      } catch (error) {
        console.warn(`Error retrieving features ${ulid}:`, error.message);
      }
    }
    
    // Check if we found any data
    if (!result.genome && !result.features) {
      return res.status(404).json({ error: `No data found for ULID: ${ulid}` });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve data: ' + error.message 
    });
  }
});

// Route to list available genome/feature IDs for an evorun
app.get('/evoruns/:folderName/ids', async (req, res) => {
  try {
    const { folderName } = req.params;
    const { type } = req.query; // 'genomes', 'features', or 'all' (default)
    
    // Construct the evorun directory path
    const evorunPath = path.join(CONFIG.rootDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Check if directory exists
    try {
      await fs.access(evorunPath);
    } catch (error) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }
    
    // Get database connection
    const db = getRunDB(evorunPath);
    if (!db) {
      return res.status(404).json({ error: 'No databases found for this evorun' });
    }
    
    const result = { folderName };
    
    // Get genome IDs if requested
    if (!type || type === 'all' || type === 'genomes') {
      if (db.hasGenomeDb) {
        try {
          result.genomeIds = await db.listAllGenomeIds();
        } catch (error) {
          console.warn(`Error listing genome IDs:`, error.message);
          result.genomeIds = [];
        }
      } else {
        result.genomeIds = [];
      }
    }
    
    // Get feature IDs if requested
    if (!type || type === 'all' || type === 'features') {
      if (db.hasFeatureDb) {
        try {
          result.featureIds = await db.listAllFeatureGenomeIds();
        } catch (error) {
          console.warn(`Error listing feature IDs:`, error.message);
          result.featureIds = [];
        }
      } else {
        result.featureIds = [];
      }
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error listing IDs:', error);
    res.status(500).json({ 
      error: 'Failed to list IDs: ' + error.message 
    });
  }
});

// Route to list all genome IDs from SQLite database
app.get('/evoruns/:folderName/genomes', async (req, res) => {
  try {
    const { folderName } = req.params;
    
    // Construct the evorun directory path
    const evorunPath = path.join(CONFIG.rootDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Get database connection
    const db = getRunDB(evorunPath);
    
    if (!db) {
      return res.status(404).json({ 
        error: 'No SQLite databases found for this evorun' 
      });
    }
    
    if (!db.hasGenomeDb) {
      return res.status(404).json({ 
        error: 'No genome database found for this evorun' 
      });
    }
    
    const genomeIds = await db.listAllGenomeIds();
    
    res.json({
      folderName,
      genomeIds,
      count: genomeIds.length
    });
    
  } catch (error) {
    console.error('Error listing genome IDs:', error);
    res.status(500).json({ 
      error: 'Failed to list genome IDs: ' + error.message 
    });
  }
});

// Route to list all feature IDs from SQLite database
app.get('/evoruns/:folderName/features', async (req, res) => {
  try {
    const { folderName } = req.params;
    
    // Construct the evorun directory path
    const evorunPath = path.join(CONFIG.rootDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }
    
    // Get database connection
    const db = getRunDB(evorunPath);
    
    if (!db) {
      return res.status(404).json({ 
        error: 'No SQLite databases found for this evorun' 
      });
    }
    
    if (!db.hasFeatureDb) {
      return res.status(404).json({ 
        error: 'No feature database found for this evorun' 
      });
    }
    
    const featureIds = await db.listAllFeatureGenomeIds();
    
    res.json({
      folderName,
      featureIds,
      count: featureIds.length
    });
    
  } catch (error) {
    console.error('Error listing feature IDs:', error);
    res.status(500).json({ 
      error: 'Failed to list feature IDs: ' + error.message 
    });
  }
});

// Route to serve rendered WAV files from evorenders directory
app.get('/evorenders/:folderName/:ulid/:duration/:pitch/:velocity', async (req, res) => {
  try {
    const { folderName, ulid, duration, pitch, velocity } = req.params;
    
    // Validate and format render parameters
    let renderParams;
    try {
      renderParams = formatRenderParams(duration, pitch, velocity);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Construct the WAV filename
    const wavFileName = `${ulid}-${renderParams}.wav`;
    
    // Construct the full path to the WAV file
    const wavFilePath = path.join(CONFIG.evorenderDirectory, folderName, wavFileName);
    
    // Security check: ensure the path is within the evorenders directory
    const resolvedPath = path.resolve(wavFilePath);
    const resolvedRoot = path.resolve(CONFIG.evorenderDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside evorenders directory' });
    }
    
    // Check if file exists
    try {
      await fs.access(wavFilePath);
    } catch (error) {
      return res.status(404).json({ 
        error: `Rendered WAV file not found: ${wavFileName}`,
        expectedPath: path.relative(CONFIG.evorenderDirectory, wavFilePath)
      });
    }
    
    // Check if it's a file (not a directory)
    const stats = await fs.stat(wavFilePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }
    
    // Set appropriate headers for WAV files
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="${wavFileName}"`);
    
    // Serve the WAV file
    res.sendFile(resolvedPath);
    
  } catch (error) {
    console.error('Error serving rendered WAV file:', error);
    res.status(500).json({ 
      error: 'Failed to serve rendered WAV file: ' + error.message 
    });
  }
});

// Route to list available rendered files for a specific evorun folder
app.get('/evorenders/:folderName/files', async (req, res) => {
  try {
    const { folderName } = req.params;
    
    const targetPath = path.join(CONFIG.evorenderDirectory, folderName);
    
    // Security check
    const resolvedPath = path.resolve(targetPath);
    const resolvedRoot = path.resolve(CONFIG.evorenderDirectory);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside evorenders directory' });
    }
    
    try {
      await fs.access(targetPath);
    } catch (error) {
      return res.status(404).json({ error: 'Evorender directory not found' });
    }
    
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    
    const wavFiles = [];
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.wav')) {
        const stats = await fs.stat(path.join(targetPath, entry.name));
        
        // Parse the filename to extract ULID and render parameters
        const match = entry.name.match(/^([A-Z0-9]{26})-(.+)\.wav$/);
        let parsedParams = null;
        
        if (match) {
          const [, fileUlid, paramString] = match;
          const paramParts = paramString.split('_');
          if (paramParts.length === 3) {
            parsedParams = {
              ulid: fileUlid,
              duration: parseFloat(paramParts[0]),
              pitch: parseInt(paramParts[1]),
              velocity: parseInt(paramParts[2])
            };
          }
        }
        
        wavFiles.push({
          name: entry.name,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          parameters: parsedParams
        });
      }
    }
    
    res.json({
      folderName,
      evorenderPath: targetPath,
      wavFiles: wavFiles.sort((a, b) => a.name.localeCompare(b.name)),
      count: wavFiles.length
    });
    
  } catch (error) {
    console.error('Error listing evorender files:', error);
    res.status(500).json({ 
      error: 'Failed to list evorender files: ' + error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    config: CONFIG
  });
});

// Start the server
app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`Evorun Browser Server running on port ${CONFIG.port}`);
  console.log(`Root directory: ${CONFIG.rootDirectory}`);
  console.log(`Date granularity: ${CONFIG.dateGranularity}`);
});

module.exports = app;
