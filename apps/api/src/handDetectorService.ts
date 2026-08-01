import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import jpeg from 'jpeg-js';
import { CONFIG } from './config.js';
import { HandLandmarks, FingerCounterService, HandDetectionResult } from './fingerCounterService.js';
import { CameraFrame } from './cameraService.js';

// Setup file:// fetch interceptor for Node.js so TFJS loads model topology and shards 100% offline
let isFetchInterceptorInstalled = false;
function setupOfflineFetchInterceptor() {
  if (isFetchInterceptorInstalled) return;
  isFetchInterceptorInstalled = true;

  const origFetch = globalThis.fetch;
  globalThis.fetch = async function (url: string | URL | Request, opts?: RequestInit) {
    const urlStr = String(url);
    if (urlStr.startsWith('file://')) {
      const filePath = urlStr.replace(/^file:\/\//, '');
      if (!fs.existsSync(filePath)) {
        throw new Error(`[Offline File Loader] File not found: ${filePath}`);
      }
      const data = fs.readFileSync(filePath);
      const contentType = filePath.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      return new Response(data, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': contentType },
      });
    }
    return origFetch(url, opts);
  };
}

export class HandDetectorService {
  private isInitialized: boolean = false;
  private maxHands: number = CONFIG.MAX_HANDS;
  private detector: handPoseDetection.HandDetector | null = null;
  private modelPath: string = '';

  constructor() {
    this.initModel();
  }

  private resolveModelBaseDir(): string {
    const configuredPath = CONFIG.HAND_MODEL_PATH;
    if (configuredPath.endsWith('model.json')) {
      // If user passed path to detector/model.json, resolve parent hand-pose directory
      const parentDir = path.dirname(configuredPath);
      return parentDir.endsWith('detector') ? path.dirname(parentDir) : parentDir;
    }
    return path.resolve(configuredPath);
  }

  private async initModel(): Promise<void> {
    try {
      console.log('[HandDetectorService] External model download disabled');

      const baseModelDir = this.resolveModelBaseDir();
      this.modelPath = baseModelDir;
      console.log(`[HandDetectorService] Loading offline model from: ${baseModelDir}`);

      // Validate existence of all 5 required model topology & weight shard files
      const requiredFiles = [
        path.join(baseModelDir, 'detector/model.json'),
        path.join(baseModelDir, 'detector/group1-shard1of1.bin'),
        path.join(baseModelDir, 'landmark/model.json'),
        path.join(baseModelDir, 'landmark/group1-shard1of2.bin'),
        path.join(baseModelDir, 'landmark/group1-shard2of2.bin'),
      ];

      const missingFiles = requiredFiles.filter((f) => !fs.existsSync(f));
      if (missingFiles.length > 0) {
        console.error('---------------------------------------------------------');
        console.error('[HandDetectorService] ERROR: Offline model files missing!');
        console.error('Missing required offline model file(s):');
        missingFiles.forEach((f) => console.error(`  ❌ ${f}`));
        console.error('Action Required: Run "npm run setup:models" on Mac, or copy models directory via SCP to Raspberry Pi.');
        console.error('---------------------------------------------------------');
        throw new Error(`Missing offline model files: ${missingFiles.join(', ')}`);
      }

      // Install file:// fetch interceptor before TFJS model loading
      setupOfflineFetchInterceptor();

      console.log('[HandDetectorService] Initializing TensorFlow.js CPU Backend & MediaPipe Hands Detector...');
      await tf.setBackend('cpu');
      await tf.ready();

      const detectorModelUrl = `file://${path.join(baseModelDir, 'detector/model.json')}`;
      const landmarkModelUrl = `file://${path.join(baseModelDir, 'landmark/model.json')}`;

      const model = handPoseDetection.SupportedModels.MediaPipeHands;
      const detectorConfig: handPoseDetection.MediaPipeHandsTfjsModelConfig = {
        runtime: 'tfjs',
        modelType: 'full',
        maxHands: this.maxHands,
        detectorModelUrl,
        landmarkModelUrl,
      };

      this.detector = await handPoseDetection.createDetector(model, detectorConfig);
      this.isInitialized = true;
      console.log('[HandDetectorService] Offline model initialized successfully');
      console.log(`[HandDetectorService] MediaPipe Hand Detector ready on ARM64/x86 (maxHands=${this.maxHands}).`);
    } catch (err) {
      console.error('[HandDetectorService] Fatal error initializing offline MediaPipe detector:', err);
      this.isInitialized = false;
    }
  }

