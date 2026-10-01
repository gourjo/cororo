export function hashSeed(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function encodeGenome(genome) {
  return btoa(JSON.stringify(genome)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeGenome(value) {
  const raw = value.replaceAll('-', '+').replaceAll('_', '/');
  const genome = JSON.parse(atob(raw));
  for (const key of ['speed', 'sense', 'armor']) {
    if (!Number.isInteger(genome[key]) || genome[key] < 1 || genome[key] > 5) {
      throw Error('Некорректный геном');
    }
  }
  if (genome.bodyColor !== undefined && !/^#[0-9a-f]{6}$/i.test(genome.bodyColor)) {
    throw Error('Некорректный цвет генома');
  }
  genome.bodyColor ||= '#c9ed62';
  return genome;
}

function makeCreature(x, y, options = {}) {
  return {
    x,
    y,
    energy: options.energy ?? 55,
    player: options.player ?? false,
    angle: options.angle ?? 0,
    wanderPhase: options.wanderPhase ?? 0,
  };
}

export function createWorld(seed = 'CORORO-42', width = 960, height = 640) {
  const random = rng(hashSeed(seed));
  const food = [];
  const hazards = [];
  const motes = [];
  for (let index = 0; index < 34; index++) {
    food.push({ x: 40 + random() * (width - 80), y: 50 + random() * (height - 100), size: 4 + random() * 4 });
  }
  for (let index = 0; index < 11; index++) {
    hazards.push({ x: random() * width, y: random() * height, r: 22 + random() * 42 });
  }
  for (let index = 0; index < 90; index++) {
    motes.push({ x: random() * width, y: random() * height, r: random() * 2, a: .1 + random() * .25 });
  }
  return {
    seed,
    width,
    height,
    food,
    hazards,
    motes,
    time: 0,
    generation: 1,
    dna: 0,
    foodsEaten: 0,
    mutations: 0,
    genome: { speed: 3, sense: 3, armor: 2, bodyColor: '#c9ed62' },
    creatures: [makeCreature(width / 2, height / 2, { energy: 72, player: true })],
    events: [],
  };
}

export function applyGenome(world, genome) {
  if (world.creatures[0].energy < 25) return false;
  world.genome = { ...genome };
  world.creatures[0].energy -= 25;
  world.generation++;
  world.dna++;
  world.mutations++;
  return true;
}

function movePlayer(world, input, delta) {
  const player = world.creatures[0];
  const genome = world.genome;
  const speed = (36 + genome.speed * 15 - genome.armor * 4) * (input.boost ? 1.8 : 1);
  let dx = input.x || 0;
  let dy = input.y || 0;
  if (input.target) {
    dx = input.target.x - player.x;
    dy = input.target.y - player.y;
    if (Math.hypot(dx, dy) < 6) {
      input.target = null;
      dx = 0;
      dy = 0;
    }
  }
  const length = Math.hypot(dx, dy) || 1;
  player.x = Math.max(8, Math.min(world.width - 8, player.x + dx / length * speed * delta));
  player.y = Math.max(8, Math.min(world.height - 8, player.y + dy / length * speed * delta));
  if (dx || dy) player.angle = Math.atan2(dy, dx);
  player.energy -= delta * (.42 + genome.speed * .07 + genome.armor * .04) * (input.boost ? 2.2 : 1);
}

function moveFamily(world, delta) {
  for (let index = 1; index < world.creatures.length; index++) {
    const creature = world.creatures[index];
    // A bounded, slow steering curve prevents newborns from accumulating a new
    // random rotation every rendered frame and spinning in place.
    creature.angle += Math.sin(world.time * .65 + creature.wanderPhase) * .28 * delta;
    const pace = 15 + world.genome.speed * 2;
    creature.x += Math.cos(creature.angle) * pace * delta;
    creature.y += Math.sin(creature.angle) * pace * delta;
    if (creature.x < 8 || creature.x > world.width - 8) creature.angle = Math.PI - creature.angle;
    if (creature.y < 8 || creature.y > world.height - 8) creature.angle = -creature.angle;
    creature.x = Math.max(8, Math.min(world.width - 8, creature.x));
    creature.y = Math.max(8, Math.min(world.height - 8, creature.y));
  }
}

export function step(world, input, delta) {
  world.time += delta;
  const player = world.creatures[0];
  movePlayer(world, input, delta);

  for (let index = world.food.length - 1; index >= 0; index--) {
    if (Math.hypot(player.x - world.food[index].x, player.y - world.food[index].y) < 15) {
      world.food.splice(index, 1);
      player.energy = Math.min(100, player.energy + 18);
      world.dna++;
      world.foodsEaten++;
      world.events.push('Поглощена питательная спора');
    }
  }
  for (const hazard of world.hazards) {
    if (Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.r) {
      player.energy -= delta * Math.max(.2, 1.3 - world.genome.armor * .2);
    }
  }
  if (player.energy >= 88 && world.creatures.length < 8) {
    player.energy -= 35;
    world.creatures.push(makeCreature(player.x + 16, player.y + 12, {
      angle: player.angle + .35,
      wanderPhase: world.creatures.length * 1.73,
    }));
    world.generation++;
    world.events.push('Появилось новое существо');
  }
  moveFamily(world, delta);
  player.energy = Math.max(0, player.energy);
  return player;
}
