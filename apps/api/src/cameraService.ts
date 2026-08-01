import { EventEmitter } from 'events';
import http from 'http';
import { CONFIG } from './config.js';

export interface CameraFrame {
  data: Buffer;
  jpegByteSize: number;
  frameSequence: number;
  timestamp: number;
  width: number;
  height: number;
}

export class CameraService extends EventEmitter {
  private isRunning: boolean = false;
  private sequenceCounter: number = 0;
  private frameCount: number = 0;
  private lastFpsCalcTime: number = Date.now();
  private actualFps: number = 0;
  private activeRequest: http.ClientRequest | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private width: number = CONFIG.FRAME_WIDTH;
  private height: number = CONFIG.FRAME_HEIGHT;

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `[CameraService] Consuming live MJPEG video stream from Python Pi Agent (${CONFIG.PYTHON_AGENT_URL}/camera/stream)...`
    );

    this.connectStream();
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.activeRequest) {
      this.activeRequest.destroy();
      this.activeRequest = null;
    }

    console.log('[CameraService] MJPEG video stream acquisition stopped.');
  }

  public getActualFps(): number {
    return this.actualFps;
  }

  private connectStream(): void {
    if (!this.isRunning) return;

    const streamUrl = `${CONFIG.PYTHON_AGENT_URL}/camera/stream`;
    
    this.activeRequest = http.get(streamUrl, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[CameraService] Stream request failed with HTTP ${res.statusCode}. Retrying in 2s...`);
        res.resume();
        this.scheduleReconnect();
        return;
      }

      console.log(`[CameraService] Successfully connected to MJPEG stream (${CONFIG.PYTHON_AGENT_URL}/camera/stream).`);
      
      let chunkBuffer = Buffer.alloc(0);

      res.on('data', (chunk: Buffer) => {
        if (!this.isRunning) return;

        chunkBuffer = Buffer.concat([chunkBuffer, chunk]);

        // Extract complete JPEG frames using SOI (0xFFD8) and EOI (0xFFD9) markers
        while (chunkBuffer.length >= 4) {
          const startIndex = chunkBuffer.indexOf(Buffer.from([0xff, 0xd8]));
          if (startIndex === -1) {
            // No start marker found, trim trailing incomplete bytes if buffer gets too large
            if (chunkBuffer.length > 500000) {
              chunkBuffer = chunkBuffer.subarray(chunkBuffer.length - 10000);
            }
            break;
          }

          const endIndex = chunkBuffer.indexOf(Buffer.from([0xff, 0xd9]), startIndex + 2);
          if (endIndex === -1) {
            // Start found but incomplete frame, wait for more chunks
            if (startIndex > 0) {
              chunkBuffer = chunkBuffer.subarray(startIndex);
            }
            break;
          }

          // Extract single complete JPEG image buffer
          const jpegFrameBytes = chunkBuffer.subarray(startIndex, endIndex + 2);
          chunkBuffer = chunkBuffer.subarray(endIndex + 2);

          this.processExtractedJpeg(jpegFrameBytes);
        }
      });

      res.on('end', () => {
        console.warn('[CameraService] MJPEG stream ended. Scheduling reconnection...');
        this.scheduleReconnect();
      });

      res.on('error', (err) => {
        console.error('[CameraService] Stream response error:', err.message);
        this.scheduleReconnect();
      });
    });

    this.activeRequest.on('error', (err) => {
      console.error(`[CameraService] Could not connect to Python Agent (${streamUrl}):`, err.message);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.isRunning || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isRunning) {
        console.log('[CameraService] Attempting to reconnect to MJPEG camera stream...');
        this.connectStream();
      }
    }, 2000);
  }

  private processExtractedJpeg(jpegBytes: Buffer): void {
    const now = Date.now();
    this.sequenceCounter++;
    this.frameCount++;

    if (now - this.lastFpsCalcTime >= 1000) {
      this.actualFps = (this.frameCount * 1000) / (now - this.lastFpsCalcTime);
      this.frameCount = 0;
      this.lastFpsCalcTime = now;
    }

    const frame: CameraFrame = {
      data: jpegBytes,
      jpegByteSize: jpegBytes.length,
      frameSequence: this.sequenceCounter,
      timestamp: now,
      width: this.width,
      height: this.height,
    };

    this.emit('frame', frame);
  }
}
