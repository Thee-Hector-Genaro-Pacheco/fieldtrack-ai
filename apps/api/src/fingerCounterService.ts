export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandLandmarks {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right' | string;
  score: number;
}

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export interface HandDetectionResult {
  handDetected: boolean;
  fingers: number;
  confidence: number;
  handedness?: 'Left' | 'Right' | string;
  rawFingerStates?: FingerState;
  stabilizedFingerStates?: FingerState;
  frameSequence?: number;
  frameAgeMs?: number;
  inferenceLatencyMs?: number;
  frameByteSize?: number;
  details?: {
    handCount: number;
    perHand: Array<{
      handedness: 'Left' | 'Right' | string;
      fingers: number;
      fingerStates: FingerState;
      confidence: number;
    }>;
  };
}

export class FingerCounterService {
  private static history: FingerState[] = [];
  private static readonly WINDOW_SIZE = 5;
  private static consecutiveNoHandFrames = 0;
  private static lastStabilizedStates: FingerState = {
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
  };
  private static lastHandedness: 'Left' | 'Right' | string = 'Right';

  /**
   * Resets temporal stabilization state (used for testing or clean restarts)
   */
  public static resetStabilizer(): void {
    this.history = [];
    this.consecutiveNoHandFrames = 0;
    this.lastStabilizedStates = {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    };
    this.lastHandedness = 'Right';
  }

