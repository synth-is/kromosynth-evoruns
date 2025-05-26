// REST server for browsing evolutionary runs with configurable root directory

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const app = express();
app.use(cors({ 
  origin: true 
}));

// Configuration
let CONFIG = {
  rootDirectory: process.env.EVORUN_ROOT_DIR || '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns',
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

// Route to set configuration
app.post('/config', (req, res) => {
  const { rootDirectory, dateGranularity } = req.body;
  
  if (rootDirectory) {
    CONFIG.rootDirectory = rootDirectory;
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    config: CONFIG
  });
});

// Start the server
app.listen(CONFIG.port, () => {
  console.log(`Evorun Browser Server running on port ${CONFIG.port}`);
  console.log(`Root directory: ${CONFIG.rootDirectory}`);
  console.log(`Date granularity: ${CONFIG.dateGranularity}`);
});

module.exports = app;
