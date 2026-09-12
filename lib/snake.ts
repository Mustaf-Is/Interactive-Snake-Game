export const COLS = 28;
export const ROWS = 22;
export const LEVELS = {
  easy: { label: "Easy", start: 180, min: 75, step: 4, points: 10, hint: "A little room to breathe." },
  medium: { label: "Medium", start: 130, min: 55, step: 3, points: 20, hint: "Find your rhythm." },
  hard: { label: "Hard", start: 90, min: 38, step: 2, points: 30, hint: "Quick hands. Clear head." },
} as const;
export type Difficulty = keyof typeof LEVELS;
export type Direction = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };
export type Turn = { tick: number; direction: Direction };
export type Game = { snake: Point[]; food: Point | null; direction: Direction; seed: number; eaten: number; ticks: number; elapsed: number; over: boolean; won: boolean };
export const vectors: Record<Direction, Point> = { up: {x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
export function same(a: Point, b: Point) { return a.x === b.x && a.y === b.y; }
export function interval(level: Difficulty, eaten: number) { const l=LEVELS[level]; return Math.max(l.min, l.start-eaten*l.step); }
export function canTurn(from: Direction, to: Direction) { return vectors[from].x + vectors[to].x !== 0 || vectors[from].y + vectors[to].y !== 0; }
function placeFood(game: Game) {
  const empty: Point[]=[];
  const occupied=new Set(game.snake.map(p=>p.y*COLS+p.x));
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(!occupied.has(y*COLS+x)) empty.push({x,y});
  game.seed=(Math.imul(1664525,game.seed)+1013904223)>>>0;
  game.food=empty.length ? empty[Math.floor(game.seed/4294967296*empty.length)] : null;
}
export function newGame(seed: number): Game {
  const game:Game={snake:[{x:8,y:11},{x:7,y:11},{x:6,y:11},{x:5,y:11}],food:null,direction:"right",seed:seed>>>0,eaten:0,ticks:0,elapsed:0,over:false,won:false};
  placeFood(game); return game;
}
export function step(game: Game, level: Difficulty, turn?: Direction): Game {
  if(game.over) return game;
  const g:Game={...game,snake:[...game.snake],ticks:game.ticks+1,elapsed:game.elapsed+interval(level,game.eaten)};
  if(turn && canTurn(g.direction,turn)) g.direction=turn;
  const v=vectors[g.direction], head={x:g.snake[0].x+v.x,y:g.snake[0].y+v.y};
  const eating=!!g.food && same(head,g.food);
  if(head.x<0 || head.x>=COLS || head.y<0 || head.y>=ROWS || g.snake.slice(0,eating?undefined:-1).some(p=>same(p,head))) {g.over=true;return g;}
  g.snake.unshift(head);
  if(eating) {g.eaten++;placeFood(g);if(!g.food){g.over=true;g.won=true;}} else g.snake.pop();
  return g;
}
