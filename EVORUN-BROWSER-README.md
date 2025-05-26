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
npm install express cors
```

## Usage

### Starting the Server

```bash
# With default configuration
node evorun-browser-server.js

# With custom configuration via environment variables
EVORUN_ROOT_DIR=/path/to/evoruns PORT=3005 DATE_GRANULARITY=week node evorun-browser-server.js
```

### Configuration

The server accepts the following configuration:
- `rootDirectory`: Root directory containing evolutionary runs
- `port`: Server port (default: 3004)
- `dateGranularity`: Date grouping granularity - 'month', 'week', or 'day' (default: 'month')

## API Endpoints

### GET /health
Returns server health status and current configuration.

### GET /config
Returns current server configuration.

### POST /config
Updates server configuration.

```json
{
  "rootDirectory": "/path/to/new/root",
  "dateGranularity": "week"
}
```

### GET /evoruns/summary
Returns evolutionary runs grouped by date and run name.

Query parameters:
- `granularity`: Override default date granularity ('month', 'week', 'day')

Response format:
```json
{
  "granularity": "month",
  "rootDirectory": "/path/to/evoruns",
  "totalRuns": 150,
  "groups": {
    "2024-01": {
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

### GET /files/*
Serves static files from within the root directory.

Example:
```
GET /files/01JVFMCCWBFWEW2AYHZ8XVEHY2_evoConf_singleMap_refSingleEmbeddings/analysisResults/lineage_step-1.json.gz
```

### GET /evoruns/:evorunPath/files
Lists files and directories within a specific evorun directory.

Query parameters:
- `subdir`: Subdirectory within the evorun to list (optional)

## Folder Name Format

The server expects evorun folders to follow this naming convention:
```
{ULID}_{evorun_name}
```

Example:
```
01JR1C0G2M1K40WFVFT3DS7SBK_evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain
```

Where:
- `01JR1C0G2M1K40WFVFT3DS7SBK` is the ULID containing timestamp information
- `evoConf_refSingleEmb_featFocusSwitchPeriodic_mfcc-statistics_pca_retrainIncr50_zScoreNSynthTrain` is the evorun name

## Testing

Run the test script to verify server functionality:

```bash
# Start the server first
node evorun-browser-server.js

# In another terminal, run tests
node test-server.js
```

## Security Considerations

- Path traversal protection prevents access to files outside the configured root directory
- All file paths are resolved and validated before serving
- No authentication is currently implemented - add as needed for production use

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
