import test from 'node:test';import assert from 'node:assert/strict';import {applyGenome,createWorld,decodeGenome,encodeGenome,hashSeed,rng,step} from '../src/simulation.mjs';
test('seeded worlds are reproducible',()=>assert.deepEqual(createWorld('same').food,createWorld('same').food));
test('different seeds produce different worlds',()=>assert.notDeepEqual(createWorld('a').hazards,createWorld('b').hazards));
test('rng is deterministic',()=>{const a=rng(hashSeed('x')),b=rng(hashSeed('x'));assert.deepEqual([a(),a(),a()],[b(),b(),b()])});
test('genome survives share round-trip',()=>{const g={speed:5,sense:2,armor:4};assert.deepEqual(decodeGenome(encodeGenome(g)),g)});
test('mutation costs energy and advances generation',()=>{const w=createWorld();assert.equal(applyGenome(w,{speed:4,sense:4,armor:1}),true);assert.equal(w.creatures[0].energy,47);assert.equal(w.generation,2)});
test('food can be consumed',()=>{const w=createWorld();w.food=[{x:w.width/2,y:w.height/2,size:5}];step(w,{x:0,y:0},.1);assert.equal(w.food.length,0);assert.ok(w.dna>0)});
