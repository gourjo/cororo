import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGenome, createWorld, decodeGenome, encodeGenome, hashSeed, rng, step } from '../src/simulation.mjs';

test('seeded worlds are reproducible', () => {
  assert.deepEqual(createWorld('same').food, createWorld('same').food);
});

test('different seeds produce different worlds', () => {
  assert.notDeepEqual(createWorld('a').hazards, createWorld('b').hazards);
});

test('rng is deterministic', () => {
  const first = rng(hashSeed('x'));
  const second = rng(hashSeed('x'));
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
});

test('genome and body color survive share round-trip', () => {
  const genome = { speed: 5, sense: 2, armor: 4, bodyColor: '#c05cff' };
  assert.deepEqual(decodeGenome(encodeGenome(genome)), genome);
});

test('old shared genomes receive the default body color', () => {
  const legacy = { speed: 2, sense: 3, armor: 1 };
  assert.equal(decodeGenome(encodeGenome(legacy)).bodyColor, '#c9ed62');
});

test('mutation costs energy, advances generation and records progress', () => {
  const world = createWorld();
  assert.equal(applyGenome(world, { speed: 4, sense: 4, armor: 1, bodyColor: '#ff8844' }), true);
  assert.equal(world.creatures[0].energy, 47);
  assert.equal(world.generation, 2);
  assert.equal(world.mutations, 1);
  assert.equal(world.genome.bodyColor, '#ff8844');
});

test('food can be consumed', () => {
  const world = createWorld();
  world.food = [{ x: world.width / 2, y: world.height / 2, size: 5 }];
  step(world, { x: 0, y: 0 }, .1);
  assert.equal(world.food.length, 0);
  assert.equal(world.foodsEaten, 1);
});

test('newborn movement turns gradually instead of spinning every frame', () => {
  const world = createWorld();
  world.hazards = [];
  world.food = [];
  world.creatures[0].energy = 100;
  const idle = { x: 0, y: 0, target: null, boost: false };
  step(world, idle, 1 / 60);
  assert.equal(world.creatures.length, 2);
  const newborn = world.creatures[1];
  const initialAngle = newborn.angle;
  for (let frame = 0; frame < 300; frame++) step(world, idle, 1 / 60);
  assert.ok(Math.abs(newborn.angle - initialAngle) < 1, 'newborn should follow a broad curve, not spin in place');
  assert.ok(Math.hypot(newborn.x - world.width / 2, newborn.y - world.height / 2) > 20, 'newborn should travel away from its spawn point');
});
