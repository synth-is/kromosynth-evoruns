# Evorun Browser Server

A REST server for browsing evolutionary runs with configurable root directory and flexible organization.

## Features

- **Configurable Root Directory**: Set the root directory containing evolutionary runs via configuration
- **Recursive Directory Scanning**: Automatically finds evorun folders in subdirectories
- **ULID-based Dating**: Extracts timestamps from ULID prefixes in folder names
- **Flexible Grouping**: Groups evoruns by date (month/week/day) and run name
- **Static File Serving**: Serves files from within evorun directories
- **Security**: Path traversal protection for file serving

## Installation

```bash
npm install express cors better-sqlite3
```

**Dependencies:**
- `express`: Web server framework
- `cors`: Cross-origin resource sharing support
- `better-sqlite3`: High-performance SQLite database access

## Server Configuration

### Starting the Server

```bash
# With default configuration
node evorun-browser-server.js

# With custom configuration via environment variables
EVORUN_ROOT_DIR=/path/to/evoruns PORT=3005 DATE_GRANULARITY=week node evorun-browser-server.js
```

### Configuration Options

The server accepts the following configuration:
- `rootDirectory`: Root directory containing evolutionary runs
- `port`: Server port (default: 3004)
- `dateGranularity`: Date grouping granularity - 'month', 'week', or 'day' (default: 'month')

### Runtime Configuration Updates

Configuration can be updated at runtime using the `/config` endpoint:

```bash
curl -X POST http://localhost:3004/config \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory": "/new/path", "dateGranularity": "week"}'
```

## Folder Name Format

The server expects evorun folders to follow this naming convention:
```
{ULID}_{evorun_name}
```

**Example:**
```
01JR1C0G2M1K40WFVFT3DS7SBK_evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain
```

**Components:**
- `01JR1C0G2M1K40WFVFT3DS7SBK`: ULID containing timestamp information
- `evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain`: Evorun name

**Notes:**
- Folders ending with `_failed-genes` are automatically excluded from discovery
- ULIDs must be 26 characters long and follow the standard ULID format
- The underscore separator between ULID and name is required

## Usage Examples

### JavaScript/Node.js Client

```javascript
const axios = require('axios');
const baseURL = 'http://localhost:3004';

// Get all evolutionary runs summary
async function getEvorunSummary() {
  const response = await axios.get(`${baseURL}/evoruns/summary?granularity=week`);
  console.log(`Found ${response.data.totalRuns} total runs`);
  return response.data;
}

// Get genome data for a specific ULID
async function getGenomeData(folderName, ulid) {
  try {
    const response = await axios.get(`${baseURL}/evoruns/${folderName}/genome/${ulid}`);
    return response.data.genome;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('Genome not found');
      return null;
    }
    throw error;
  }
}

// List files in an evorun directory
async function listEvorunFiles(folderName, subdir = '') {
  const url = `${baseURL}/evoruns/${folderName}/files`;
  const params = subdir ? { subdir } : {};
  const response = await axios.get(url, { params });
  return response.data;
}

// Get both genome and features data
async function getCombinedData(folderName, ulid) {
  const response = await axios.get(`${baseURL}/evoruns/${folderName}/data/${ulid}`);
  return response.data;
}
```

### Python Client

