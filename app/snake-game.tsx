"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Pause, Volume2, VolumeX, Trophy, RotateCcw, ChevronRight, Signal, BatteryFull } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEVELS, newGame, step, interval, canTurn, type Difficulty, type Direction, type Game, type Turn } from "@/lib/snake";

type Status="ready"|"starting"|"playing"|"paused"|"over";
type Run={id:string;difficulty:Difficulty;score:number;length:number;duration_ms:number;created_at:number;status:string};
type Stats={played:number;best:number;food:number;recent:Run[];top:Run[]};
const zero:Stats={played:0,best:0,food:0,recent:[],top:[]};
const fmt=(n:number)=>String(n).padStart(3,"0");
const clock=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}`;

export default function SnakeGame(){
 const [level,setLevel]=useState<Difficulty>("easy");
 const [game,setGame]=useState<Game>(()=>newGame(97));
 const [status,setStatus]=useState<Status>("ready");
 const [stats,setStats]=useState<Stats>(zero);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [saveState,setSaveState]=useState("");
 const [sound,setSound]=useState(false);
 const [history,setHistory]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null);
 const gameRef=useRef(game), statusRef=useRef(status), levelRef=useRef(level), pending=useRef<Direction[]>([]), turns=useRef<Turn[]>([]), runId=useRef("");
 const audio=useRef<AudioContext|null>(null), soundRef=useRef(sound);
 const savePayload=useRef<{id:string;ticks:number;turns:Turn[]}|null>(null);
 function updateStatus(s:Status){statusRef.current=s;setStatus(s);}
 function updateGame(g:Game){gameRef.current=g;setGame(g);}
 function beep(end=false){
  if(!soundRef.current)return;
  try{const ctx=audio.current??new AudioContext();audio.current=ctx;void ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="square";osc.frequency.value=end?110:660;gain.gain.setValueAtTime(.025,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.1);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.11);}catch{}
 }
 async function loadStats(){try{const r=await fetch("/api/games",{cache:"no-store"});if(!r.ok)throw Error();setStats(await r.json());setError("");}catch{setError("Scores are unavailable. Try reconnecting.");}finally{setLoading(false);}}
 async function save(){
  if(!savePayload.current)return;
  setSaveState("Saving your game…");
  try{const r=await fetch("/api/games",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(savePayload.current)});if(!r.ok)throw Error();savePayload.current=null;setSaveState("Game saved");void loadStats();}catch{setSaveState("Couldn’t save. Your game is here — retry below.");}
 }
 async function start(){
  if(["playing","paused","starting"].includes(statusRef.current)||savePayload.current)return;
  updateStatus("starting");setError("");setSaveState("");
  try{
   const r=await fetch("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({difficulty:levelRef.current})});if(!r.ok)throw Error();
   const data=await r.json() as {id:string;seed:number};runId.current=data.id;turns.current=[];pending.current=[];updateGame(newGame(data.seed));updateStatus("playing");void loadStats();
  }catch{setError("Couldn’t start a saved game. Please try again.");updateStatus("ready");}
 }
 function pause(){if(statusRef.current==="playing")updateStatus("paused");else if(statusRef.current==="paused")updateStatus("playing");}
 function direction(d:Direction){if(statusRef.current!=="playing")return;const previous=pending.current.at(-1)??gameRef.current.direction;if(pending.current.length<2&&d!==previous&&canTurn(previous,d))pending.current.push(d);}
 useEffect(()=>{void loadStats();},[]);
 useEffect(()=>{soundRef.current=sound;},[sound]);
 useEffect(()=>{
  type Registry={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
  const context=(document as Document & {modelContext?:Registry}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const emptyInput=(input:unknown)=>{if(!input||typeof input!=="object"||Object.keys(input).length)throw Error("This tool takes an empty object.");};
  const snapshot=()=>({status:statusRef.current,difficulty:levelRef.current,score:gameRef.current.eaten*LEVELS[levelRef.current].points,length:gameRef.current.snake.length});
  const registryTools=[
   {name:"read_snake_game",description:"Read the current Snake run, difficulty, score and length.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>{emptyInput(input);return snapshot();}},
   {name:"pause_snake_game",description:"Pause the current Snake run. Does not end or save the game.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{emptyInput(input);if(statusRef.current!=="playing"&&statusRef.current!=="paused")throw Error("There is no active run to pause.");updateStatus("paused");await new Promise(resolve=>requestAnimationFrame(resolve));return snapshot();}}
  ];
  for(const tool of registryTools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  return()=>lifecycle.abort();
 },[]);
 useEffect(()=>{
  if(status!=="playing")return;
  const timer=setTimeout(()=>{
   const turn=pending.current.shift();if(turn)turns.current.push({tick:gameRef.current.ticks+1,direction:turn});
   const next=step(gameRef.current,levelRef.current,turn);if(next.eaten>gameRef.current.eaten)beep();updateGame(next);
   if(next.over){beep(true);updateStatus("over");savePayload.current={id:runId.current,ticks:next.ticks,turns:[...turns.current]};void save();}
  },interval(level,game.eaten));return()=>clearTimeout(timer);
 },[game,status,level]);
 useEffect(()=>{
  function key(e:KeyboardEvent){
   if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,[role="radio"]'))return;
   const map:Record<string,Direction>={w:"up",a:"left",s:"down",d:"right",ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"};
   const d=map[e.key]??map[e.key.toLowerCase()];if(d){e.preventDefault();direction(d);}
   if(e.code==="Space"&&!e.repeat&&!(e.target instanceof HTMLElement&&e.target.closest("button"))){e.preventDefault();if(statusRef.current==="ready"||statusRef.current==="over")void start();else pause();}
   if(e.code==="Escape"&&statusRef.current==="playing")pause();
  }
  const blur=()=>{if(statusRef.current==="playing")updateStatus("paused");};
  const hidden=()=>{if(document.hidden)blur();};
  window.addEventListener("keydown",key);window.addEventListener("blur",blur);document.addEventListener("visibilitychange",hidden);
  return()=>{window.removeEventListener("keydown",key);window.removeEventListener("blur",blur);document.removeEventListener("visibilitychange",hidden);};
 },[]);
 useEffect(()=>{
  const c=canvas.current;if(!c)return;const ctx=c.getContext("2d");if(!ctx)return;
  const size=20;ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle="#28381d";
  game.snake.forEach((p,i)=>{ctx.fillRect(p.x*size+1,p.y*size+1,size-2,size-2);if(i>0){ctx.fillStyle="#b2c185";ctx.fillRect(p.x*size+5,p.y*size+5,size-10,size-10);ctx.fillStyle="#28381d";}});
  const head=game.snake[0];ctx.fillStyle="#c2d294";
  const vertical=game.direction==="up"||game.direction==="down";
  for(const offset of [5,13])ctx.fillRect(head.x*size+(vertical?offset:game.direction==="right"?13:4),head.y*size+(vertical?game.direction==="down"?13:4:offset),3,3);
  if(game.food){const {x,y}=game.food;ctx.fillStyle="#28381d";ctx.fillRect(x*size+5,y*size+5,10,10);ctx.fillRect(x*size+8,y*size+1,4,18);ctx.fillRect(x*size+1,y*size+8,18,4);}
 },[game]);
 const active=status==="playing"||status==="paused"||status==="starting";
 const score=game.eaten*LEVELS[level].points;
 const visible=history?stats.recent:stats.top;
 return <div className="arcade">
  <header className="site-header"><a className="brand" href="/" aria-label="Snake 97 home"><span className="brand-mark">S</span><span>SNAKE<span className="brand-year"> / 97</span></span></a><span className="edition">THE POCKET ARCADE</span><span className="header-note">A classic. One more game.</span></header>
  <main>
   <div className="intro"><div><div className="eyebrow"><span/> EST. 1997 · REPLAYED TODAY</div><h1>Small screen. <br/>Big obsession<span>.</span></h1></div><p>No power-ups. No shortcuts.<br/>Just you, a snake, and one more bite.</p></div>
   <div className="play-layout">
    <section className="game-console" aria-label="Snake game">
     <div className="console-top"><span className="console-label">SNAKE / 97</span><div className="speaker" aria-hidden="true"/><span className="model">MONOCHROME SERIES</span></div>
     <div className="screen-bezel"><div className="lcd">
      <div className="lcd-top"><span><Signal size={18}/> {LEVELS[level].label.toUpperCase()}</span><span>{status==="paused"?"PAUSED":"SNAKE"} <BatteryFull size={24}/></span></div>
      <div className="score-strip"><div><small>SCORE</small><strong>{fmt(score)}</strong></div><div><small>BEST</small><strong>{fmt(Math.max(stats.best,score))}</strong></div></div>
      <div className="board"><canvas ref={canvas} width={560} height={440} aria-label={`Snake game board. Score ${score}, length ${game.snake.length}. Use WASD or arrow keys.`}/>
       {status!=="playing"&&<div className={`game-overlay ${status==="ready"||status==="starting"?"start-overlay":""}`}><span className="pixel-food" aria-hidden="true">✣</span><h2>{status==="ready"||status==="starting"?"SNAKE":status==="paused"?"PAUSED":game.won?"YOU WIN!":"GAME OVER"}</h2><p>{status==="ready"?"The original time killer.":status==="starting"?"Waking up the pixels…":status==="paused"?"Take a breath. We’ll wait.":`${fmt(score)} POINTS · ${game.snake.length} PIXELS LONG`}</p><button className="lcd-button" disabled={status==="starting"||!!savePayload.current} onClick={()=>status==="paused"?pause():void start()}><Play size={16} fill="currentColor"/>{status==="starting"?"STARTING…":status==="paused"?"RESUME":status==="over"?"PLAY AGAIN":"START GAME"}</button><small aria-live="polite">{status==="over"?saveState:"or press SPACE"}</small>{status==="over"&&saveState.startsWith("Couldn’t")&&<button className="retry-save" onClick={()=>void save()}>Retry saving</button>}</div>}
      </div>
      <div className="lcd-bottom"><span>LENGTH {String(game.snake.length).padStart(2,"0")}</span><span>SPEED {(LEVELS[level].start/interval(level,game.eaten)).toFixed(2)}×</span><span>{clock(game.elapsed)}</span></div>
     </div></div>
     <div className="console-actions"><span className="power-light">POWER ON</span><button onClick={pause} disabled={!active||status==="starting"}>{status==="paused"?<Play size={16}/>:<Pause size={16}/>} {status==="paused"?"Resume":"Pause"}<kbd>SPACE</kbd></button><button className="sound-button" aria-label={sound?"Mute game sound":"Enable game sound"} aria-pressed={sound} onClick={()=>{setSound(!sound);if(!sound){try{audio.current??=new AudioContext();void audio.current.resume();}catch{}}}}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button></div>
   <div className="touch-controls" aria-label="Touch controls">{(["up","left","down","right"] as Direction[]).map((d,i)=>{const Icon=[ArrowUp,ArrowLeft,ArrowDown,ArrowRight][i];return <button key={d} aria-label={`Move ${d}`} className={`direction-${d}`} onPointerDown={e=>{e.preventDefault();direction(d);}}><Icon/></button>;})}</div>
    </section>
    <aside className="side-panel">
     <section className="difficulty"><div className="section-heading"><span className="section-number">01</span><h2>Pick your pace</h2></div><RadioGroup className="difficulty-options" value={level} disabled={active||!!savePayload.current} onValueChange={v=>{levelRef.current=v as Difficulty;setLevel(v as Difficulty);updateGame(newGame(97));updateStatus("ready");setSaveState("");}} aria-label="Difficulty">{(Object.keys(LEVELS) as Difficulty[]).map((l,i)=><label key={l} className={`level-option ${level===l?"selected":""}`}><RadioGroupItem value={l} id={`level-${l}`}/><div><strong>{LEVELS[l].label}</strong><span>{LEVELS[l].hint}</span></div><span className="pace-bars" aria-hidden="true">{[0,1,2].map(n=><i key={n} className={n<=i?"lit":""}/>)}</span></label>)}</RadioGroup><p className="pace-note">{active?"Finish this game to change difficulty.":"Every bite makes it a little faster."}</p></section>
     <section className="records"><div className="section-heading"><span className="section-number">02</span><h2>Your track record</h2><Trophy size={17}/></div><div className="stat-pair"><div><span>PERSONAL BEST</span><strong>{loading?"—":fmt(stats.best)}</strong><small>points</small></div><div><span>GAMES PLAYED</span><strong>{loading?"—":String(stats.played).padStart(2,"0")}</strong><small>and counting</small></div></div><div className="record-list-heading"><h3>{history?"Recent games":"Top scores"}</h3><button onClick={()=>setHistory(!history)}>{history?"Top scores":"History"}<ChevronRight size={14}/></button></div><div className="record-list">{loading?<p className="empty-records">Loading your scores…</p>:visible.length?visible.map((run,i)=><div className="record-row" key={run.id}><span className="rank">{String(i+1).padStart(2,"0")}</span><div><strong>{LEVELS[run.difficulty].label}</strong><small>{run.status==="started"?"Unfinished":`${run.length} long · ${clock(run.duration_ms)}`}</small></div><b>{run.status==="started"?"—":fmt(run.score)}</b></div>):<div className="empty-records"><Trophy size={24}/><p>Your first game starts the story.</p><span>Play a round to set your first score.</span></div>}</div>{error?<p className="error" role="alert">{error} <button onClick={()=>void loadStats()}>Retry</button></p>:<p className="saved-note">{loading?"Connecting to your scores…":"Scores saved. Bragging rights earned."}</p>}</section>
    </aside>
   </div>
   <section className="instructions" aria-label="How to play"><div className="instructions-title"><span className="section-number">03</span><h2>Muscle memory,<br/>meet keyboard.</h2></div><div className="key-instruction"><div className="key-cluster"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div><span>or</span><div className="key-cluster"><kbd>↑</kbd><div><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div></div><p>Move your snake</p></div><div className="rule"><span className="food-icon">✣</span><p>Eat. Grow. Repeat.<small>More bites. More points. More speed.</small></p></div><div className="rule"><RotateCcw size={22}/><p>Watch your head.<small>A wall or your own tail ends the game.</small></p></div></section>

  </main>
  <footer><span>BUILT FOR THE “ONE MORE GAME” GENERATION.</span><span>1997 feeling. Today’s high score.</span></footer>
 </div>;
}


