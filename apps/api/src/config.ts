import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

export const CONFIG = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: parseInt(process.env.PORT || '8001', 10), // Node REST API on 8001 (Python Agent owns 8000)
  WS_PORT: parseInt(process.env.WS_PORT || '8080', 10),
  PYTHON_AGENT_URL: process.env.PYTHON_AGENT_URL || 'http://localhost:8000',
  FRAME_WIDTH: parseInt(process.env.FRAME_WIDTH || '480', 10),
  FRAME_HEIGHT: parseInt(process.env.FRAME_HEIGHT || '360', 10),
  TARGET_FPS: parseInt(process.env.TARGET_FPS || '20', 10), // >= 15 FPS required
  MAX_HANDS: parseInt(process.env.MAX_HANDS || '2', 10),
  MIN_DETECTION_CONFIDENCE: parseFloat(process.env.MIN_DETECTION_CONFIDENCE || '0.5'),
  MIN_TRACKING_CONFIDENCE: parseFloat(process.env.MIN_TRACKING_CONFIDENCE || '0.5'),
  HAND_MODEL_PATH: process.env.HAND_MODEL_PATH || path.join(process.cwd(), 'models/hand-pose'),
};
