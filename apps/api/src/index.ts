import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { CameraService } from './cameraService.js';
import { HandDetectorService } from './handDetectorService.js';
import { HandCountWebSocketServer } from './websocketServer.js';

import { getNetworkAddresses } from './utils/network.js';

async function main() {
  console.log('---------------------------------------------------------');
  console.log('🚀 FieldTrack AI - Real-time Hand & Finger Counter API');
  console.log('---------------------------------------------------------');

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Services Initialization
  const cameraService = new CameraService();
  const handDetector = new HandDetectorService();
  const wsServer = new HandCountWebSocketServer();

  // Express HTTP Routes
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      uptime: process.uptime(),
      wsPort: CONFIG.WS_PORT,
      fps: Number(cameraService.getActualFps().toFixed(1)),
      clients: wsServer.getConnectedClientCount(),
      timestamp: Date.now(),
    });
  });

  app.get('/config', (req, res) => {
    res.json(CONFIG);
  });

  // Launch HTTP & WS servers
  const server = app.listen(CONFIG.PORT, CONFIG.HOST, () => {
    const addr = server.address();
    const boundStr = typeof addr === 'string' ? addr : `${addr?.address}:${addr?.port}`;
    const networkIps = getNetworkAddresses();
    console.log(`[HTTP Server] REST API bound to interface: ${boundStr}`);
    console.log(`[HTTP Server] Listening locally at http://${CONFIG.HOST}:${CONFIG.PORT}`);
    networkIps.forEach((ip) => {
      console.log(`[HTTP Server] Accessible on network: http://${ip}:${CONFIG.PORT}`);
    });
  });

  wsServer.start();

  // Wire Camera Frame Pipeline -> MediaPipe Detection -> WS Broadcast
  let isProcessing = false;
  cameraService.on('frame', async (frame) => {
    if (isProcessing) return; // Drop stale frame if previous inference cycle is active
    isProcessing = true;
    try {
      const detectionResult = await handDetector.detect(frame);
      const actualFps = cameraService.getActualFps();
      wsServer.broadcast(detectionResult, actualFps);
    } catch (err) {
      console.error('[Pipeline] Error processing frame:', err);
    } finally {
      isProcessing = false;
    }
  });

  // Start Camera Acquisition
  await cameraService.start();

  // Graceful Shutdown Handlers
  const shutdown = () => {
    console.log('\n[System] Graceful shutdown initiated...');
    cameraService.stop();
    wsServer.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[System] Fatal error starting server:', err);
  process.exit(1);
});
