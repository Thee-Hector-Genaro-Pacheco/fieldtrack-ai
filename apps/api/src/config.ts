import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '8000', 10),
  WS_PORT: parseInt(process.env.WS_PORT || '8080', 10),
  CAMERA_DEVICE: process.env.CAMERA_DEVICE || '/dev/video0',
  FRAME_WIDTH: parseInt(process.env.FRAME_WIDTH || '480', 10),
  FRAME_HEIGHT: parseInt(process.env.FRAME_HEIGHT || '360', 10),
  TARGET_FPS: parseInt(process.env.TARGET_FPS || '20', 10), // >= 15 FPS required
  MAX_HANDS: parseInt(process.env.MAX_HANDS || '2', 10),
  MIN_DETECTION_CONFIDENCE: parseFloat(process.env.MIN_DETECTION_CONFIDENCE || '0.5'),
  MIN_TRACKING_CONFIDENCE: parseFloat(process.env.MIN_TRACKING_CONFIDENCE || '0.5'),
  STREAM_URL: process.env.STREAM_URL || 'http://localhost:8000/stream',
};
