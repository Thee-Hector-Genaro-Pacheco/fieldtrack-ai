import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.join(__dirname, '../models/hand-pose');
const detectorDir = path.join(baseDir, 'detector');
const landmarkDir = path.join(baseDir, 'landmark');

fs.mkdirSync(detectorDir, { recursive: true });
fs.mkdirSync(landmarkDir, { recursive: true });

async function downloadFile(url, dest) {
  console.log(`[Model Downloader] Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP status ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  fs.writeFileSync(dest, buffer);
  console.log(`  └─> Saved ${path.relative(process.cwd(), dest)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log('---------------------------------------------------------');
  console.log('📦 FieldTrack AI - Downloading MediaPipe Offline Hand Models');
  console.log('---------------------------------------------------------');

  // Detector model files
  await downloadFile(
    'https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/detector/full/1/model.json?tfjs-format=file',
    path.join(detectorDir, 'model.json')
  );
  await downloadFile(
    'https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/detector/full/1/group1-shard1of1.bin?tfjs-format=file',
    path.join(detectorDir, 'group1-shard1of1.bin')
  );

  // Landmark model files
  await downloadFile(
    'https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/landmark/full/1/model.json?tfjs-format=file',
    path.join(landmarkDir, 'model.json')
  );
  await downloadFile(
    'https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/landmark/full/1/group1-shard1of2.bin?tfjs-format=file',
    path.join(landmarkDir, 'group1-shard1of2.bin')
  );
  await downloadFile(
    'https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/landmark/full/1/group1-shard2of2.bin?tfjs-format=file',
    path.join(landmarkDir, 'group1-shard2of2.bin')
  );

  console.log('---------------------------------------------------------');
  console.log('✅ All 5 model files downloaded successfully!');
  console.log(`   Model directory: ${baseDir}`);
  console.log('---------------------------------------------------------');
}

main().catch((err) => {
  console.error('[Model Downloader] Error:', err);
  process.exit(1);
});
