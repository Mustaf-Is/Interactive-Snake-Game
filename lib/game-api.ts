import { z } from "zod";
import { LEVELS, newGame, step, type Difficulty } from "./snake.ts";
import { limitWrite } from "./rate-limit.ts";
import { currentPlayer, guestSession } from "./player-session.ts";


const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const difficulty=z.enum(["easy","medium","hard"]);
const startSchema=z.object({difficulty}).strict();
const finishSchema=z.object({
  id:z.string().uuid(), ticks:z.number().int().min(1).max(100000),
  turns:z.array(z.object({tick:z.number().int().min(1).max(100000),direction:z.enum(["up","down","left","right"])}).strict()).max(20000)
}).strict();
async function body(req:Request){const text=await req.text();if(text.length>1000000)throw new Error("Invalid request");return JSON.parse(text);}
function sameOrigin(req:Request){const origin=req.headers.get("origin");return !origin||origin===new URL(req.url).origin;}
function failure(error:unknown){console.error("Score database request failed",error);return json({error:"Scores are temporarily unavailable. Please retry."},503);}

export function createGameApi(getSql: () => D1Database) {
async function GET(req?:Request){
  try{
    const db=getSql();
    const mine=!!req&&new URL(req.url).searchParams.get("scope")==="mine";
    const player=mine?await currentPlayer(db,req!):null;
    if(mine&&!player)return json({error:"Choose a player before viewing personal records."},401);
    const where=mine?" WHERE player_id = ?":"";
    const query=(sql:string)=>{const statement=db.prepare(sql);return mine?statement.bind(player!.id):statement;};
    const columns="id, difficulty, score, length, duration_ms, created_at, status, player_name";
    const results=await db.batch([
      query("SELECT COUNT(*) AS played, COALESCE(MAX(score), 0) AS best, COALESCE(SUM(food), 0) AS food FROM games"+where),
      query(`SELECT ${columns} FROM games${where} ORDER BY created_at DESC, id DESC LIMIT 5`),
      query(`SELECT ${columns} FROM games${where}${mine?" AND":" WHERE"} status = 'completed' ORDER BY score DESC, created_at DESC, id DESC LIMIT 5`)
    ]);
    return json({...results[0].results[0] as Record<string,number>,recent:results[1].results,top:results[2].results});
  }catch(e){return failure(e);}
}

async function POST(req:Request){
  if(!sameOrigin(req))return json({error:"Origin is not allowed"},403);
  try{const limited=await limitWrite(getSql(),req,"start");if(limited)return limited;}catch(e){return failure(e);}
  let input:z.infer<typeof startSchema>;
  try{input=startSchema.parse(await body(req));}catch{return json({error:"Choose Easy, Medium, or Hard."},400);}
  try{
    const id=crypto.randomUUID(), seed=crypto.getRandomValues(new Uint32Array(1))[0];
    const db=getSql();
    const session=await guestSession(db,req);
    await db.prepare("INSERT INTO games (id, seed, difficulty, status, score, length, food, duration_ms, created_at, player_id, player_name) VALUES (?, ?, ?, 'started', 0, 4, 0, 0, ?, ?, ?)").bind(id,seed,input.difficulty,Date.now(),session.player.id,session.player.username).run();
    const response=json({id,seed,difficulty:input.difficulty,player:session.player},201);
    if(session.cookie)response.headers.set("Set-Cookie",session.cookie);
    return response;
  }catch(e){return failure(e);}
}

async function PUT(req:Request){
  if(!sameOrigin(req))return json({error:"Origin is not allowed"},403);
  try{const limited=await limitWrite(getSql(),req,"submit");if(limited)return limited;}catch(e){return failure(e);}
  let input:z.infer<typeof finishSchema>;
  try{input=finishSchema.parse(await body(req));}catch{return json({error:"Invalid game replay."},400);}
  try{
    const db=getSql();
    const row=await db.prepare("SELECT seed, difficulty, status, score, created_at, player_id FROM games WHERE id = ?").bind(input.id).first<{seed:number;difficulty:Difficulty;status:string;score:number;created_at:number;player_id:string|null}>();
    if(!row)return json({error:"Game not found."},404);
    const player=await currentPlayer(db,req);
    if(!row.player_id||row.player_id!==player?.id)return json({error:"This run belongs to another player. Sign in as the player who started it."},403);
    if(row.status==="completed")return json({saved:true,score:row.score});
    let lastTick=0;
    for(const turn of input.turns){if(turn.tick<=lastTick||turn.tick>input.ticks)return json({error:"Invalid turn sequence."},400);lastTick=turn.tick;}
    let game=newGame(row.seed), cursor=0;
    for(let tick=1;tick<=input.ticks;tick++){
      if(game.over)return json({error:"Replay continued after game over."},400);
      const turn=input.turns[cursor]?.tick===tick?input.turns[cursor++].direction:undefined;
      game=step(game,row.difficulty,turn);
    }
    if(!game.over)return json({error:"This game has not ended."},400);
    if(game.elapsed>Date.now()-row.created_at+1500)return json({error:"Replay duration is invalid."},400);
    const score=game.eaten*LEVELS[row.difficulty].points;
    await db.prepare("UPDATE games SET status = 'completed', score = ?, length = ?, food = ?, duration_ms = ?, completed_at = ? WHERE id = ? AND status = 'started'").bind(score,game.snake.length,game.eaten,game.elapsed,Date.now(),input.id).run();
    // A concurrent completion may have won the conditional update. Always
    // return the persisted result, including when this request lost the race.
    const saved=await db.prepare("SELECT status, score FROM games WHERE id = ?").bind(input.id).first<{status:string;score:number}>();
    if(saved?.status!=="completed")throw new Error("Completion was not persisted");
    return json({saved:true,score:saved.score});
  }catch(e){return failure(e);}
}

return { GET, POST, PUT };
}