```python
import requests
import json

class EvorunClient:
    def __init__(self, base_url='http://localhost:3004'):
        self.base_url = base_url
    
    def get_summary(self, granularity='month'):
        response = requests.get(f'{self.base_url}/evoruns/summary', 
                              params={'granularity': granularity})
        response.raise_for_status()
        return response.json()
    
    def get_genome(self, folder_name, ulid):
        response = requests.get(f'{self.base_url}/evoruns/{folder_name}/genome/{ulid}')
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()['genome']
    
    def get_features(self, folder_name, ulid):
        response = requests.get(f'{self.base_url}/evoruns/{folder_name}/features/{ulid}')
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()['features']
    
    def list_genome_ids(self, folder_name):
        response = requests.get(f'{self.base_url}/evoruns/{folder_name}/genomes')
        response.raise_for_status()
        return response.json()['genomeIds']

# Usage example
client = EvorunClient()
summary = client.get_summary(granularity='week')
print(f"Found {summary['totalRuns']} evolutionary runs")

# Get data for the first run found
if summary['groups']:
    first_date = list(summary['groups'].keys())[0]
    first_run_type = list(summary['groups'][first_date].keys())[0]
    first_run = summary['groups'][first_date][first_run_type][0]
    folder_name = first_run['folderName']
    
    # List available genome IDs
    genome_ids = client.list_genome_ids(folder_name)
    print(f"Found {len(genome_ids)} genomes in {folder_name}")
    
    # Get data for the first genome
    if genome_ids:
        genome_data = client.get_genome(folder_name, genome_ids[0])
        features_data = client.get_features(folder_name, genome_ids[0])
        print(f"Retrieved data for genome {genome_ids[0]}")
```

### cURL Examples

```bash
# Get server health and configuration
curl http://localhost:3004/health

# Get evolutionary runs summary with weekly granularity
curl "http://localhost:3004/evoruns/summary?granularity=week"

# Update server configuration
curl -X POST http://localhost:3004/config \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory": "/new/path/to/evoruns", "dateGranularity": "day"}'

# List files in an evorun directory
curl "http://localhost:3004/evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/files"

# Get genome data for a specific ULID
curl "http://localhost:3004/evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/genome/01JVFMCEH3A5XB8Q2N7R9KSTEZ"

# Get combined genome and features data
curl "http://localhost:3004/evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/data/01JVFMCEH3A5XB8Q2N7R9KSTEZ"

# Download a specific file
curl "http://localhost:3004/files/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/config.json" \
  -o downloaded_config.json

# List available genome IDs
curl "http://localhost:3004/evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/genomes"
```

## API Endpoints

### Server Management

#### GET /health
Returns server health status and current configuration.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-05-27T10:30:45.123Z",
  "config": {
    "rootDirectory": "/path/to/evoruns",
    "port": 3004,
    "dateGranularity": "month"
  }
}
```

#### GET /config
Returns current server configuration.

**Response:**
```json
{
  "rootDirectory": "/path/to/evoruns",
  "port": 3004,
  "dateGranularity": "month"
}
```

#### POST /config
Updates server configuration.

**Request Body:**
```json
{
  "rootDirectory": "/path/to/new/root",
  "dateGranularity": "week"
}
```

**Response:**
```json
{
  "message": "Configuration updated",
  "config": {
    "rootDirectory": "/path/to/new/root",
    "port": 3004,
    "dateGranularity": "week"
  }
}
```

### Evorun Discovery

#### GET /evoruns/summary
Returns evolutionary runs grouped by date and run name.

**Query Parameters:**
- `granularity`: Override default date granularity ('month', 'week', 'day')

**Example Request:**
```
GET /evoruns/summary?granularity=week
```

**Response:**
```json
{
  "granularity": "week",
  "rootDirectory": "/path/to/evoruns",
  "totalRuns": 150,
  "groups": {
    "2024-W03": {
      "evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain": [
        {
          "ulid": "01JR1C0G2M1K40WFVFT3DS7SBK",
          "folderName": "01JR1C0G2M1K40WFVFT3DS7SBK_evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain",
          "relativePath": "subdir1/01JR1C0G2M1K40WFVFT3DS7SBK_evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain",
          "timestamp": "2024-01-15T10:30:45.123Z"
        }
      ]
    }
  }
}
```

### File System Operations

#### GET /files/*
Serves static files from within the root directory.

**Example Requests:**
```
GET /files/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/analysisResults/lineage_step-1.json.gz
GET /files/01ABC123DEF456_my_evorun/config.json
GET /files/category1/01XYZ789_another_run/output.wav
```

**Response:** File content with appropriate MIME type

#### GET /evoruns/:evorunPath/files
Lists files and directories within a specific evorun directory.

**Path Parameters:**
- `evorunPath`: The folder name of the evorun (URL-encoded if necessary)

**Query Parameters:**
- `subdir`: Subdirectory within the evorun to list (optional)

**Example Requests:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/files
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/files?subdir=analysisResults
```

