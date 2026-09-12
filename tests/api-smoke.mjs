import assert from 'node:assert/strict';
import { newGame, step, LEVELS } from '../lib/snake.ts';
const base=process.env.SNAKE_TEST_URL??'http://localhost:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Smoke tests only run against a local database.');
const request=(method,payload)=>fetch(base+'/api/games',{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});
const before=await(await request('GET')).json();
assert.equal((await request('POST',{difficulty:'impossible'})).status,400);
const started=await request('POST',{difficulty:'easy'});assert.equal(started.status,201);
const run=await started.json();let game=newGame(run.seed),turns=[];
// Reach the first food, then continue into a wall. The server computes the score.
const food=game.food;
function move(direction,count){for(let i=0;i<count;i++){turns.push({tick:game.ticks+1,direction});game=step(game,'easy',direction);assert.ok(!game.over);}}
if(food.x<game.snake[0].x&&food.y===game.snake[0].y){move('up',1);move('left',game.snake[0].x-food.x);move('down',1);}
else{if(food.y!==game.snake[0].y)move(food.y<game.snake[0].y?'up':'down',Math.abs(food.y-game.snake[0].y));if(food.x!==game.snake[0].x)move(food.x<game.snake[0].x?'left':'right',Math.abs(food.x-game.snake[0].x));}
assert.ok(game.eaten>=1);
while(!game.over)game=step(game,'easy');
const payload={id:run.id,ticks:game.ticks,turns};
assert.equal((await request('PUT',{...payload,score:99999})).status,400);
assert.equal((await request('PUT',{id:run.id,ticks:1,turns:[]})).status,400);
await new Promise(resolve=>setTimeout(resolve,game.elapsed));
const finish=await request('PUT',payload);assert.equal(finish.status,200);assert.equal((await finish.json()).score,game.eaten*LEVELS.easy.points);
assert.equal((await request('PUT',payload)).status,200);
const after=await(await request('GET')).json();assert.equal(after.played,before.played+1);assert.ok(after.top.some(r=>r.id===run.id));
console.log(JSON.stringify({result:'PASS',checks:['invalid difficulty','growth replay','score tampering rejected','unfinished replay rejected','saved score','idempotent finish','persistent history'],id:run.id,score:game.eaten*10}));
