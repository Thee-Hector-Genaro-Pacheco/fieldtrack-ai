export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandLandmarks {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right';
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
  details?: {
    handCount: number;
    perHand: Array<{
      handedness: 'Left' | 'Right';
      fingers: number;
      fingerStates: FingerState;
      confidence: number;
    }>;
  };
}

export class FingerCounterService {
  /**
   * Calculates distance between two 2D/3D points
   */
  private static distance(p1: Landmark, p2: Landmark): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Evaluates finger extension states for a single hand with 21 landmarks
   * Landmark Indices:
   * 0: WRIST
   * 1-4: THUMB (1: CMC, 2: MCP, 3: IP, 4: TIP)
   * 5-8: INDEX (5: MCP, 6: PIP, 7: DIP, 8: TIP)
   * 9-12: MIDDLE (9: MCP, 10: PIP, 11: DIP, 12: TIP)
   * 13-16: RING (13: MCP, 14: PIP, 15: DIP, 16: TIP)
   * 17-20: PINKY (17: MCP, 18: PIP, 19: DIP, 20: TIP)
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

    // For non-thumb digits, compare TIP-to-wrist distance vs PIP-to-wrist distance.
    // Extended finger tip will be significantly further from the wrist than its PIP joint.
    const isIndexExtended = this.distance(lm[8], wrist) > this.distance(lm[6], wrist) * 1.1;
    const isMiddleExtended = this.distance(lm[12], wrist) > this.distance(lm[10], wrist) * 1.1;
    const isRingExtended = this.distance(lm[16], wrist) > this.distance(lm[14], wrist) * 1.1;
    const isPinkyExtended = this.distance(lm[20], wrist) > this.distance(lm[18], wrist) * 1.1;

    // Thumb extension: Compare Thumb Tip (4) distance to Pinky MCP (17) vs Thumb IP (3) distance to Pinky MCP (17)
    const pinkyMcp = lm[17];
    const isThumbExtended = this.distance(lm[4], pinkyMcp) > this.distance(lm[3], pinkyMcp) * 1.15;

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
   * Processes list of detected hands (1 or 2 hands) and produces standard JSON response payload
   */
  public static processDetection(hands: HandLandmarks[]): HandDetectionResult {
    if (!hands || hands.length === 0) {
      return {
        handDetected: false,
        fingers: 0,
        confidence: 0.0,
      };
    }

    let totalFingers = 0;
    let sumConfidence = 0;
    const perHandDetails = [];

    for (const hand of hands) {
      const { count, states } = this.evaluateHand(hand);
      totalFingers += count;
      sumConfidence += hand.score || 0.95;

      perHandDetails.push({
        handedness: hand.handedness,
        fingers: count,
        fingerStates: states,
        confidence: Number((hand.score || 0.95).toFixed(2)),
      });
    }

    const avgConfidence = Number((sumConfidence / hands.length).toFixed(2));

    return {
      handDetected: true,
      fingers: totalFingers,
      confidence: avgConfidence,
      details: {
        handCount: hands.length,
        perHand: perHandDetails,
      },
    };
  }
}
