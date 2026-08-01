export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export interface HandDetail {
  handedness: 'Left' | 'Right';
  fingers: number;
  fingerStates: FingerState;
  confidence: number;
}

export interface HandDetectionPayload {
  handDetected: boolean;
  fingers: number;
  confidence: number;
  timestamp?: number;
  fps?: number;
  details?: {
    handCount: number;
    perHand: HandDetail[];
  };
}

export interface UseHandDetectionOptions {
  wsUrl?: string;
  reconnectInterval?: number;
}
