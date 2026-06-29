/**
 * Procedural platform structures generator with difficulty scaling.
 */

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Returns difficulty parameters and structure weights based on current height.
 */
export function getDifficulty(height) {
  if (height < 15) {
    return {
      sizeMin: 3.8,
      sizeMax: 5.0,
      gapMin: 2.0,
      gapMax: 2.8,
      mobileChance: 0,
      types: { standard: 0.7, bridge: 0.2, ramp: 0.1, giant: 0, ruins: 0, zigzag: 0 }
    };
  }
  if (height < 35) {
    return {
      sizeMin: 3.0,
      sizeMax: 4.0,
      gapMin: 2.4,
      gapMax: 3.3,
      mobileChance: 0.08,
      types: { standard: 0.45, bridge: 0.15, ramp: 0.2, giant: 0.08, ruins: 0.06, zigzag: 0.06 }
    };
  }
  if (height < 65) {
    return {
      sizeMin: 2.2,
      sizeMax: 3.2,
      gapMin: 2.8,
      gapMax: 4.0,
      mobileChance: 0.2,
      types: { standard: 0.3, bridge: 0.1, ramp: 0.2, giant: 0.12, ruins: 0.15, zigzag: 0.13 }
    };
  }
  if (height < 110) {
    return {
      sizeMin: 1.6,
      sizeMax: 2.6,
      gapMin: 3.3,
      gapMax: 4.6,
      mobileChance: 0.35,
      types: { standard: 0.2, bridge: 0.1, ramp: 0.2, giant: 0.15, ruins: 0.18, zigzag: 0.17 }
    };
  }
  // 110+
  return {
    sizeMin: 1.2,
    sizeMax: 2.0,
    gapMin: 3.8,
    gapMax: 5.2,
    mobileChance: 0.48,
    types: { standard: 0.15, bridge: 0.1, ramp: 0.2, giant: 0.15, ruins: 0.2, zigzag: 0.2 }
  };
}

