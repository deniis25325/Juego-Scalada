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
export function generatePlatform(prevY, prevX, prevZ, height) {
  const diff = getDifficulty(height);

  // Checkpoint height threshold check (~35 meters) - Desactivado por requerimiento de anuncios
  const isCheckpoint = false;

  const type = isCheckpoint ? 'checkpoint' : chooseStructureType(diff.types);

  const spread = Math.min(4.0, 1.5 + height / 30);
  const rawX = prevX + rand(-spread, spread);
  const rawZ = prevZ + rand(-spread, spread);
  const x = Math.max(-8.5, Math.min(8.5, rawX));
  const z = Math.max(-8.5, Math.min(8.5, rawZ));

  const isMobile = Math.random() < diff.mobileChance;
  const pId = () => Math.random().toString(36).slice(2, 11);

  switch (type) {
    case 'checkpoint': {
      const size = 3.5;
      const gap = rand(diff.gapMin, diff.gapMax);
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
      const width = rand(1.3, 1.8);
      const depth = rand(5.5, 7.5);
      const gap = rand(diff.gapMin, diff.gapMax) - 0.4;
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
      const width = rand(2.2, 3.0);
      const depth = rand(4.0, 5.5);
      const gap = rand(diff.gapMin, diff.gapMax);
      const y = prevY + gap;
      // Incline on X (pitch) or Z (roll)
      const isXRot = Math.random() > 0.5;
      const rotVal = rand(0.2, 0.35); // ~11 to 20 degrees
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
      const width = rand(4.5, 6.0);
      const blockHeight = rand(1.6, 3.6);
      const gap = rand(diff.gapMin, diff.gapMax) + blockHeight / 2;
      const y = prevY + gap;
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
        const stepSize = rand(1.3, 1.8);
        const gap = rand(1.3, 1.9);
        const sy = currentY + gap;
        const sx = Math.max(-8.5, Math.min(8.5, currentX + rand(-2.2, 2.2)));
        const sz = Math.max(-8.5, Math.min(8.5, currentZ + rand(-2.2, 2.2)));
        list.push({
          id: pId(),
          position: [sx, sy, sz],
          size: [stepSize, 0.22, stepSize],
          rotation: [0, 0, 0],
          type: 'zigzag',
          isMobile: isMobile && i === 1 // Middle stone can be mobile
            ? {
                axis: Math.random() > 0.5 ? 'x' : 'z',
                range: rand(1.0, 2.0),
                speed: rand(0.8, 1.5)
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
      const mainWidth = rand(2.2, 3.2);
      const gap = rand(diff.gapMin, diff.gapMax);
      const y = prevY + gap;

      // Secondary broken columns next to main platform
      const pillarHeight1 = rand(1.5, 3.0);
      const pillarHeight2 = rand(1.0, 2.5);

      const mainPlat = {
        id: pId(),
        position: [x, y, z],
        size: [mainWidth, 0.28, mainWidth],
        rotation: [0, rand(0, Math.PI), 0],
        type: 'ruins',
        isMobile: false
      };

      const pillar1 = {
        id: pId(),
        position: [
          Math.max(-8.5, Math.min(8.5, x + rand(-2.5, 2.5))),
          y - pillarHeight1 / 2 + 0.1,
          Math.max(-8.5, Math.min(8.5, z + rand(-2.5, 2.5)))
        ],
        size: [0.6, pillarHeight1, 0.6],
        rotation: [0, 0, 0],
        type: 'ruin_pillar',
        isMobile: false
      };

      const pillar2 = {
        id: pId(),
        position: [
          Math.max(-8.5, Math.min(8.5, x + rand(-2.5, 2.5))),
          y - pillarHeight2 / 2 - 0.2,
          Math.max(-8.5, Math.min(8.5, z + rand(-2.5, 2.5)))
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
      const size = rand(diff.sizeMin, diff.sizeMax);
      const gap = rand(diff.gapMin, diff.gapMax);
      const y = prevY + gap;
      return [{
        id: pId(),
        position: [x, y, z],
        size: [size, 0.28, size],
        rotation: [0, 0, 0],
        type: 'standard',
        isMobile: isMobile
          ? {
              axis: Math.random() > 0.5 ? 'x' : 'z',
              range: rand(1.2, 2.8),
              speed: rand(0.6, 1.8)
            }
          : false
      }];
    }
  }
}

/**
 * Generates the first batch of platforms.
 */
export function generateInitialPlatforms(count = 35) {
  const platforms = [];

  // Big starting platform
  platforms.push({
    id: 'start',
    position: [0, -0.5, 0],
    size: [7.5, 0.5, 7.5],
    rotation: [0, 0, 0],
    type: 'standard',
    isMobile: false
  });

  let lastY = 2.5, lastX = 0, lastZ = 0;

  while (platforms.length < count) {
    const newPlats = generatePlatform(lastY, lastX, lastZ, lastY);
    platforms.push(...newPlats);
    const last = newPlats[newPlats.length - 1];
    lastY = last.position[1];
    lastX = last.position[0];
    lastZ = last.position[2];
  }

  return platforms;
}
