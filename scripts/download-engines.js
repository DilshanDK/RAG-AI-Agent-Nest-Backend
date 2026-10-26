const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const COMMIT_HASH = '34ace0eb2704183d2c05b60b52fba5c43c13f303'; // Commit hash for Prisma 5.16.1
const DEST_DIR = path.join(__dirname, '..', '.prisma-engines');

const ENGINES = [
  {
    url: `https://binaries.prisma.sh/all_commits/${COMMIT_HASH}/windows/query_engine.dll.node.gz`,
    dest: 'query_engine-windows.dll.node'
  },
  {
    url: `https://binaries.prisma.sh/all_commits/${COMMIT_HASH}/windows/schema-engine.exe.gz`,
    dest: 'schema-engine-windows.exe'
  }
];

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

function downloadAndUnzip(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
        return;
      }

      const gunzip = zlib.createGunzip();
      const fileStream = fs.createWriteStream(destPath);

      res.pipe(gunzip).pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Successfully saved: ${destPath}`);
        resolve();
      });

      fileStream.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  try {
    for (const engine of ENGINES) {
      const destPath = path.join(DEST_DIR, engine.dest);
      await downloadAndUnzip(engine.url, destPath);
    }

    console.log('\nAll engines downloaded successfully!');
    
    // Add environment variables to .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    const queryEngineVar = `PRISMA_QUERY_ENGINE_BINARY="${path.join(DEST_DIR, 'query_engine-windows.dll.node')}"`;
    const schemaEngineVar = `PRISMA_SCHEMA_ENGINE_BINARY="${path.join(DEST_DIR, 'schema-engine-windows.exe')}"`;

    if (!envContent.includes('PRISMA_QUERY_ENGINE_BINARY')) {
      envContent += `\n# Manual Prisma Engines\n${queryEngineVar}\n${schemaEngineVar}\n`;
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('Updated .env with manual engine paths.');
    } else {
      console.log('Paths already exist in .env.');
    }

  } catch (error) {
    console.error('Error downloading engines:', error);
  }
}

run();