**Response:**
```json
{
  "currentPath": "analysisResults",
  "evorunPath": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "directories": [
    {
      "name": "models",
      "type": "directory",
      "path": "analysisResults/models"
    }
  ],
  "files": [
    {
      "name": "lineage_step-1.json.gz",
      "type": "file",
      "path": "analysisResults/lineage_step-1.json.gz",
      "size": 2048576,
      "modified": "2024-01-15T10:30:45.123Z"
    }
  ]
}
```

### SQLite Database Access

#### GET /evoruns/:folderName/genome/:ulid
Retrieves genome data for a specific ULID from the SQLite genomes database.

**Path Parameters:**
- `folderName`: The folder name of the evorun
- `ulid`: The ULID of the genome to retrieve

**Example Request:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/genome/01JVFMCEH3A5XB8Q2N7R9KSTEZ
```

**Response:**
```json
{
  "ulid": "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
  "folderName": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "genome": {
    "nodes": [...],
    "connections": [...],
    "parameters": {...}
  }
}
```

#### GET /evoruns/:folderName/features/:ulid
Retrieves feature data for a specific ULID from the SQLite features database.

**Path Parameters:**
- `folderName`: The folder name of the evorun
- `ulid`: The ULID of the features to retrieve

**Example Request:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/features/01JVFMCEH3A5XB8Q2N7R9KSTEZ
```

**Response:**
```json
{
  "ulid": "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
  "folderName": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "features": {
    "audioFeatures": [...],
    "descriptors": {...},
    "embeddings": [...]
  }
}
```

#### GET /evoruns/:folderName/data/:ulid
Retrieves both genome and feature data for a specific ULID (combined endpoint).

**Path Parameters:**
- `folderName`: The folder name of the evorun
- `ulid`: The ULID of the data to retrieve

**Example Request:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/data/01JVFMCEH3A5XB8Q2N7R9KSTEZ
```

**Response:**
```json
{
  "ulid": "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
  "folderName": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "genome": {
    "nodes": [...],
    "connections": [...],
    "parameters": {...}
  },
  "features": {
    "audioFeatures": [...],
    "descriptors": {...},
    "embeddings": [...]
  }
}
```

#### GET /evoruns/:folderName/ids
Lists available genome and/or feature IDs for an evorun.

**Path Parameters:**
- `folderName`: The folder name of the evorun

**Query Parameters:**
- `type`: Filter by data type ('genomes', 'features', or 'all' - default: 'all')

**Example Requests:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/ids
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/ids?type=genomes
```

**Response:**
```json
{
  "folderName": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "genomeIds": [
    "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
    "01JVFMCF2K8X9P5Q3M7R2JSTGH",
    "01JVFMCG4L9Y1Q6R4N8S3KTUHI"
  ],
  "featureIds": [
    "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
    "01JVFMCF2K8X9P5Q3M7R2JSTGH"
  ]
}
```

#### GET /evoruns/:folderName/genomes
Lists all genome IDs from the SQLite genomes database.

**Path Parameters:**
- `folderName`: The folder name of the evorun

