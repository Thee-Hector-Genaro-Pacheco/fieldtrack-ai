import { FingerCounterService, HandLandmarks, Landmark } from './fingerCounterService.js';

function createLandmarks(
  thumbExtended: boolean,
  indexExtended: boolean,
  middleExtended: boolean,
  ringExtended: boolean,
  pinkyExtended: boolean,
  handedness: 'Left' | 'Right' = 'Right',
  curledJoints: boolean = false
): HandLandmarks {
  const wrist: Landmark = { x: 0.5, y: 0.8, z: 0.0 };

  if (handedness === 'Right') {
    // Right Hand (Palm facing camera: Thumb on left x ~ 0.22, Pinky on right x ~ 0.65)
    const thumbCmc: Landmark = { x: 0.45, y: 0.7, z: 0.0 };
    const thumbMcp: Landmark = { x: 0.4, y: 0.6, z: 0.0 };
    const thumbIp: Landmark = { x: 0.35, y: 0.52, z: 0.0 };
    const thumbTip: Landmark = thumbExtended
      ? { x: 0.22, y: 0.45, z: 0.0 }
      : { x: 0.42, y: 0.58, z: 0.0 };

    const indexMcp: Landmark = { x: 0.42, y: 0.5, z: 0.0 };
    const indexPip: Landmark = { x: 0.42, y: 0.38, z: 0.0 };
    const indexDip: Landmark = { x: 0.42, y: 0.28, z: 0.0 };
    const indexTip: Landmark = indexExtended
      ? { x: 0.42, y: 0.16, z: 0.0 }
      : curledJoints
      ? { x: 0.42, y: 0.38, z: 0.05 }
      : { x: 0.42, y: 0.52, z: 0.0 };

    const middleMcp: Landmark = { x: 0.5, y: 0.5, z: 0.0 };
    const middlePip: Landmark = { x: 0.5, y: 0.37, z: 0.0 };
    const middleDip: Landmark = { x: 0.5, y: 0.26, z: 0.0 };
    const middleTip: Landmark = middleExtended
      ? { x: 0.5, y: 0.14, z: 0.0 }
      : curledJoints
      ? { x: 0.5, y: 0.37, z: 0.05 }
      : { x: 0.5, y: 0.52, z: 0.0 };

    const ringMcp: Landmark = { x: 0.58, y: 0.51, z: 0.0 };
    const ringPip: Landmark = { x: 0.58, y: 0.39, z: 0.0 };
    const ringDip: Landmark = { x: 0.58, y: 0.29, z: 0.0 };
    const ringTip: Landmark = ringExtended
      ? { x: 0.58, y: 0.17, z: 0.0 }
      : curledJoints
      ? { x: 0.58, y: 0.39, z: 0.05 }
      : { x: 0.58, y: 0.53, z: 0.0 };

    const pinkyMcp: Landmark = { x: 0.65, y: 0.53, z: 0.0 };
    const pinkyPip: Landmark = { x: 0.65, y: 0.43, z: 0.0 };
    const pinkyDip: Landmark = { x: 0.65, y: 0.34, z: 0.0 };
    const pinkyTip: Landmark = pinkyExtended
      ? { x: 0.65, y: 0.23, z: 0.0 }
      : curledJoints
      ? { x: 0.65, y: 0.43, z: 0.05 }
      : { x: 0.65, y: 0.55, z: 0.0 };

    return {
      landmarks: [
        wrist,
        thumbCmc, thumbMcp, thumbIp, thumbTip,
        indexMcp, indexPip, indexDip, indexTip,
        middleMcp, middlePip, middleDip, middleTip,
        ringMcp, ringPip, ringDip, ringTip,
        pinkyMcp, pinkyPip, pinkyDip, pinkyTip,
      ],
      handedness: 'Right',
      score: 0.98,
    };
  } else {
    // Left Hand (Palm facing camera: Pinky on left x ~ 0.35, Index on right x ~ 0.58, Thumb on right x ~ 0.78)
    const pinkyMcp: Landmark = { x: 0.35, y: 0.53, z: 0.0 };
    const pinkyPip: Landmark = { x: 0.35, y: 0.43, z: 0.0 };
    const pinkyDip: Landmark = { x: 0.35, y: 0.34, z: 0.0 };
    const pinkyTip: Landmark = pinkyExtended
      ? { x: 0.35, y: 0.23, z: 0.0 }
      : { x: 0.35, y: 0.55, z: 0.0 };

    const ringMcp: Landmark = { x: 0.42, y: 0.51, z: 0.0 };
    const ringPip: Landmark = { x: 0.42, y: 0.39, z: 0.0 };
    const ringDip: Landmark = { x: 0.42, y: 0.29, z: 0.0 };
    const ringTip: Landmark = ringExtended
      ? { x: 0.42, y: 0.17, z: 0.0 }
      : { x: 0.42, y: 0.53, z: 0.0 };

    const middleMcp: Landmark = { x: 0.5, y: 0.5, z: 0.0 };
    const middlePip: Landmark = { x: 0.5, y: 0.37, z: 0.0 };
    const middleDip: Landmark = { x: 0.5, y: 0.26, z: 0.0 };
    const middleTip: Landmark = middleExtended
      ? { x: 0.5, y: 0.14, z: 0.0 }
      : { x: 0.5, y: 0.52, z: 0.0 };

    const indexMcp: Landmark = { x: 0.58, y: 0.5, z: 0.0 };
    const indexPip: Landmark = { x: 0.58, y: 0.38, z: 0.0 };
    const indexDip: Landmark = { x: 0.58, y: 0.28, z: 0.0 };
    const indexTip: Landmark = indexExtended
      ? { x: 0.58, y: 0.16, z: 0.0 }
      : { x: 0.58, y: 0.52, z: 0.0 };

    const thumbCmc: Landmark = { x: 0.55, y: 0.7, z: 0.0 };
    const thumbMcp: Landmark = { x: 0.6, y: 0.6, z: 0.0 };
    const thumbIp: Landmark = { x: 0.65, y: 0.52, z: 0.0 };
    const thumbTip: Landmark = thumbExtended
      ? { x: 0.78, y: 0.45, z: 0.0 }
      : { x: 0.58, y: 0.58, z: 0.0 };

    return {
      landmarks: [
        wrist,
        thumbCmc, thumbMcp, thumbIp, thumbTip,
        indexMcp, indexPip, indexDip, indexTip,
        middleMcp, middlePip, middleDip, middleTip,
        ringMcp, ringPip, ringDip, ringTip,
        pinkyMcp, pinkyPip, pinkyDip, pinkyTip,
      ],
      handedness: 'Left',
      score: 0.98,
    };
  }
}

