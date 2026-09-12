import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, LEVELS, newGame, step, interval, same } from '../lib/snake.ts';

test('food is deterministic and never spawns inside the snake',()=>{
 for(let seed=0;seed<100;seed++){const g=newGame(seed);assert.deepEqual(g,newGame(seed));assert.ok(!g.snake.some(p=>same(p,g.food)));}
});
test('eating grows the snake, speeds up play, and preserves the previous state',()=>{
 const g=newGame(97);g.food={x:9,y:11};
 for(const level of Object.keys(LEVELS)){const next=step(g,level);assert.equal(next.eaten,1);assert.equal(next.snake.length,5);assert.ok(interval(level,1)<interval(level,0));assert.equal(g.snake.length,4);assert.ok(!next.snake.some(p=>same(p,next.food)));}
});
test('reversing direction is ignored and wall collision ends a run',()=>{
 let g=newGame(97);g=step(g,'easy','left');assert.equal(g.direction,'right');assert.deepEqual(g.snake[0],{x:9,y:11});
 while(!g.over)g=step(g,'easy');assert.equal(g.ticks,20);assert.equal(g.snake[0].x,COLS-1);assert.equal(step(g,'easy'),g);
});
test('self collision ends play but the vacating tail cell is legal',()=>{
 const g={...newGame(97),snake:[{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2}],direction:'up',food:{x:9,y:9}};
 assert.equal(step(g,'easy','left').over,false);
 const blocked={...g,snake:[...g.snake,{x:0,y:2}]};assert.equal(step(blocked,'easy','left').over,true);
});
test('difficulties are ordered and each has a safe maximum speed',()=>{
 assert.ok(interval('easy',0)>interval('medium',0));assert.ok(interval('medium',0)>interval('hard',0));
 for(const level of Object.keys(LEVELS))assert.equal(interval(level,10000),LEVELS[level].min);
});
test('filling the board wins without trying to place more food',()=>{
 const g=newGame(0);g.snake=[{x:0,y:0}];g.food={x:1,y:0};
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(y!==0||x>1)g.snake.push({x,y});
 const next=step(g,'hard');assert.equal(next.snake.length,COLS*ROWS);assert.equal(next.won,true);assert.equal(next.over,true);assert.equal(next.food,null);
});