**Example Request:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/genomes
```

**Response:**
```json
{
  "folderName": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "genomeIds": [
    "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
    "01JVFMCF2K8X9P5Q3M7R2JSTGH",
    "01JVFMCG4L9Y1Q6R4N8S3KTUHI"
  ],
  "count": 3
}
```

#### GET /evoruns/:folderName/features
Lists all feature IDs from the SQLite features database.

**Path Parameters:**
- `folderName`: The folder name of the evorun

**Example Request:**
```
GET /evoruns/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/features
```

**Response:**
```json
{
  "folderName": "01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings",
  "featureIds": [
    "01JVFMCEH3A5XB8Q2N7R9KSTEZ",
    "01JVFMCF2K8X9P5Q3M7R2JSTGH"
  ],
  "count": 2
}
```

## Database Features

The server automatically detects and provides access to SQLite databases within evorun directories:

- **genomes.sqlite**: Contains compressed genome data for each evolutionary individual
- **features.sqlite**: Contains compressed audio feature data for each genome

### Data Decompression

The server handles multiple layers of compression:
1. **Automatic GZIP decompression** of stored data
2. **Buffer reconstruction** for serialized Buffer objects
3. **Double-compression detection** and handling for legacy data

### Database Connection Pool

- Databases are automatically opened when first accessed
- Connection pooling with 30-minute timeout for optimal performance
- Graceful error handling for missing or corrupted databases

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": "Description of the error"
}
```

### Common HTTP Status Codes

- **200**: Success
- **400**: Bad Request (invalid parameters)
- **403**: Forbidden (path outside root directory)
- **404**: Not Found (file, directory, or data not found)
- **500**: Internal Server Error

### Example Error Responses

**File not found:**
```json
{
  "error": "File not found"
}
```

**Access denied:**
```json
{
  "error": "Access denied: path outside root directory"
}
```

**Database not found:**
```json
{
  "error": "No genome database found for this evorun"
}
```

**Invalid granularity:**
```json
{
  "error": "Invalid granularity. Must be one of: day, week, month"
}
```

## Testing

Run the test script to verify server functionality:

```bash
# Start the server first
node evorun-browser-server.js

# In another terminal, run tests
node test-server.js

# Test specific SQLite endpoints
node test-sqlite-endpoints.js
```

### Manual Testing

You can also manually test endpoints using curl or a tool like Postman:

```bash
# Test server health
curl http://localhost:3004/health

# Test evorun discovery
curl http://localhost:3004/evoruns/summary

# Test database access (replace with actual folder/ULID)
curl http://localhost:3004/evoruns/YOUR_FOLDER_NAME/genomes
```

## Performance Considerations

### Database Connection Pool
- SQLite databases are cached for 30 minutes after last access
- Multiple concurrent requests to the same database share connections
- Automatic cleanup prevents memory leaks

### File Serving
- Static files are served directly by Express for optimal performance
- Path resolution and security checks are cached
- GZIP compression is handled automatically by Express

### Memory Usage
- Decompressed data is not cached to avoid memory bloat
- Each request decompresses data fresh from SQLite
- Database connections pool to balance performance and memory

### Recommended Limits
- Concurrent database connections: ~10 per evorun directory
- Maximum file size served: Limited by available memory
- Request timeout: 30 seconds for complex database queries

## Security Considerations

- **Path traversal protection** prevents access to files outside the configured root directory
- All file paths are resolved and validated before serving
- SQLite databases are opened in read-only mode
- **No authentication** is currently implemented - add as needed for production use
- CORS is enabled for all origins (configure appropriately for production)

### Production Deployment

For production use, consider:

1. **Add authentication middleware**
2. **Configure CORS for specific origins**
3. **Use HTTPS/TLS encryption**
4. **Implement rate limiting**
5. **Add request logging**
6. **Set up monitoring and alerting**

## Directory Structure

The server can handle nested directory structures:

```
root_directory/
├── category1/
│   ├── 01ABC123...._run_name_1/
│   └── 01DEF456...._run_name_2/
├── category2/
│   └── subcategory/
│       └── 01GHI789...._run_name_3/
└── 01JKL012...._run_name_4/
```

All evorun folders will be found regardless of their depth in the directory structure.