export function createRandom(seed) {
  let s = seed;
  return function() {
    let t = s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function chooseStructureType(types) {
  const r = Math.random();
  let sum = 0;
  for (const [type, weight] of Object.entries(types)) {
    sum += weight;
    if (r <= sum) return type;
  }
  return 'standard';
}

/**
 * Generates one structure (which can be a cluster of 1-3 platforms) above the previous one.
 * Always returns an array of platform objects.
 */
export function generatePlatform(prevY, prevX, prevZ, height, randomFn = Math.random) {
  const diff = getDifficulty(height);

  const randVal = (min, max) => randomFn() * (max - min) + min;
  const chooseStructure = (types) => {
    const r = randomFn();
    let sum = 0;
    for (const [type, weight] of Object.entries(types)) {
      sum += weight;
      if (r <= sum) return type;
    }
    return 'standard';
  };

  // Checkpoint height threshold check (~35 meters) - Desactivado por requerimiento de anuncios
  const isCheckpoint = false;

  const type = isCheckpoint ? 'checkpoint' : chooseStructure(diff.types);

  const spread = Math.min(4.0, 1.5 + height / 30);
  const rawX = prevX + randVal(-spread, spread);
  const rawZ = prevZ + randVal(-spread, spread);
  const x = Math.max(-8.5, Math.min(8.5, rawX));
  const z = Math.max(-8.5, Math.min(8.5, rawZ));

  const isMobile = randomFn() < diff.mobileChance;
  const pId = () => randomFn().toString(36).slice(2, 11);

  switch (type) {
    case 'checkpoint': {
      const size = 3.5;
      const gap = randVal(diff.gapMin, diff.gapMax);
      const y = prevY + gap;
      return [{
        id: pId(),
        position: [x, y, z],
        size: [size, 0.3, size],
        rotation: [0, 0, 0],
        type: 'checkpoint',
        isMobile: false
      }];
    }

    case 'bridge': {
      const width = randVal(1.3, 1.8);
      const depth = randVal(5.5, 7.5);
      const gap = randVal(diff.gapMin, diff.gapMax) - 0.4;
      const y = prevY + gap;
      // Rotate bridge to point from previous platform to new one
      const angleY = Math.atan2(x - prevX, z - prevZ);
      return [{
        id: pId(),
        position: [x, y, z],
        size: [width, 0.22, depth],
        rotation: [0, angleY, 0],
        type: 'bridge',
        isMobile: false
      }];
    }

    case 'ramp': {
      const width = randVal(2.2, 3.0);
      const depth = randVal(4.0, 5.5);
      const gap = randVal(diff.gapMin, diff.gapMax);
      const y = prevY + gap;
      // Incline on X (pitch) or Z (roll)
      const isXRot = randomFn() > 0.5;
      const rotVal = randVal(0.2, 0.35); // ~11 to 20 degrees
      const rotation = isXRot ? [rotVal, 0, 0] : [0, 0, rotVal];
      return [{
        id: pId(),
        position: [x, y, z],
        size: [width, 0.22, depth],
        rotation,
        type: 'ramp',
        isMobile: false
      }];
    }

    case 'giant': {
      const width = randVal(4.5, 6.0);
      const blockHeight = randVal(1.0, 1.8);
      const gap = randVal(diff.gapMin, diff.gapMax);
      const y = prevY + gap - blockHeight / 2;
      return [{
        id: pId(),
        position: [x, y, z],
        size: [width, blockHeight, width],
        rotation: [0, 0, 0],
        type: 'giant',
        isMobile: false
      }];
    }

    case 'zigzag': {
      // 3 small stepping stones
      const list = [];
      let currentY = prevY;
      let currentX = prevX;
      let currentZ = prevZ;
      for (let i = 0; i < 3; i++) {
        const stepSize = randVal(1.3, 1.8);
        const gap = randVal(1.3, 1.9);
        const sy = currentY + gap;
        const sx = Math.max(-8.5, Math.min(8.5, currentX + randVal(-2.2, 2.2)));
        const sz = Math.max(-8.5, Math.min(8.5, currentZ + randVal(-2.2, 2.2)));
        list.push({
          id: pId(),
          position: [sx, sy, sz],
          size: [stepSize, 0.22, stepSize],
          rotation: [0, 0, 0],
          type: 'zigzag',
          isMobile: isMobile && i === 1 // Middle stone can be mobile
            ? {
                axis: randomFn() > 0.5 ? 'x' : 'z',
                range: randVal(1.0, 2.0),
                speed: randVal(0.8, 1.5)
              }
            : false
        });
        currentY = sy;
        currentX = sx;
        currentZ = sz;
      }
      return list;
    }

    case 'ruins': {
      const mainWidth = randVal(2.2, 3.2);
      const gap = randVal(diff.gapMin, diff.gapMax);
      const y = prevY + gap;

      // Secondary broken columns next to main platform
      const pillarHeight1 = randVal(1.5, 3.0);
      const pillarHeight2 = randVal(1.0, 2.5);

      const mainPlat = {
        id: pId(),
        position: [x, y, z],
        size: [mainWidth, 0.28, mainWidth],
        rotation: [0, randVal(0, Math.PI), 0],
        type: 'ruins',
        isMobile: false
      };

      const pillar1 = {
        id: pId(),
        position: [
          Math.max(-8.5, Math.min(8.5, x + randVal(-2.5, 2.5))),
          y - pillarHeight1 / 2 + 0.1,
          Math.max(-8.5, Math.min(8.5, z + randVal(-2.5, 2.5)))
        ],
        size: [0.6, pillarHeight1, 0.6],
        rotation: [0, 0, 0],
        type: 'ruin_pillar',
        isMobile: false
      };

      const pillar2 = {
        id: pId(),
        position: [
          Math.max(-8.5, Math.min(8.5, x + randVal(-2.5, 2.5))),
          y - pillarHeight2 / 2 - 0.2,
          Math.max(-8.5, Math.min(8.5, z + randVal(-2.5, 2.5)))
        ],
        size: [0.6, pillarHeight2, 0.6],
        rotation: [0, 0, 0],
        type: 'ruin_pillar',
        isMobile: false
      };

      // Order ruins last so that it is the main reference point for the next block
      return [pillar1, pillar2, mainPlat];
    }

    case 'standard':
    default: {
      const size = randVal(diff.sizeMin, diff.sizeMax);
      const gap = randVal(diff.gapMin, diff.gapMax);
      const y = prevY + gap;
      return [{
        id: pId(),
        position: [x, y, z],
        size: [size, 0.28, size],
        rotation: [0, 0, 0],
        type: 'standard',
        isMobile: isMobile
          ? {
              axis: randomFn() > 0.5 ? 'x' : 'z',
              range: randVal(1.2, 2.8),
              speed: randVal(0.6, 1.8)
            }
          : false
      }];
    }
  }
}

const INITIAL_PLATFORM_HEIGHT = 2.2;

/**
 * Generates the first batch of platforms.
 */
export function generateInitialPlatforms(count = 35, seed = null) {
  const platforms = [];
  const randomFn = seed !== null ? createRandom(seed) : Math.random;

  // Big starting platform
  platforms.push({
    id: 'start',
    position: [0, -0.5, 0],
    size: [7.5, 0.5, 7.5],
    rotation: [0, 0, 0],
    type: 'standard',
    isMobile: false
  });

  // Generamos la primera plataforma con un salto seguro y predecible
  const firstPlatSize = 4.2;
  platforms.push({
    id: 'first-plat',
    position: [0, INITIAL_PLATFORM_HEIGHT, 0],
    size: [firstPlatSize, 0.28, firstPlatSize],
    rotation: [0, 0, 0],
    type: 'standard',
    isMobile: false
  });

  let lastY = INITIAL_PLATFORM_HEIGHT, lastX = 0, lastZ = 0;

  while (platforms.length < count) {
    const newPlats = generatePlatform(lastY, lastX, lastZ, lastY, randomFn);
    platforms.push(...newPlats);
    const last = newPlats[newPlats.length - 1];
    lastY = last.position[1];
    lastX = last.position[0];
    lastZ = last.position[2];
  }

  return platforms;
}
