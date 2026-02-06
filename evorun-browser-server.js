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
  rootDirectory: process.env.EVORUN_ROOT_DIR
    ||
    //'/Volumes/T7/evoruns',
    '/Users/bjornpjo/Developer/apps/synth.is/kromosynth-cli/cli-app/evoruns',
    //'/Users/bjornpjo/QD/evoruns',
  evorenderDirectory: process.env.EVORENDERS_ROOT_DIR || '/Users/bjornpjo/Developer/apps/synth.is/kromosynth-cli/cli-app/evorenders',
  syncDirectory: process.env.SYNC_ROOT_DIR || null, // Additional directory for synced evoruns from remote workers
  port: process.env.PORT || 3004,
  dateGranularity: process.env.DATE_GRANULARITY || 'month', // month, week, day
  syncApiKeys: (process.env.SYNC_API_KEYS || '').split(',').filter(Boolean),
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

// Helper function to find an evorun folder by name within the root directory (and sync directory)
async function findEvorunPath(rootDir, folderName) {
  // Directories to search: root + sync (if configured)
  const searchDirs = [rootDir];
  if (CONFIG.syncDirectory) {
    searchDirs.push(CONFIG.syncDirectory);
  }

  for (const dir of searchDirs) {
    // First try direct path (for backwards compatibility)
    const directPath = path.join(dir, folderName);
    try {
      await fs.access(directPath);
      const stats = await fs.stat(directPath);
      if (stats.isDirectory()) {
        return directPath;
      }
    } catch (error) {
      // Directory doesn't exist at direct path
    }

    // Search recursively for the folder
    const evorunFolders = await scanEvorunDirectories(dir);
    const found = evorunFolders.find(folder => folder.folderName === folderName);

    if (found) {
      return found.fullPath;
    }
  }

  return null;
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

    let evorunFolders = await scanEvorunDirectories(CONFIG.rootDirectory);

    // Also scan sync directory if configured
    if (CONFIG.syncDirectory) {
      try {
        await fs.access(CONFIG.syncDirectory);
        const syncFolders = await scanEvorunDirectories(CONFIG.syncDirectory);
        evorunFolders = evorunFolders.concat(syncFolders);
      } catch {
        // Sync directory doesn't exist yet, skip
      }
    }

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

    // First try the direct path (for backwards compatibility)
    let fullFilePath = path.join(CONFIG.rootDirectory, requestedPath);

    // Security check: ensure the path is within the root directory
    let resolvedPath = path.resolve(fullFilePath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);

    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
    }

    // Check if file exists at direct path
    let fileExists = false;
    try {
      const stats = await fs.stat(fullFilePath);
      if (stats.isFile()) {
        fileExists = true;
      }
    } catch (error) {
      // File not found at direct path, try recursive search
    }

    // If not found directly, try to find via evorun folder structure
    if (!fileExists) {
      console.log(`File not found at direct path, searching for evorun folder: ${requestedPath}`);

      // Extract the evorun folder name from the requested path
      const pathParts = requestedPath.split('/');
      const evorunFolderName = pathParts[0];

      // Check if this looks like an evorun folder (starts with ULID pattern)
      const ulidPattern = /^[0-9A-Z]{26}_/;
      if (ulidPattern.test(evorunFolderName)) {
        try {
          // Use the same fast scanning logic as the summary endpoint
          console.log(`Scanning for evorun folder: ${evorunFolderName}`);
          const evorunFolders = await scanEvorunDirectories(CONFIG.rootDirectory);
          const foundFolder = evorunFolders.find(folder => folder.folderName === evorunFolderName);

          if (foundFolder) {
            // Construct the file path within the found evorun directory
            const remainingPath = pathParts.slice(1).join('/');
            const candidateFilePath = path.join(foundFolder.fullPath, remainingPath);

            // Security check for the candidate path
            const candidateResolved = path.resolve(candidateFilePath);
            if (candidateResolved.startsWith(resolvedRoot)) {
              try {
                const stats = await fs.stat(candidateFilePath);
                if (stats.isFile()) {
                  console.log(`File found in evorun directory: ${candidateFilePath}`);
                  fullFilePath = candidateFilePath;
                  resolvedPath = candidateResolved;
                  fileExists = true;
                }
              } catch (error) {
                // File doesn't exist at this location
                console.log(`File not found at expected location: ${candidateFilePath}`);
              }
            }
          } else {
            console.log(`Evorun folder not found: ${evorunFolderName}`);
          }
        } catch (error) {
          console.warn(`Error scanning for evorun directory ${evorunFolderName}:`, error.message);
        }
      }

      // If still not found, return 404 instead of doing slow recursive search
      if (!fileExists) {
        console.log(`File not found: ${requestedPath}`);
        return res.status(404).json({ error: 'File not found' });
      }
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
    const evorunFolderName = decodeURIComponent(req.params.evorunPath);
    const subdirectory = req.query.subdir || '';

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, evorunFolderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

    const targetPath = path.join(evorunPath, subdirectory);

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
      evorunPath: evorunFolderName,
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
    const { format } = req.query; // Support format=raw for rendering service compatibility

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, folderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);

    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
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

    // Return raw genome for rendering service compatibility
    if (format === 'raw') {
      res.json(genomeData);
    } else {
      // Return wrapped format for API consistency
      res.json({
        ulid,
        folderName,
        genome: genomeData
      });
    }

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

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, folderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);

    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
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

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, folderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);

    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
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

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, folderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

    // Security check
    const resolvedPath = path.resolve(evorunPath);
    const resolvedRoot = path.resolve(CONFIG.rootDirectory);

    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied: path outside root directory' });
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

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, folderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

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

    // Find the evorun directory path
    const evorunPath = await findEvorunPath(CONFIG.rootDirectory, folderName);

    if (!evorunPath) {
      return res.status(404).json({ error: 'Evorun directory not found' });
    }

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