function runTests() {
  console.log('---------------------------------------------------------');
  console.log('🧪 Running Deterministic Finger Counting Unit Tests');
  console.log('---------------------------------------------------------');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  FingerCounterService.resetStabilizer();

  // Test 1: Fist (0 fingers)
  const fist = createLandmarks(false, false, false, false, false);
  const evalFist = FingerCounterService.evaluateHand(fist);
  assert(evalFist.count === 0, 'Fist pose evaluates to 0 fingers');

  // Test 2: Index Only (1 finger)
  const indexOnly = createLandmarks(false, true, false, false, false);
  const evalIndex = FingerCounterService.evaluateHand(indexOnly);
  assert(evalIndex.count === 1 && evalIndex.states.index, 'Index only evaluates to 1 finger');

  // Test 3: Peace Sign (2 fingers: Index + Middle)
  const peace = createLandmarks(false, true, true, false, false);
  const evalPeace = FingerCounterService.evaluateHand(peace);
  assert(evalPeace.count === 2 && evalPeace.states.index && evalPeace.states.middle, 'Peace sign evaluates to 2 fingers');

  // Test 4: Three Fingers (3 fingers)
  const three = createLandmarks(false, true, true, true, false);
  const evalThree = FingerCounterService.evaluateHand(three);
  assert(evalThree.count === 3 && evalThree.states.ring, 'Three fingers evaluates to 3 fingers');

  // Test 5: Four Fingers (4 fingers)
  const four = createLandmarks(false, true, true, true, true);
  const evalFour = FingerCounterService.evaluateHand(four);
  assert(evalFour.count === 4 && !evalFour.states.thumb, 'Four fingers evaluates to 4 fingers');

  // Test 6: Open Palm (5 fingers)
  const openPalm = createLandmarks(true, true, true, true, true);
  const evalOpenPalm = FingerCounterService.evaluateHand(openPalm);
  assert(evalOpenPalm.count === 5 && evalOpenPalm.states.thumb && evalOpenPalm.states.pinky, 'Open palm evaluates to 5 fingers');

  // Test 7: Right Hand Thumb Extended
  const rightThumb = createLandmarks(true, false, false, false, false, 'Right');
  const evalRightThumb = FingerCounterService.evaluateHand(rightThumb);
  assert(evalRightThumb.states.thumb, 'Right hand thumb extended evaluated correctly');

  // Test 8: Left Hand Thumb Extended
  const leftThumb = createLandmarks(true, false, false, false, false, 'Left');
  const evalLeftThumb = FingerCounterService.evaluateHand(leftThumb);
  assert(evalLeftThumb.states.thumb, 'Left hand thumb extended evaluated correctly');

  // Test 9: Curled/Bent fingers must NOT count
  const curled = createLandmarks(false, false, false, false, false, 'Right', true);
  const evalCurled = FingerCounterService.evaluateHand(curled);
  assert(evalCurled.count === 0, 'Partially curled fingers are rejected and count 0');

  console.log('---------------------------------------------------------');
  console.log(`Test Results: ${passed} Passed | ${failed} Failed`);
  console.log('---------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