  /**
   * Calculates 3D Euclidean distance between two landmark points
   */
  public static distance(p1: Landmark, p2: Landmark): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Computes the 3D joint angle in degrees at vertex point p2 formed by p1 -> p2 -> p3.
   * A straight joint returns 180 degrees; a right-angle bent joint returns 90 degrees.
   */
  public static computeAngle(p1: Landmark, p2: Landmark, p3: Landmark): number {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: (p1.z || 0) - (p2.z || 0) };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: (p3.z || 0) - (p2.z || 0) };

    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    if (mag1 === 0 || mag2 === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  }

  /**
   * Evaluates finger extension states using 3D joint angles, wrist distance ratios,
   * and handedness-aware thumb geometry.
   *
   * Landmark Index Map:
   * 0: Wrist
   * 1: Thumb CMC | 2: Thumb MCP | 3: Thumb IP | 4: Thumb TIP
   * 5: Index MCP | 6: Index PIP | 7: Index DIP | 8: Index TIP
   * 9: Middle MCP | 10: Middle PIP | 11: Middle DIP | 12: Middle TIP
   * 13: Ring MCP | 14: Ring PIP | 15: Ring DIP | 16: Ring TIP
   * 17: Pinky MCP | 18: Pinky PIP | 19: Pinky DIP | 20: Pinky TIP
   */
  public static evaluateHand(hand: HandLandmarks): { count: number; states: FingerState } {
    const lm = hand.landmarks;
    if (!lm || lm.length < 21) {
      return {
        count: 0,
        states: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      };
    }

    const wrist = lm[0];
    const handedness = hand.handedness || 'Right';

    // 1. Index Finger (MCP: 5, PIP: 6, DIP: 7, TIP: 8)
    const indexPipAngle = this.computeAngle(lm[5], lm[6], lm[7]);
    const indexDipAngle = this.computeAngle(lm[6], lm[7], lm[8]);
    const isIndexExtended =
      indexPipAngle >= 140 &&
      indexDipAngle >= 135 &&
      this.distance(lm[8], wrist) > this.distance(lm[6], wrist) * 1.05;

    // 2. Middle Finger (MCP: 9, PIP: 10, DIP: 11, TIP: 12)
    const middlePipAngle = this.computeAngle(lm[9], lm[10], lm[11]);
    const middleDipAngle = this.computeAngle(lm[10], lm[11], lm[12]);
    const isMiddleExtended =
      middlePipAngle >= 140 &&
      middleDipAngle >= 135 &&
      this.distance(lm[12], wrist) > this.distance(lm[10], wrist) * 1.05;

    // 3. Ring Finger (MCP: 13, PIP: 14, DIP: 15, TIP: 16)
    const ringPipAngle = this.computeAngle(lm[13], lm[14], lm[15]);
    const ringDipAngle = this.computeAngle(lm[14], lm[15], lm[16]);
    const isRingExtended =
      ringPipAngle >= 140 &&
      ringDipAngle >= 135 &&
      this.distance(lm[16], wrist) > this.distance(lm[14], wrist) * 1.05;

    // 4. Pinky Finger (MCP: 17, PIP: 18, DIP: 19, TIP: 20)
    const pinkyPipAngle = this.computeAngle(lm[17], lm[18], lm[19]);
    const pinkyDipAngle = this.computeAngle(lm[18], lm[19], lm[20]);
    const isPinkyExtended =
      pinkyPipAngle >= 140 &&
      pinkyDipAngle >= 135 &&
      this.distance(lm[20], wrist) > this.distance(lm[18], wrist) * 1.05;

    // 5. Thumb (CMC: 1, MCP: 2, IP: 3, TIP: 4)
    // Evaluate IP & MCP angles and Tip-to-PinkyMCP distance ratio
    const thumbIpAngle = this.computeAngle(lm[2], lm[3], lm[4]);
    const thumbMcpAngle = this.computeAngle(lm[1], lm[2], lm[3]);
    const pinkyMcp = lm[17];
    const thumbPinkyDistRatio = this.distance(lm[4], pinkyMcp) / (this.distance(lm[3], pinkyMcp) || 0.001);

    // Handedness lateral direction check
    let isThumbLateralOutward = false;
    if (handedness === 'Right') {
      // Right hand thumb extends towards negative X relative to palm center/MCPs
      isThumbLateralOutward = lm[4].x < lm[2].x || lm[4].x < lm[5].x + 0.02;
    } else {
      // Left hand thumb extends towards positive X relative to palm center/MCPs
      isThumbLateralOutward = lm[4].x > lm[2].x || lm[4].x > lm[5].x - 0.02;
    }

    const isThumbExtended =
      thumbIpAngle >= 130 &&
      thumbMcpAngle >= 125 &&
      thumbPinkyDistRatio > 1.08 &&
      isThumbLateralOutward;

    const states: FingerState = {
      thumb: isThumbExtended,
      index: isIndexExtended,
      middle: isMiddleExtended,
      ring: isRingExtended,
      pinky: isPinkyExtended,
    };

    const count =
      (isThumbExtended ? 1 : 0) +
      (isIndexExtended ? 1 : 0) +
      (isMiddleExtended ? 1 : 0) +
      (isRingExtended ? 1 : 0) +
      (isPinkyExtended ? 1 : 0);

    return { count, states };
  }

  /**
   * Processes landmark detections, applies temporal stabilization, and constructs
   * full API WebSocket result payload.
   */
  public static processDetection(
    hands: HandLandmarks[],
    metadata?: {
      frameSequence?: number;
      frameTimestamp?: number;
      inferenceTimestamp?: number;
      frameByteSize?: number;
    }
  ): HandDetectionResult {
    const now = Date.now();
    const frameSeq = metadata?.frameSequence || 0;
    const frameTs = metadata?.frameTimestamp || now;
    const inferTs = metadata?.inferenceTimestamp || now;
    const frameAgeMs = Math.max(0, now - frameTs);
    const inferenceLatencyMs = Math.max(0, inferTs - frameTs);
    const byteSize = metadata?.frameByteSize || 0;

    if (!hands || hands.length === 0) {
      this.consecutiveNoHandFrames++;

      // Require 3 consecutive no-hand frames before clearing detection state
      if (this.consecutiveNoHandFrames >= 3) {
        this.history = [];
        this.lastStabilizedStates = {
          thumb: false,
          index: false,
          middle: false,
          ring: false,
          pinky: false,
        };
        return {
          handDetected: false,
          fingers: 0,
          confidence: 0.0,
          handedness: this.lastHandedness,
          rawFingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
          stabilizedFingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
          frameSequence: frameSeq,
          frameAgeMs,
          inferenceLatencyMs,
          frameByteSize: byteSize,
        };
      }

      // Maintain previous stabilized state during brief 1-2 frame detection drops
      const stabilizedCount = Object.values(this.lastStabilizedStates).filter(Boolean).length;
      return {
        handDetected: stabilizedCount > 0,
        fingers: stabilizedCount,
        confidence: 0.0,
        handedness: this.lastHandedness,
        rawFingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
        stabilizedFingerStates: this.lastStabilizedStates,
        frameSequence: frameSeq,
        frameAgeMs,
        inferenceLatencyMs,
        frameByteSize: byteSize,
      };
    }

    // Reset no-hand frame counter when hands are detected
    this.consecutiveNoHandFrames = 0;

    let totalRawFingers = 0;
    let sumConfidence = 0;
    const perHandDetails = [];
    let primaryRawStates: FingerState = { thumb: false, index: false, middle: false, ring: false, pinky: false };
    let primaryHandedness: 'Left' | 'Right' | string = hands[0].handedness || 'Right';

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      const { count, states } = this.evaluateHand(hand);
      totalRawFingers += count;
      sumConfidence += hand.score || 0.95;

      if (i === 0) {
        primaryRawStates = states;
        primaryHandedness = hand.handedness || 'Right';
        this.lastHandedness = primaryHandedness;
      }

      perHandDetails.push({
        handedness: hand.handedness,
        fingers: count,
        fingerStates: states,
        confidence: Number((hand.score || 0.95).toFixed(2)),
      });
    }

    // Push raw finger states into rolling window for temporal stabilization
    this.history.push(primaryRawStates);
    if (this.history.length > this.WINDOW_SIZE) {
      this.history.shift();
    }

    // Majority vote for each digit across rolling window
    const windowLength = this.history.length;
    const threshold = Math.ceil(windowLength / 2);

    const stabilizedStates: FingerState = {
      thumb: this.history.filter((s) => s.thumb).length >= threshold,
      index: this.history.filter((s) => s.index).length >= threshold,
      middle: this.history.filter((s) => s.middle).length >= threshold,
      ring: this.history.filter((s) => s.ring).length >= threshold,
      pinky: this.history.filter((s) => s.pinky).length >= threshold,
    };

    this.lastStabilizedStates = stabilizedStates;
    const stabilizedFingersCount = Object.values(stabilizedStates).filter(Boolean).length;
    const avgConfidence = Number((sumConfidence / hands.length).toFixed(2));

    return {
      handDetected: true,
      fingers: stabilizedFingersCount,
      confidence: avgConfidence,
      handedness: primaryHandedness,
      rawFingerStates: primaryRawStates,
      stabilizedFingerStates: stabilizedStates,
      frameSequence: frameSeq,
      frameAgeMs,
      inferenceLatencyMs,
      frameByteSize: byteSize,
      details: {
        handCount: hands.length,
        perHand: perHandDetails,
      },
    };
  }
}