// ========================================
// Sync API Endpoints (for receiving data from remote workers)
// ========================================

// API key authentication middleware for sync endpoints
function syncAuth(req, res, next) {
  if (CONFIG.syncApiKeys.length === 0) {
    // No keys configured = sync endpoints disabled
    return res.status(503).json({ error: 'Sync API not configured (no API keys set)' });
  }
  const key = req.headers['x-sync-api-key'];
  if (!key || !CONFIG.syncApiKeys.includes(key)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

// Helper to get the sync base directory
function getSyncBaseDir() {
  return CONFIG.syncDirectory || CONFIG.rootDirectory;
}

// Register a new evorun on the central (creates directory structure)
app.post('/api/sync/register/:runId', syncAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    const { templateName, ecosystemVariant, startedAt } = req.body;

    const runDir = path.join(getSyncBaseDir(), runId);

    // Security check
    const resolvedPath = path.resolve(runDir);
    const resolvedRoot = path.resolve(getSyncBaseDir());
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create directory structure
    await fs.mkdir(path.join(runDir, 'analysisResults'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'generationFeatures'), { recursive: true });

    // Store metadata
    const metadata = {
      runId,
      templateName,
      ecosystemVariant,
      startedAt,
      registeredAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(runDir, 'sync-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    console.log(`Registered synced evorun: ${runId}`);
    res.status(201).json({ message: 'Run registered', runId });

  } catch (error) {
    console.error('Error registering sync run:', error);
    res.status(500).json({ error: 'Failed to register run: ' + error.message });
  }
});

// List analysis files for a run (used by worker to determine what needs uploading)
app.get('/api/sync/analysis/:runId/list', syncAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    const subdir = req.query.subdir || 'analysisResults';

    const targetDir = path.join(getSyncBaseDir(), runId, subdir);

    // Security check
    const resolvedPath = path.resolve(targetDir);
    const resolvedRoot = path.resolve(getSyncBaseDir());
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await fs.access(targetDir);
    } catch {
      return res.status(404).json({ error: 'Directory not found', files: [] });
    }

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const stats = await fs.stat(path.join(targetDir, entry.name));
        files.push({
          name: entry.name,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      }
    }

    res.json({ files });

  } catch (error) {
    console.error('Error listing sync analysis files:', error);
    res.status(500).json({ error: 'Failed to list files: ' + error.message });
  }
});