  /**
   * Processes a video camera frame (JPEG Buffer), decodes pixels into RGB tensor,
   * executes MediaPipe landmark detection, and computes finger counts.
   */
  public async detect(frame: CameraFrame): Promise<HandDetectionResult> {
    const frameTimestamp = frame.timestamp || Date.now();
    const frameSeq = frame.frameSequence || 0;
    const byteSize = frame.jpegByteSize || (frame.data ? frame.data.length : 0);

    if (!this.isInitialized || !this.detector) {
      return FingerCounterService.processDetection([], {
        frameSequence: frameSeq,
        frameTimestamp,
        inferenceTimestamp: Date.now(),
        frameByteSize: byteSize,
      });
    }

    let tensor: tf.Tensor3D | null = null;
    try {
      // Decode JPEG bytes into raw RGBA pixels
      const decoded = jpeg.decode(frame.data, { tolerantDecoding: true, formatAsRGBA: true });
      if (!decoded || !decoded.data || decoded.width === 0 || decoded.height === 0) {
        throw new Error('JPEG decoding produced null or invalid pixel dimensions');
      }

      // Convert 4-channel RGBA Uint8Array to 3-channel RGB Uint8Array for TFJS
      const width = decoded.width;
      const height = decoded.height;
      const rgbData = new Uint8Array(width * height * 3);

      for (let i = 0, j = 0; i < decoded.data.length; i += 4, j += 3) {
        rgbData[j] = decoded.data[i];     // R
        rgbData[j + 1] = decoded.data[i + 1]; // G
        rgbData[j + 2] = decoded.data[i + 2]; // B
      }

      tensor = tf.tensor3d(rgbData, [height, width, 3], 'int32');
      const inferenceStart = Date.now();

      // Execute MediaPipe detector on real frame tensor
      const detected = await this.detector.estimateHands(tensor as any, { flipHorizontal: false });
      const inferenceEnd = Date.now();

      const hands: HandLandmarks[] = (detected || []).map((h) => {
        return {
          landmarks: (h.keypoints3D || h.keypoints || []).map((kp) => ({
            x: kp.x,
            y: kp.y,
            z: kp.z || 0,
          })),
          handedness: (h.handedness as string) || 'Right',
          score: h.score || 0.95,
        };
      });

      const result = FingerCounterService.processDetection(hands, {
        frameSequence: frameSeq,
        frameTimestamp,
        inferenceTimestamp: inferenceEnd,
        frameByteSize: byteSize,
      });

      // Runtime logging
      if (hands.length > 0) {
        console.log(
          `[HandDetectorService] Frame #${frameSeq} | Hands Detected: ${hands.length} | ` +
          `Handedness: ${result.handedness} | Stabilized Fingers: ${result.fingers} | ` +
          `Inference Latency: ${result.inferenceLatencyMs}ms | Frame Byte Size: ${byteSize} bytes`
        );
        console.log(
          `[HandDetectorService] Raw States: ${JSON.stringify(result.rawFingerStates)} | ` +
          `Stabilized States: ${JSON.stringify(result.stabilizedFingerStates)}`
        );
      }

      return result;
    } catch (error) {
      console.error(`[HandDetectorService] Error detecting hand on Frame #${frameSeq}:`, error);
      return FingerCounterService.processDetection([], {
        frameSequence: frameSeq,
        frameTimestamp,
        inferenceTimestamp: Date.now(),
        frameByteSize: byteSize,
      });
    } finally {
      if (tensor) {
        tensor.dispose();
      }
    }
  }
}