// Upload an analysis file for a run
// Accepts raw file body with filename and subdir as query parameters
app.post('/api/sync/analysis/:runId', syncAuth, express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    const { runId } = req.params;

    // Support both simple raw upload (filename in query) and multipart
    const fileName = req.query.filename;
    const subdir = req.query.subdir || 'analysisResults';

    if (!fileName) {
      // Try to parse multipart boundary from content-type
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        const result = await parseMultipartSync(req.body, contentType);
        if (result.files.length === 0) {
          return res.status(400).json({ error: 'No files found in multipart body' });
        }

        const stored = [];
        const effectiveSubdir = result.fields.subdir || subdir;
        const targetDir = path.join(getSyncBaseDir(), runId, effectiveSubdir);

        // Security check
        const resolvedTarget = path.resolve(targetDir);
        const resolvedRoot = path.resolve(getSyncBaseDir());
        if (!resolvedTarget.startsWith(resolvedRoot)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await fs.mkdir(targetDir, { recursive: true });

        for (const file of result.files) {
          const filePath = path.join(targetDir, path.basename(file.filename));
          // Security: ensure file stays within target dir
          if (!path.resolve(filePath).startsWith(resolvedTarget)) {
            continue;
          }
          await fs.writeFile(filePath, file.data);
          stored.push(file.filename);
        }

        return res.json({ stored });
      }

      return res.status(400).json({ error: 'Missing filename query parameter or multipart body' });
    }

    // Simple raw upload mode
    const targetDir = path.join(getSyncBaseDir(), runId, subdir);

    // Security checks
    const resolvedTarget = path.resolve(targetDir);
    const resolvedRoot = path.resolve(getSyncBaseDir());
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(targetDir, path.basename(fileName));
    if (!path.resolve(filePath).startsWith(resolvedTarget)) {
      return res.status(403).json({ error: 'Access denied: invalid filename' });
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(filePath, req.body);

    console.log(`Synced analysis file: ${runId}/${subdir}/${fileName} (${req.body.length} bytes)`);
    res.json({ stored: [fileName] });

  } catch (error) {
    console.error('Error uploading sync analysis file:', error);
    res.status(500).json({ error: 'Failed to upload file: ' + error.message });
  }
});

/**
 * Simple multipart form-data parser for sync uploads.
 * Handles the format produced by SyncManager._uploadAnalysisFile().
 */
function parseMultipartSync(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/);
  if (!boundaryMatch) {
    return { files: [], fields: {} };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const parts = [];
  const fields = {};

  // Split by boundary
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundary = Buffer.from(`--${boundary}--`);

  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  let pos = 0;

  while (pos < buf.length) {
    const boundaryIdx = buf.indexOf(boundaryBuffer, pos);
    if (boundaryIdx === -1) break;

    const nextBoundaryIdx = buf.indexOf(boundaryBuffer, boundaryIdx + boundaryBuffer.length + 2);
    if (nextBoundaryIdx === -1 && buf.indexOf(endBoundary, boundaryIdx + boundaryBuffer.length) === -1) break;

    const partEnd = nextBoundaryIdx !== -1 ? nextBoundaryIdx : buf.indexOf(endBoundary, boundaryIdx + boundaryBuffer.length);
    if (partEnd === -1) break;

    const partData = buf.slice(boundaryIdx + boundaryBuffer.length + 2, partEnd - 2); // strip \r\n
    const headerEndIdx = partData.indexOf('\r\n\r\n');
    if (headerEndIdx !== -1) {
      const headers = partData.slice(0, headerEndIdx).toString();
      const content = partData.slice(headerEndIdx + 4);

      const nameMatch = headers.match(/name="([^"]+)"/);
      const filenameMatch = headers.match(/filename="([^"]+)"/);

      if (filenameMatch) {
        parts.push({
          name: nameMatch ? nameMatch[1] : 'file',
          filename: filenameMatch[1],
          data: content,
        });
      } else if (nameMatch) {
        fields[nameMatch[1]] = content.toString().trim();
      }
    }

    pos = partEnd;
  }

  return { files: parts, fields };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      ...CONFIG,
      syncApiKeys: CONFIG.syncApiKeys.length > 0 ? `${CONFIG.syncApiKeys.length} key(s) configured` : 'none',
    }
  });
});

// Start the server
app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`Evorun Browser Server running on port ${CONFIG.port}`);
  console.log(`Root directory: ${CONFIG.rootDirectory}`);
  console.log(`Date granularity: ${CONFIG.dateGranularity}`);
});

module.exports = app;

/**
 * Recursively searches for a file in all subdirectories
 * @param {string} startDirectory - The root directory to start searching from
 * @param {string} relativePath - The relative path of the file to find
 * @returns {Promise<string|null>} - The full path to the file if found, null otherwise
 */
async function findFileRecursively(startDirectory, relativePath) {
  const targetFilename = path.basename(relativePath);
  const targetDirPath = path.dirname(relativePath);

  async function searchInDirectory(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      // First, check if the exact relative path exists from this directory
      const exactPath = path.join(currentDir, relativePath);
      try {
        const stats = await fs.stat(exactPath);
        if (stats.isFile()) {
          return exactPath;
        }
      } catch (error) {
        // File doesn't exist at this exact location, continue searching
      }

      // Search in subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subdirPath = path.join(currentDir, entry.name);
          const result = await searchInDirectory(subdirPath);
          if (result) {
            return result;
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Error searching in directory ${currentDir}:`, error);
      return null;
    }
  }

  return await searchInDirectory(startDirectory);
}
