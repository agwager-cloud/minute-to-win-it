import Phaser from 'phaser';
import './styles.css';
import { GAME_BY_ID, GAMES, PLAYABLE_GAMES, type GameDefinition } from './games';
import { NetworkClient, type MatchState, type PlayerState, type PrecisionState, type RoomState } from './network';

const appEl=document.querySelector<HTMLDivElement>('#app')!;
const DESIGN_W=1280, DESIGN_H=720;

function esc(v:unknown){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function median(values:number[]){const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0}
function sleep(ms:number){return new Promise<void>(r=>setTimeout(r,ms));}
function seededUnit(seed:number,index:number){let x=(seed^Math.imul(index+1,0x9e3779b1))>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/0x100000000;}
function angularDistance(a:number,b:number){const d=Math.abs((((a-b)%360)+540)%360-180);return d;}
function precisionProgressText(gameId:string,value:number){if(gameId==='lights-out')return `${(value/1000).toFixed(3)} s`;if(gameId==='time-stop')return `${(value/1000).toFixed(2)} s error`;if(gameId==='blind-beat')return `${Math.round(value)} ms avg`;if(gameId==='shrink-ring'||gameId==='parry'||gameId==='overpour'||gameId==='charge-shot'||gameId==='stack'||gameId==='trace'||gameId==='ricochet'||gameId==='knife-wheel'||gameId==='conveyor-chef'||gameId==='pole-balance')return `${Math.round(value)} pts`;return String(value);}

class NeonBackdrop extends Phaser.Scene{
  particles:Phaser.GameObjects.Arc[]=[];
  create(){
    const g=this.add.graphics();g.fillGradientStyle(0x050817,0x111a43,0x070a20,0x1a1038,1);g.fillRect(0,0,DESIGN_W,DESIGN_H);
    const grid=this.add.graphics();grid.lineStyle(1,0x56d8ff,.07);for(let x=0;x<DESIGN_W;x+=64)grid.lineBetween(x,0,x,DESIGN_H);for(let y=0;y<DESIGN_H;y+=64)grid.lineBetween(0,y,DESIGN_W,y);
    for(let i=0;i<30;i++){const c=this.add.circle(Phaser.Math.Between(0,DESIGN_W),Phaser.Math.Between(0,DESIGN_H),Phaser.Math.Between(2,7),i%3===0?0xffce3a:0x56d8ff,Phaser.Math.FloatBetween(.08,.25));this.particles.push(c);}
    const glow=this.add.graphics();glow.fillStyle(0x00d8ff,.08);glow.fillCircle(120,110,260);glow.fillStyle(0xff3f8f,.07);glow.fillCircle(1160,620,300);
  }
  update(time:number){this.particles.forEach((p,i)=>{p.y+=.06+(i%4)*.018;if(p.y>730)p.y=-10;p.alpha=.08+(.12*(1+Math.sin(time/700+i)))/2;});}
}
new Phaser.Game({type:Phaser.AUTO,width:DESIGN_W,height:DESIGN_H,parent:'phaser-bg',backgroundColor:'#050817',scene:[NeonBackdrop],scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH}});

class SoundBank{
  enabled=localStorage.getItem('mtwi-sound')!=='off';
  music=new Audio('./audio/alex-morgan-video-game-pixel-chiptune-music-583271.mp3');
  constructor(){
    this.music.loop=true;
    this.music.preload='auto';
    this.music.volume=.22;
    const unlock=()=>{if(this.enabled)this.playMusic();};
    window.addEventListener('pointerdown',unlock,{capture:true});
    window.addEventListener('keydown',unlock,{capture:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&this.enabled)this.playMusic();});
    if(this.enabled)this.playMusic();
  }
  private playMusic(){if(!this.enabled)return;void this.music.play().catch(()=>{});}
  toggle(){
    this.enabled=!this.enabled;
    localStorage.setItem('mtwi-sound',this.enabled?'on':'off');
    if(this.enabled)this.playMusic();else this.music.pause();
    return this.enabled;
  }
  beep(freq=520,duration=.06){if(!this.enabled)return;try{const C=(window.AudioContext||(window as any).webkitAudioContext);const ctx=new C();const o=ctx.createOscillator(),gain=ctx.createGain();o.frequency.value=freq;gain.gain.value=.045;o.connect(gain);gain.connect(ctx.destination);o.start();gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);o.stop(ctx.currentTime+duration+.01);}catch{}}
}
const sound=new SoundBank();

type Session={roomCode:string;playerId:string;resumeToken:string;isHost:boolean};

class MinuteApp{
  room?:RoomState; session?:Session; status:'connecting'|'online'|'offline'='connecting'; statusDetail=''; message=''; spectatingMatchId?:string;
  private presenceRepairAt=0;
  controller?:PrecisionController;
  net:NetworkClient;
  constructor(){
    this.net=new NetworkClient({
      onStatus:(s,d)=>{this.status=s;this.statusDetail=d||'';this.updateConnectionBadge();if(!this.room)this.render();},
      onJoined:s=>{this.session=s;this.render();},
      onRoomState:r=>this.onRoomState(r),
      onError:m=>{this.message=m;this.toast(m,'error');},
      onKicked:m=>{this.room=undefined;this.session=undefined;this.spectatingMatchId=undefined;this.message=m;this.render();},
      onResumeFailed:()=>{this.room=undefined;this.session=undefined;this.render();},
    });
    this.session=this.net.session as Session|undefined;
    this.net.start();
    document.addEventListener('focusin',e=>{if((e.target as HTMLElement).matches('input'))document.body.classList.add('typing')});
    document.addEventListener('focusout',()=>document.body.classList.remove('typing'));
    window.setInterval(()=>this.tick(),150);
    this.render();
  }
  get me(){return this.room?.players.find(p=>p.id===this.session?.playerId)}
  get selectedGame(){return GAME_BY_ID.get(this.room?.selectedGameId||'lights-out')||GAMES[0]}
  player(id?:string){return this.room?.players.find(p=>p.id===id)}
  activeMatchFor(id?:string){if(!id||!this.room)return undefined;for(const c of this.room.courts){if(c.activeMatch?.playerIds.includes(id))return c.activeMatch;}return undefined}
  findMatch(id?:string){if(!id||!this.room)return undefined;for(const c of this.room.courts)if(c.activeMatch?.id===id)return c.activeMatch;return undefined}
  onRoomState(r:RoomState){
    this.room=r;
    // Defensive recovery for the same reconnect/presence race we hardened in
    // Dodeca-Gems: if this browser has a healthy socket but the authoritative
    // room snapshot says *this* player is offline, force a clean resume. This
    // prevents an older replaced socket from leaving an iPad/phone greyed out.
    const me=r.players.find(p=>p.id===this.session?.playerId);
    if(me&&!me.connected&&this.net.isOnline()&&Date.now()-this.presenceRepairAt>4000){
      this.presenceRepairAt=Date.now();
      this.net.repairRoomSession();
      return;
    }
    const live=this.controller?this.findMatch(this.controller.matchId):undefined;
    if(this.controller?.running&&live?.status==='playing'&&live.precision?.phase==='playing'&&!live.precision.results[this.session?.playerId||'']){this.controller.sync(r,live);return;}
    if(this.controller){this.controller.destroy();this.controller=undefined;}
    if(this.spectatingMatchId&&!this.findMatch(this.spectatingMatchId))this.spectatingMatchId=undefined;
    this.render();
  }
  render(){
    const old=this.controller;if(old){old.destroy();this.controller=undefined;}
    if(!this.room||!this.session){this.renderStart();return;}
    if(this.room.phase==='lobby'){this.renderLobby();return;}
    // Prepared courts are intentionally still in the matchup phase. Keep every
    // player (including a solo host paired with Minute Bot) on the King of the
    // Court screen until the host explicitly presses BEGIN MATCHUPS. Routing a
    // player into a ready match here would show "Preparing challenge…" because
    // game-specific state is not created until the 3-second start countdown ends.
    if(this.room.phase==='matchups'){this.renderMatchups();return;}
    const mine=this.activeMatchFor(this.session.playerId);
    if(mine){this.renderGame(mine,false);return;}
    const watched=this.findMatch(this.spectatingMatchId);
    if(watched){this.renderGame(watched,true);return;}
    this.renderMatchups();
  }
  shell(inner:string,klass=''){
    return `<main class="screen ${klass}"><header class="topbar"><div class="brand-mini"><span class="brand-stopwatch">⏱</span><div><strong>MINUTE TO WIN IT</strong><small>ONE COURT · ONE CHALLENGE · KEEP MOVING RIGHT</small></div></div>${this.room?`<div class="room-pill"><small>ROOM</small><strong>${esc(this.room.code)}</strong></div>`:''}<button id="sound-toggle" class="icon-btn">${sound.enabled?'🔊':'🔇'}</button><div id="connection-badge" class="connection ${this.status}">${this.status==='online'?'ONLINE':this.status==='offline'?'RECONNECTING':'CONNECTING'}</div></header>${inner}</main>`;
  }
  bindCommon(){const btn=document.querySelector<HTMLButtonElement>('#sound-toggle');btn?.addEventListener('click',()=>{const enabled=sound.toggle();btn.textContent=enabled?'🔊':'🔇';if(enabled)sound.beep();});}
  updateConnectionBadge(){const el=document.querySelector('#connection-badge');if(el){el.className=`connection ${this.status}`;el.textContent=this.status==='online'?'ONLINE':this.status==='offline'?'RECONNECTING':'CONNECTING';}}
  renderStart(){
    appEl.innerHTML=this.shell(`<section class="login-layout"><div class="hero-copy"><div class="eyebrow">KING OF THE COURT · PRECISION SERIES</div><h1>MINUTE<br><span>TO WIN IT</span></h1><p>13 rapid-fire head-to-head challenges. React faster, time better, move right.</p><div class="hero-tags"><span>🏎️ Reaction</span><span>⏱️ Timing</span><span>🎯 Precision</span></div></div><div class="login-card"><div class="card-kicker">JOIN THE CLASSROOM</div><label>PLAYER NAME<input id="name" maxlength="22" autocomplete="off" placeholder="Alex Smith"></label><label>ROOM CODE<input id="code" maxlength="5" inputmode="numeric" pattern="[0-9]*" placeholder="12345"></label><div class="login-actions"><button id="host" class="primary">HOST GAME</button><button id="join" class="secondary">JOIN ROOM</button></div><div class="wake-note"><span class="pulse-dot"></span><div><strong>${this.status==='online'?'Server ready':this.status==='offline'?'Reconnecting automatically':'Waking game server…'}</strong><small>${esc(this.statusDetail||'Render may take a little while to wake on the free service. Do not refresh.')}</small></div></div>${this.message?`<div class="error-box">${esc(this.message)}</div>`:''}</div></section>`,'start-screen');
    this.bindCommon();const name=document.querySelector<HTMLInputElement>('#name')!,code=document.querySelector<HTMLInputElement>('#code')!;code.addEventListener('input',()=>code.value=code.value.replace(/\D/g,'').slice(0,5));
    document.querySelector('#host')?.addEventListener('click',()=>{sound.beep();this.message='';this.net.hostRoom(name.value.trim())});
    document.querySelector('#join')?.addEventListener('click',()=>{sound.beep();this.message='';this.net.joinRoom(name.value.trim(),code.value.trim())});
  }
  renderLobby(){
    const players=this.room!.players.filter(p=>!p.isBot);const game=this.selectedGame;
    const cards=GAMES.map((g,i)=>`<button class="game-card ${g.id===game.id?'selected':''} ${g.playable?'':'locked'}" data-game="${g.id}" ${!this.me?.isHost||!g.playable?'disabled':''}><span class="game-no">${String(i+1).padStart(2,'0')}</span><span class="game-icon">${g.symbol}</span><strong>${esc(g.title)}</strong><small>${esc(g.category)}</small><em>${g.playable?'PLAYABLE':'COMING SOON'}</em></button>`).join('');
    appEl.innerHTML=this.shell(`<section class="lobby-wrap"><div class="lobby-title"><div><span class="eyebrow">HOST SELECTOR</span><h2>Choose the next challenge</h2></div><div class="selected-chip"><span>${game.symbol}</span><div><small>SELECTED</small><strong>${esc(game.title)}</strong></div></div></div><div class="carousel-shell"><button id="scroll-left" class="carousel-arrow">‹</button><div id="game-carousel" class="game-carousel">${cards}</div><button id="scroll-right" class="carousel-arrow">›</button></div><div class="lobby-bottom"><section class="player-panel"><div class="panel-head"><strong>PLAYERS</strong><span>${players.length}/40</span></div><div class="player-grid">${players.map(p=>`<div class="player-chip ${p.isHost?'host':''}"><span class="presence ${p.connected?'on':''}"></span><strong>${esc(p.name)}</strong>${p.isHost?'<small>HOST</small>':''}${this.me?.isHost&&!p.isHost?`<button class="kick" data-kick="${p.id}">×</button>`:''}</div>`).join('')}</div></section><section class="launch-panel"><div class="challenge-preview"><span class="mega-icon">${game.symbol}</span><div><span class="eyebrow">${esc(game.category)}</span><h3>${esc(game.title)}</h3><p>${esc(game.tagline)}</p><small>${esc(game.duration)}</small></div></div>${this.me?.isHost?`<div class="host-buttons"><button id="random-game" class="secondary">🎲 RANDOM PLAYABLE GAME</button><button id="prepare" class="primary big">CREATE MATCHUPS →</button></div>`:`<div class="waiting-host">Waiting for the host to create matchups…</div>`}</section></div></section>`,'lobby-screen');
    this.bindCommon();
    document.querySelectorAll<HTMLElement>('[data-game]').forEach(el=>el.addEventListener('click',()=>{if(!this.me?.isHost)return;this.net.send({type:'select-game',gameId:el.dataset.game})}));
    const car=document.querySelector<HTMLElement>('#game-carousel')!;document.querySelector('#scroll-left')?.addEventListener('click',()=>car.scrollBy({left:-430,behavior:'smooth'}));document.querySelector('#scroll-right')?.addEventListener('click',()=>car.scrollBy({left:430,behavior:'smooth'}));
    // Re-rendering after select-game used to reset the strip to scrollLeft=0, so
    // selecting later games (Blind Beat / Overpour / etc.) jumped the view back
    // to Games 1–4. Always centre the authoritative selected card after render.
    requestAnimationFrame(()=>{const selected=car.querySelector<HTMLElement>('.game-card.selected');if(!selected)return;const left=selected.offsetLeft-(car.clientWidth-selected.clientWidth)/2;car.scrollTo({left:Math.max(0,left),behavior:'auto'});});
    document.querySelector('#random-game')?.addEventListener('click',()=>{const g=PLAYABLE_GAMES[Math.floor(Math.random()*PLAYABLE_GAMES.length)];this.net.send({type:'select-game',gameId:g.id})});
    document.querySelector('#prepare')?.addEventListener('click',()=>this.net.send({type:'prepare-matchups'}));
    document.querySelectorAll<HTMLElement>('[data-kick]').forEach(el=>el.addEventListener('click',()=>this.net.send({type:'kick-player',playerId:el.dataset.kick})));
  }
  renderMatchups(){
    const room=this.room!,game=this.selectedGame;const champion=room.currentChampionId;const ranked=[...room.players].filter(p=>!p.isBot).sort((a,b)=>a.id===champion?-1:b.id===champion?1:b.points-a.points||a.name.localeCompare(b.name));
    const courts=room.courts.map((c,i)=>{const m=c.activeMatch;const a=this.player(m?.playerIds[0]),b=this.player(m?.playerIds[1]);const status=m?.status||'waiting';return `<button class="court-card ${i===room.courts.length-1?'championship':''} ${m?'clickable':''}" ${m?`data-watch="${m.id}"`:''}><div class="court-head"><strong>${i===room.courts.length-1?'👑 CHAMPIONSHIP':i===0?'LOWEST COURT':`COURT ${i+1}`}</strong><span class="status ${status}">${status.toUpperCase()}</span></div>${m?`<div class="versus"><div><span class="presence ${a?.connected?'on':''}"></span><strong>${esc(a?.name||'Player')}</strong><small>${a?.points||0} pts</small></div><b>VS</b><div><span class="presence ${b?.connected?'on':''}"></span><strong>${esc(b?.name||'Player')}</strong><small>${b?.points||0} pts</small></div></div>`:`<div class="empty-court">Waiting for two players</div>`}</button>`}).join('');
    appEl.innerHTML=this.shell(`<section class="matchup-wrap"><div class="matchup-title"><div><span class="eyebrow">KING OF THE COURT</span><h2>${game.symbol} ${esc(game.title)}</h2><p>Winner moves right · Loser moves left · Every win = +1 match point</p></div>${this.me?.isHost?`<div class="host-match-actions">${room.phase==='matchups'?'<button id="begin" class="primary">BEGIN MATCHUPS</button>':''}<button id="return-lobby" class="secondary">RETURN TO LOBBY</button></div>`:''}</div><div class="courts-scroll">${courts}</div><section class="score-strip"><div class="score-label">MATCH POINTS</div>${ranked.map(p=>`<div class="score-tile ${p.id===champion?'champ':''}">${p.id===champion?'👑 ':''}<strong>${esc(p.name)}</strong><span>${p.points}</span></div>`).join('')}</section><div class="spectator-tip">Tap any live court to spectate. Waiting players automatically enter their next match when an opponent is ready.</div></section>`,'matchup-screen');
    this.bindCommon();document.querySelector('#begin')?.addEventListener('click',()=>this.net.send({type:'begin-matchups'}));document.querySelector('#return-lobby')?.addEventListener('click',()=>this.net.send({type:'return-lobby'}));document.querySelectorAll<HTMLElement>('[data-watch]').forEach(el=>el.addEventListener('click',()=>{this.spectatingMatchId=el.dataset.watch;this.render()}));
  }
  renderGame(match:MatchState,spectator:boolean){
    const game=GAME_BY_ID.get(match.precision?.gameId||this.room!.selectedGameId)||this.selectedGame;const a=this.player(match.playerIds[0]),b=this.player(match.playerIds[1]);const champ=match.courtIndex===this.room!.courts.length-1;
    if(match.status==='countdown'){
      appEl.innerHTML=this.shell(`<section class="game-shell"><div class="game-header"><div><span class="eyebrow">${champ?'👑 CHAMPIONSHIP MATCH':`COURT ${match.courtIndex+1}`}</span><h2>${game.symbol} ${esc(game.title)}</h2></div><div class="head-versus"><strong>${esc(a?.name)}</strong><span>VS</span><strong>${esc(b?.name)}</strong></div></div><div class="countdown-card"><small>NEXT MATCHUP STARTS</small><div id="countdown-number">3</div><h3>${esc(a?.name)} <span>VS</span> ${esc(b?.name)}</h3><p>${esc(game.tagline)}</p></div></section>`,'game-screen');this.bindCommon();return;
    }
    const precision=match.precision;
    if(!precision){appEl.innerHTML=this.shell(`<div class="loading-card">Preparing challenge…</div>`);this.bindCommon();return;}
    if(precision.phase==='results'){
      const winner=this.player(precision.winnerId);const ra=precision.results[match.playerIds[0]],rb=precision.results[match.playerIds[1]];
      appEl.innerHTML=this.shell(`<section class="game-shell"><div class="result-card"><span class="eyebrow">${game.title.toUpperCase()} RESULT</span><div class="trophy">🏆</div><h2>${esc(winner?.name)} WINS</h2><div class="result-versus"><div><strong>${esc(a?.name)}</strong><span>${esc(ra?.display||'—')}</span></div><b>VS</b><div><strong>${esc(b?.name)}</strong><span>${esc(rb?.display||'—')}</span></div></div><div class="move-right">+1 MATCH POINT · WINNER MOVES RIGHT →</div></div></section>`,'game-screen');this.bindCommon();sound.beep(760,.12);return;
    }
    appEl.innerHTML=this.shell(`<section class="game-shell"><div class="game-header"><div><span class="eyebrow">${spectator?'👁 SPECTATING':champ?'👑 CHAMPIONSHIP MATCH':`COURT ${match.courtIndex+1}`}</span><h2>${game.symbol} ${esc(game.title)}</h2></div><div class="head-versus"><strong>${esc(a?.name)}</strong><span>VS</span><strong>${esc(b?.name)}</strong></div><div class="game-nav">${spectator?'<button id="back-matchups" class="secondary small">← MATCHUPS</button>':'<button id="view-matchups" class="secondary small">VIEW MATCHUPS</button>'}</div></div><div id="precision-stage" class="precision-stage"></div></section>`,'game-screen');
    this.bindCommon();document.querySelector('#back-matchups')?.addEventListener('click',()=>{this.spectatingMatchId=undefined;this.render()});document.querySelector('#view-matchups')?.addEventListener('click',()=>{this.spectatingMatchId=undefined;this.renderMatchups()});
    const myId=this.session!.playerId;const isParticipant=match.playerIds.includes(myId);if(!spectator&&isParticipant&&!precision.results[myId]){this.controller=new PrecisionController(this,match,precision,game);this.controller.start();}else this.renderPrecisionWatcher(match,precision,game,spectator);
  }
  renderPrecisionWatcher(match:MatchState,p:PrecisionState,game:GameDefinition,spectator:boolean){
    const stage=document.querySelector<HTMLElement>('#precision-stage');if(!stage)return;const cells=match.playerIds.map(id=>{const pl=this.player(id),r=p.results[id],prog=p.progress[id];return `<div class="watch-player"><span class="presence ${pl?.connected?'on':''}"></span><h3>${esc(pl?.name)}</h3>${r?`<div class="submitted">✓ FINISHED<strong>${esc(r.display)}</strong></div>`:`<div class="live-progress"><strong>${esc(prog?.label||'PLAYING')}</strong><span>${prog?.round?`Round ${prog.round}`:'In progress…'}</span>${typeof prog?.value==='number'?`<em>${precisionProgressText(game.id,prog.value)}</em>`:''}</div>`}</div>`}).join('');stage.innerHTML=`<div class="watcher"><div class="watch-symbol">${game.symbol}</div><h2>${spectator?'LIVE SPECTATOR':'RESULT SUBMITTED'}</h2><p>${spectator?'This is a read-only live view.':'Waiting for your opponent to finish.'}</p><div class="watch-grid">${cells}</div></div>`;
  }
  tick(){
    const num=document.querySelector<HTMLElement>('#countdown-number');if(num&&this.room){const m=this.activeMatchFor(this.session?.playerId)||this.findMatch(this.spectatingMatchId);if(m?.startsAt){const n=Math.max(1,Math.ceil((m.startsAt-Date.now())/1000));num.textContent=String(n)}}
    const pause=this.room&&this.activeMatchFor(this.session?.playerId)?.disconnectPause;if(pause){const pl=this.player(pause.playerId);this.showPersistentNotice(`${pl?.name||'Player'} disconnected — waiting up to ${Math.max(0,Math.ceil((pause.graceUntil-Date.now())/1000))}s to reconnect`)}else this.clearPersistentNotice();
  }
  toast(msg:string,type='info'){let el=document.querySelector<HTMLElement>('#toast');if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el)}el.className=`toast ${type}`;el.textContent=msg;el.classList.add('show');setTimeout(()=>el?.classList.remove('show'),3600)}
  showPersistentNotice(msg:string){let el=document.querySelector<HTMLElement>('#persistent');if(!el){el=document.createElement('div');el.id='persistent';document.body.appendChild(el)}el.textContent=msg;el.className='persistent show';}
  clearPersistentNotice(){document.querySelector('#persistent')?.classList.remove('show')}
}

class PrecisionController{
  app:MinuteApp; matchId:string; state:PrecisionState; game:GameDefinition; running=false; destroyed=false; timers:number[]=[]; raf?:number;
  constructor(app:MinuteApp,match:MatchState,state:PrecisionState,game:GameDefinition){this.app=app;this.matchId=match.id;this.state=state;this.game=game;}
  start(){this.running=true;if(this.game.id==='lights-out')void this.runLightsOut();else if(this.game.id==='time-stop')void this.runTimeStop();else if(this.game.id==='shrink-ring')void this.runShrinkRing();else if(this.game.id==='parry')void this.runParry();else if(this.game.id==='blind-beat')void this.runBlindBeat();else if(this.game.id==='overpour')void this.runOverpour();else if(this.game.id==='charge-shot')void this.runChargeShot();else if(this.game.id==='stack')void this.runStack();else if(this.game.id==='trace')void this.runTrace();else if(this.game.id==='ricochet')void this.runRicochet();else if(this.game.id==='knife-wheel')void this.runKnifeWheel();else if(this.game.id==='conveyor-chef')void this.runConveyorChef();else if(this.game.id==='pole-balance')void this.runPoleBalance();}
  destroy(){this.destroyed=true;this.running=false;this.timers.forEach(clearTimeout);if(this.raf)cancelAnimationFrame(this.raf);}
  sync(_room:RoomState,match:MatchState){if(match.precision)this.state=match.precision;}
  stage(){return document.querySelector<HTMLElement>('#precision-stage')}
  sendProgress(round:number,label:string,value?:number){this.app.net.send({type:'precision-progress',matchId:this.matchId,round,label,value});}
  sendResult(score:number,secondary:number,display:string,rounds:number[]){this.running=false;this.app.net.send({type:'precision-result',matchId:this.matchId,score,secondary,display,rounds});const stage=this.stage();if(stage)stage.innerHTML=`<div class="watcher"><div class="watch-symbol">${this.game.symbol}</div><h2>RESULT SUBMITTED</h2><p>Waiting for your opponent to finish…</p><div class="spinner"></div></div>`;}
  async runLightsOut(){
    const stage=this.stage();if(!stage)return;const scores:number[]=[];stage.innerHTML=`<div class="lights-game"><div class="trial-label">START <span id="trial-no">1</span> / 5</div><div class="f1-lights">${Array.from({length:5},(_,i)=>`<div class="light-stack"><span class="red-light" data-light="${i}"></span><span class="red-light dim"></span></div>`).join('')}</div><div id="reaction-message" class="reaction-message">WAIT FOR LIGHTS OUT</div><button id="reaction-pad" class="reaction-pad">WAIT…<small>Tap here the instant the lights go out</small></button><div id="reaction-history" class="reaction-history"></div></div>`;
    const pad=document.querySelector<HTMLButtonElement>('#reaction-pad')!,msg=document.querySelector<HTMLElement>('#reaction-message')!,trialEl=document.querySelector<HTMLElement>('#trial-no')!,history=document.querySelector<HTMLElement>('#reaction-history')!;
    type TapResult={score:number;falseStart:boolean};
    const falseStartFlags:boolean[]=[];
    let phase:'intro'|'waiting'|'go'|'locked'='intro',lightOutAt=0,resolveTap:(v:TapResult)=>void=()=>{};
    pad.addEventListener('pointerdown',e=>{
      e.preventDefault();
      if(phase==='waiting'){
        // A tap before lights-out is the ONLY false-start condition. Keep the
        // agreed 1.000 s score for that attempt, but track the false-start flag
        // separately so a legitimate slow reaction (> 1.000 s) is never mislabeled.
        phase='locked';resolveTap({score:1000,falseStart:true});sound.beep(180,.14);
      }else if(phase==='go'){
        phase='locked';
        const rt=Math.max(0,performance.now()-lightOutAt);
        resolveTap({score:rt,falseStart:false});sound.beep(820,.06);
      }
    });
    await sleep(800);
    for(let trial=0;trial<5&&!this.destroyed;trial++){
      trialEl.textContent=String(trial+1);document.querySelectorAll('.red-light[data-light]').forEach(el=>el.classList.remove('lit'));pad.classList.remove('go','false');pad.innerHTML='WAIT…<small>Do not anticipate</small>';msg.textContent='LIGHTS BUILDING';phase='waiting';
      for(let i=0;i<5;i++){await sleep(300);if(this.destroyed)return;document.querySelector(`.red-light[data-light="${i}"]`)?.classList.add('lit');sound.beep(260+i*35,.035);}
      const delay=650+seededUnit(this.state.seed,trial)*1800;
      const resultPromise=new Promise<TapResult>(r=>resolveTap=r);
      const outPromise=(async()=>{await sleep(delay);if(this.destroyed||phase!=='waiting')return;await new Promise<void>(r=>requestAnimationFrame(()=>{document.querySelectorAll('.red-light[data-light]').forEach(el=>el.classList.remove('lit'));lightOutAt=performance.now();phase='go';pad.classList.add('go');pad.innerHTML='TAP!<small>LIGHTS OUT</small>';msg.textContent='GO!';r();}));})();
      void outPromise;
      const tap=await resultPromise;if(this.destroyed)return;
      const reaction=Math.round(tap.score);scores.push(reaction);falseStartFlags.push(tap.falseStart);
      if(tap.falseStart){msg.textContent='FALSE START';pad.classList.add('false');pad.innerHTML='FALSE START<small>This attempt scores 1.000 s</small>';}else{msg.textContent=`${(reaction/1000).toFixed(3)} SECONDS`;pad.innerHTML=`${(reaction/1000).toFixed(3)} s<small>${reaction<220?'PERFECT':reaction<280?'GREAT':reaction<360?'GOOD':'REACTION RECORDED'}</small>`;}
      history.innerHTML=scores.map((v,i)=>`<span>${i+1}: ${falseStartFlags[i]?'FALSE':(v/1000).toFixed(3)}</span>`).join('');this.sendProgress(trial+1,tap.falseStart?'FALSE START':'REACTION',reaction);await sleep(900);phase='intro';
    }
    if(this.destroyed)return;const med=median(scores),falseStarts=falseStartFlags.filter(Boolean).length,avg=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);this.sendResult(med,avg,`${(med/1000).toFixed(3)} s median${falseStarts?` · ${falseStarts} false start${falseStarts===1?'':'s'}`:''}`,scores);
  }
  async runShrinkRing(){
    const stage=this.stage();if(!stage)return;
    const ringSizes=[360,270,180],baseWidths=[64,52,40],shrunkWidths=[64,36,24];
    const points:number[]=[],hitFlags:boolean[]=[];let totalError=0;
    stage.innerHTML=`<div class="shrink-game">
      <div class="shrink-topline"><div class="trial-label">RING <span id="shrink-round">1</span> / 3</div><div class="shrink-score">SCORE <strong id="shrink-score">0</strong><small>/ 300</small></div></div>
      <div class="shrink-dial" id="shrink-dial">
        ${ringSizes.map((size,i)=>`<div class="shrink-track ring-${i+1}" data-ring="${i}" style="--ring-size:${size}px"><div class="shrink-target" id="shrink-target-${i}"></div></div><div class="shrink-stop-marker" id="shrink-marker-${i}"></div>`).join('')}
        <div id="shrink-needle" class="shrink-needle"><span></span></div><div class="shrink-hub"></div>
      </div>
      <div id="shrink-message" class="shrink-message">GET READY</div>
      <div class="shrink-timer"><div id="shrink-timer-fill"></div></div>
      <button id="shrink-pad" class="shrink-pad">STOP NEEDLE<small>Tap when the needle is inside the green zone</small></button>
      <div id="shrink-history" class="reaction-history"></div>
    </div>`;
    const roundEl=document.querySelector<HTMLElement>('#shrink-round')!,scoreEl=document.querySelector<HTMLElement>('#shrink-score')!,msg=document.querySelector<HTMLElement>('#shrink-message')!,pad=document.querySelector<HTMLButtonElement>('#shrink-pad')!,needle=document.querySelector<HTMLElement>('#shrink-needle')!,timerFill=document.querySelector<HTMLElement>('#shrink-timer-fill')!,history=document.querySelector<HTMLElement>('#shrink-history')!;
    let phase:'idle'|'running'|'locked'='idle',resolveStop:(v:{angle:number;timedOut:boolean})=>void=()=>{};
    let currentAngle=0;
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(phase!=='running')return;phase='locked';resolveStop({angle:currentAngle,timedOut:false});sound.beep(760,.055);});
    await sleep(700);
    let previousHit=false;
    for(let ring=0;ring<3&&!this.destroyed;ring++){
      roundEl.textContent=String(ring+1);
      document.querySelectorAll<HTMLElement>('.shrink-track').forEach((el,i)=>el.classList.toggle('active',i===ring));
      const width=ring===0?baseWidths[0]:(previousHit?shrunkWidths[ring]:baseWidths[ring]);
      const targetCenter=20+seededUnit(this.state.seed,60+ring)*320;
      const targetStart=targetCenter-width/2;
      const target=document.querySelector<HTMLElement>(`#shrink-target-${ring}`)!;
      target.style.background=`conic-gradient(from ${targetStart}deg, rgba(77,255,174,.98) 0deg ${width}deg, transparent ${width}deg 360deg)`;
      target.classList.add('visible');
      const radius=ringSizes[ring]/2;
      needle.style.setProperty('--needle-len',`${Math.max(50,radius-9)}px`);
      const startAngle=seededUnit(this.state.seed,80+ring)*360;
      const speed=(220+seededUnit(this.state.seed,100+ring)*150)*(seededUnit(this.state.seed,120+ring)>.5?1:-1);
      currentAngle=startAngle;needle.style.transform=`rotate(${currentAngle}deg)`;
      const started=performance.now();
      let timeoutId=0;
      msg.textContent=previousHit&&ring>0?'TARGET SHRUNK — STAY PRECISE':'STOP INSIDE THE GREEN';
      pad.classList.remove('hit','miss');pad.innerHTML='STOP NEEDLE<small>Tap anywhere on this button</small>';timerFill.style.width='100%';phase='running';
      const stopPromise=new Promise<{angle:number;timedOut:boolean}>(resolve=>resolveStop=resolve);
      const animate=(now:number)=>{if(this.destroyed||phase!=='running')return;const elapsed=now-started;currentAngle=((startAngle+(speed*elapsed/1000))%360+360)%360;needle.style.transform=`rotate(${currentAngle}deg)`;timerFill.style.width=`${Math.max(0,100-elapsed/80)}%`;this.raf=requestAnimationFrame(animate)};
      this.raf=requestAnimationFrame(animate);
      timeoutId=window.setTimeout(()=>{if(this.destroyed||phase!=='running')return;phase='locked';resolveStop({angle:currentAngle,timedOut:true});},8000);this.timers.push(timeoutId);
      const stopped=await stopPromise;if(this.destroyed)return;clearTimeout(timeoutId);if(this.raf)cancelAnimationFrame(this.raf);
      const dist=angularDistance(stopped.angle,targetCenter),inside=!stopped.timedOut&&dist<=width/2;
      const ringPoints=inside?Math.max(50,Math.min(100,Math.round(100-50*(dist/(width/2))))):0;
      points.push(ringPoints);hitFlags.push(inside);totalError+=dist;
      const marker=document.querySelector<HTMLElement>(`#shrink-marker-${ring}`)!;const rad=stopped.angle*Math.PI/180;marker.style.left=`calc(50% + ${Math.sin(rad)*radius}px)`;marker.style.top=`calc(50% - ${Math.cos(rad)*radius}px)`;marker.className=`shrink-stop-marker show ${inside?'hit':'miss'}`;
      const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);
      const feedback=stopped.timedOut?'TIME OUT':!inside?'MISS':ringPoints>=95?'PERFECT!':ringPoints>=82?'GREAT!':ringPoints>=68?'GOOD!':'HIT!';
      msg.textContent=inside&&ring<2?`${feedback} +${ringPoints} · NEXT ZONE SHRINKS`:`${feedback}${inside?` +${ringPoints}`:''}`;
      pad.classList.add(inside?'hit':'miss');pad.innerHTML=stopped.timedOut?'0 POINTS<small>You have 8 seconds per ring</small>':inside?`${ringPoints} POINTS<small>${Math.round(dist)}° from centre</small>`:`MISS<small>${Math.round(dist)}° from target centre</small>`;
      history.innerHTML=points.map((v,i)=>`<span class="${hitFlags[i]?'ring-hit':'ring-miss'}">${i+1}: ${v} pts</span>`).join('');
      this.sendProgress(ring+1,`${feedback} · RING ${ring+1}`,total);sound.beep(inside?(ringPoints>=95?980:720):220,.08);previousHit=inside;await sleep(1250);phase='idle';
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),hits=hitFlags.filter(Boolean).length;this.sendResult(total,Math.round(totalError*100),`${total} / 300 pts · ${hits}/3 hits`,points);
  }
  async runParry(){
    const stage=this.stage();if(!stage)return;
    const rounds=10,maxScore=1000,points:number[]=[],mistakes:boolean[]=[];let total=0,tieBreakPenalty=0;
    // The opening two encounters are always genuine attacks so new players learn
    // the visual language before feints are introduced. Three of encounters 3–10
    // are then chosen deterministically from the shared match seed as feints.
    const feintCandidates=Array.from({length:8},(_,i)=>i+2).sort((a,b)=>seededUnit(this.state.seed,200+a)-seededUnit(this.state.seed,200+b));
    const feints=new Set(feintCandidates.slice(0,3));
    stage.innerHTML=`<div class="parry-game">
      <div class="parry-topline"><div class="trial-label">ENCOUNTER <span id="parry-round">1</span> / ${rounds}</div><div class="parry-score">SCORE <strong id="parry-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="parry-arena" id="parry-arena">
        <div class="parry-danger-glow"></div>
        <div class="parry-opponent" id="parry-opponent"><div class="parry-body">🥷</div><div class="parry-weapon" id="parry-weapon">⚔️</div></div>
        <div class="parry-tell" id="parry-tell"><span>READ THE WIND-UP</span><div class="parry-tell-track"><div id="parry-tell-fill"></div></div></div>
      </div>
      <div class="parry-controls">
        <div id="parry-message" class="parry-message">WATCH THE SWORD</div>
        <button id="parry-pad" class="parry-pad">PARRY<small>Read the sword — decide for yourself</small></button>
        <div class="parry-tip"><span class="neutral">WATCH THE SWORD • PARRY ONLY IF THE ATTACK COMMITS</span></div>
        <div id="parry-history" class="parry-history"></div>
      </div>
    </div>`;
    const roundEl=document.querySelector<HTMLElement>('#parry-round')!,scoreEl=document.querySelector<HTMLElement>('#parry-score')!,arena=document.querySelector<HTMLElement>('#parry-arena')!,opponent=document.querySelector<HTMLElement>('#parry-opponent')!,weapon=document.querySelector<HTMLElement>('#parry-weapon')!,tellFill=document.querySelector<HTMLElement>('#parry-tell-fill')!,msg=document.querySelector<HTMLElement>('#parry-message')!,pad=document.querySelector<HTMLButtonElement>('#parry-pad')!,history=document.querySelector<HTMLElement>('#parry-history')!;
    type ParryAction={kind:'early'|'parry'|'miss'|'feint-safe';reaction?:number};
    let phase:'idle'|'telegraph'|'feint'|'strike'|'locked'='idle',strikeAt=0,resolveAction:(v:ParryAction)=>void=()=>{};
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(phase==='telegraph'||phase==='feint'){phase='locked';resolveAction({kind:'early'});sound.beep(170,.12);return;}if(phase==='strike'){phase='locked';resolveAction({kind:'parry',reaction:Math.max(0,performance.now()-strikeAt)});sound.beep(920,.055);}});
    await sleep(650);
    for(let encounter=0;encounter<rounds&&!this.destroyed;encounter++){
      const isFeint=feints.has(encounter),side=seededUnit(this.state.seed,310+encounter)>.5?'right':'left';
      const telegraphMs=Math.round(650+seededUnit(this.state.seed,330+encounter)*650);
      const windowMs=Math.max(650,Math.round(850-encounter*22));
      roundEl.textContent=String(encounter+1);arena.className=`parry-arena windup ${side}`;opponent.className=`parry-opponent windup ${side}`;weapon.className='parry-weapon';
      msg.textContent='WATCH THE SWORD';pad.className='parry-pad';pad.innerHTML='PARRY<small>Read the sword — decide for yourself</small>';tellFill.style.transition='none';tellFill.style.width='100%';void tellFill.offsetWidth;tellFill.style.transition=`width ${telegraphMs}ms linear`;tellFill.style.width='0%';phase='telegraph';
      const actionPromise=new Promise<ParryAction>(resolve=>resolveAction=resolve);
      const telegraphTimer=window.setTimeout(()=>{
        if(this.destroyed||phase!=='telegraph')return;
        if(isFeint){
          phase='feint';arena.className=`parry-arena decision ${side}`;opponent.className=`parry-opponent feint ${side}`;weapon.className='parry-weapon feint';msg.innerHTML='READ THE SWORD<small>Make your decision from the weapon movement</small>';pad.className='parry-pad decision';pad.innerHTML='PARRY<small>Tap only if the attack commits</small>';
          const feintTimer=window.setTimeout(()=>{if(this.destroyed||phase!=='feint')return;phase='locked';resolveAction({kind:'feint-safe'});},950);this.timers.push(feintTimer);return;
        }
        phase='strike';strikeAt=performance.now();arena.className=`parry-arena decision ${side}`;opponent.className=`parry-opponent strike ${side}`;weapon.className='parry-weapon strike';msg.innerHTML='READ THE SWORD<small>Make your decision from the weapon movement</small>';pad.className='parry-pad decision';pad.innerHTML='PARRY<small>Tap only if the attack commits</small>';
        const missTimer=window.setTimeout(()=>{if(this.destroyed||phase!=='strike')return;phase='locked';resolveAction({kind:'miss'});},windowMs);this.timers.push(missTimer);
      },telegraphMs);this.timers.push(telegraphTimer);
      const action=await actionPromise;if(this.destroyed)return;
      let earned=0,feedback='',detail='',mistake=false;
      if(action.kind==='feint-safe'){
        earned=100;feedback='FEINT READ!';detail='You held your nerve';arena.className=`parry-arena feint ${side}`;opponent.className=`parry-opponent feint ${side}`;weapon.className='parry-weapon feint';pad.className='parry-pad success';pad.innerHTML='100 POINTS<small>Correct — do not parry a feint</small>';sound.beep(820,.07);
      }else if(action.kind==='early'){
        mistake=true;if(isFeint){feedback='FOOLED BY THE FEINT';detail='Any tap during a feint is a false parry';arena.className=`parry-arena feint failed ${side}`;weapon.className='parry-weapon feint';}else{feedback='TOO EARLY';detail='Wait for the strike flash';arena.className=`parry-arena failed ${side}`;}pad.className='parry-pad fail';pad.innerHTML='0 POINTS<small>Anticipation was punished</small>';tieBreakPenalty+=2000;
      }else if(action.kind==='miss'){
        mistake=true;feedback='TOO LATE';detail='The strike got through';arena.className=`parry-arena failed ${side}`;pad.className='parry-pad fail';pad.innerHTML='0 POINTS<small>The committed strike got through</small>';tieBreakPenalty+=2000;sound.beep(190,.11);
      }else{
        const rt=Math.round(action.reaction||0);const reactionFloor=180;const reactionSpan=Math.max(1,windowMs-reactionFloor);const timing=Math.max(0,Math.min(1,(rt-reactionFloor)/reactionSpan));earned=Math.max(40,Math.min(100,Math.round(100-60*timing)));tieBreakPenalty+=rt;feedback=earned>=96?'PERFECT PARRY!':earned>=86?'GREAT PARRY!':earned>=72?'GOOD PARRY!':earned>=55?'PARRY!':'LATE PARRY!';detail=`${rt} ms reaction`;arena.className=`parry-arena success ${side}`;opponent.className=`parry-opponent blocked ${side}`;pad.className='parry-pad success';pad.innerHTML=`${earned} POINTS<small>${rt} ms reaction · still blocked</small>`;
      }
      points.push(earned);mistakes.push(mistake);total+=earned;scoreEl.textContent=String(total);msg.innerHTML=`${feedback}<small>${detail}</small>`;
      history.innerHTML=points.map((value,i)=>`<span class="${value===100?'perfect':value>0?'good':'miss'}" title="Encounter ${i+1}">${value===100?'★':value>0?'✓':'×'}</span>`).join('');
      this.sendProgress(encounter+1,feedback,total);await sleep(780);phase='idle';
    }
    if(this.destroyed)return;const errors=mistakes.filter(Boolean).length;this.sendResult(total,tieBreakPenalty,`${total} / ${maxScore} pts · ${errors} mistake${errors===1?'':'s'}`,points);
  }
  async runBlindBeat(){
    const stage=this.stage();if(!stage)return;
    const bpm=Math.round(92+seededUnit(this.state.seed,500)*26),interval=60000/bpm,visibleBeats=16,blindBeats=16;
    // v0.1.12: score Blind Beat as average timing error rather than an opaque
    // accumulated drift total. A missed hidden beat costs 750 ms and an extra
    // tap costs 300 ms. Hidden taps are aligned to the whole beat sequence at
    // the end, preventing one slightly late tap from shifting every later beat.
    const matchTolerance=Math.min(480,Math.max(380,interval*.75)),missPenalty=750,extraPenalty=300;
    const blindTaps:number[]=[];let overflowExtraTaps=0,blindTapCount=0,phase:'countdown'|'visible'|'blind'|'done'='countdown';
    let firstVisibleAt=0,firstBlindAt=0,blindInputGateAt=0;
    stage.innerHTML=`<div class="beat-game">
      <div class="beat-topline"><div class="trial-label">BLIND BEAT <span id="beat-phase-label">GET READY</span></div><div class="beat-tempo">TEMPO <strong>${bpm}</strong><small>BPM</small></div></div>
      <div class="beat-arena" id="beat-arena">
        <div class="beat-mode" id="beat-mode">VISIBLE METRONOME</div>
        <div class="beat-orbit"><div id="beat-pulse" class="beat-pulse">●</div><div id="beat-blind-symbol" class="beat-blind-symbol">?</div></div>
        <div class="beat-dots" id="beat-dots">${Array.from({length:4},(_,i)=>`<span data-beat-dot="${i}">${i+1}</span>`).join('')}</div>
        <div class="beat-bar-label" id="beat-bar-label">4 visible bars → 4 blind bars</div>
      </div>
      <div class="beat-controls">
        <div id="beat-message" class="beat-message">LOCK ONTO THE PULSE</div>
        <button id="beat-pad" class="beat-pad">TAP<small>Tap with every beat</small></button>
        <div class="beat-guide"><span class="visible">👁 4 BARS WITH CUE</span><span class="blind">🌑 4 BARS BLIND</span></div>
        <div class="beat-bars" id="beat-bars">${Array.from({length:8},(_,i)=>`<span data-bar="${i}" class="${i<4?'visible':'blind'}"></span>`).join('')}</div>
        <div id="beat-tap-count" class="beat-tap-count">FOLLOW THE FIRST 16 BEATS</div>
      </div>
    </div>`;
    const arena=document.querySelector<HTMLElement>('#beat-arena')!,modeEl=document.querySelector<HTMLElement>('#beat-mode')!,pulse=document.querySelector<HTMLElement>('#beat-pulse')!,blindSymbol=document.querySelector<HTMLElement>('#beat-blind-symbol')!,barLabel=document.querySelector<HTMLElement>('#beat-bar-label')!,phaseLabel=document.querySelector<HTMLElement>('#beat-phase-label')!,msg=document.querySelector<HTMLElement>('#beat-message')!,pad=document.querySelector<HTMLButtonElement>('#beat-pad')!,tapCount=document.querySelector<HTMLElement>('#beat-tap-count')!;
    const dots=[...document.querySelectorAll<HTMLElement>('[data-beat-dot]')],bars=[...document.querySelectorAll<HTMLElement>('[data-bar]')];
    const waitUntil=(target:number)=>new Promise<void>(resolve=>{const tick=()=>{if(this.destroyed||performance.now()>=target){resolve();return;}this.raf=requestAnimationFrame(tick)};tick()});
    const flashTap=()=>{pad.classList.add('pressed');const id=window.setTimeout(()=>pad.classList.remove('pressed'),85);this.timers.push(id)};
    pad.addEventListener('pointerdown',e=>{
      e.preventDefault();if(phase==='countdown'||phase==='done')return;flashTap();sound.beep(phase==='visible'?520:430,.025);
      if(phase==='visible')return;
      const now=performance.now();
      // The midpoint between visible beat 16 and hidden beat 1 is the handover
      // boundary. A late tap still belonging to visible beat 16 is ignored rather
      // than poisoning hidden beat 1 and shifting the whole sequence.
      if(now<blindInputGateAt)return;
      blindTapCount++;tapCount.textContent=`BLIND TAPS ${blindTapCount}`;
      if(blindTaps.length<64)blindTaps.push(now);else overflowExtraTaps++;
    });
    for(const n of [3,2,1]){if(this.destroyed)return;phaseLabel.textContent='GET READY';msg.textContent=`STARTING IN ${n}`;pad.innerHTML=`${n}<small>Then tap with every pulse</small>`;sound.beep(360+n*90,.045);await sleep(700)}
    if(this.destroyed)return;
    phase='visible';arena.className='beat-arena visible-phase';modeEl.textContent='VISIBLE METRONOME';phaseLabel.textContent='VISIBLE · 4 BARS';msg.textContent='TAP WITH THE PULSE';pad.innerHTML='TAP<small>Follow the visible beat</small>';barLabel.textContent='Watch, listen and tap · rhythm will disappear';firstVisibleAt=performance.now()+360;
    for(let beat=0;beat<visibleBeats&&!this.destroyed;beat++){
      const expected=firstVisibleAt+beat*interval;await waitUntil(expected);if(this.destroyed)return;
      const dot=beat%4,bar=Math.floor(beat/4);dots.forEach((el,i)=>el.classList.toggle('active',i===dot));bars.forEach((el,i)=>el.classList.toggle('current',i===bar));
      pulse.classList.remove('hit');void pulse.offsetWidth;pulse.classList.add('hit');sound.beep(dot===0?760:610,.035);
      phaseLabel.textContent=`VISIBLE · BAR ${bar+1}/4`;tapCount.textContent=`FOLLOW THE BEAT · ${beat+1} / ${visibleBeats}`;
      const clearId=window.setTimeout(()=>pulse.classList.remove('hit'),Math.min(150,interval*.25));this.timers.push(clearId);
      if(beat===visibleBeats-1){firstBlindAt=firstVisibleAt+visibleBeats*interval;blindInputGateAt=firstBlindAt-interval/2;}
    }
    if(this.destroyed)return;
    phase='blind';arena.className='beat-arena blind-phase';modeEl.textContent='BLIND MODE';phaseLabel.textContent='BLIND · 4 BARS';msg.textContent='KEEP THE BEAT';pad.innerHTML='TAP<small>No cue now — trust your rhythm</small>';barLabel.textContent='The metronome is hidden · keep the same tempo';pulse.classList.remove('hit');pulse.style.visibility='hidden';blindSymbol.classList.add('show');dots.forEach(el=>el.classList.remove('active'));bars.forEach((el,i)=>{el.classList.remove('current');if(i<4)el.classList.add('complete')});tapCount.textContent='BLIND TAPS 0';this.sendProgress(4,'CUE HIDDEN');
    for(let beat=0;beat<blindBeats&&!this.destroyed;beat++){
      const expected=firstBlindAt+beat*interval;await waitUntil(expected);if(this.destroyed)return;
      // Deliberately no visual or audio beat cue during this section.
      if(beat%4===3){const bar=Math.floor(beat/4);this.sendProgress(5+bar,`BLIND BAR ${bar+1}`);}
    }
    // Keep accepting a naturally late final tap for the same generous tolerance.
    await waitUntil(firstBlindAt+(blindBeats-1)*interval+matchTolerance);if(this.destroyed)return;phase='done';

    const expectedBeats=Array.from({length:blindBeats},(_,i)=>firstBlindAt+i*interval);
    const taps=[...blindTaps].sort((a,b)=>a-b);
    const n=expectedBeats.length,m=taps.length,INF=1e12;
    const dp=Array.from({length:n+1},()=>Array<number>(m+1).fill(INF));
    const choice=Array.from({length:n+1},()=>Array<'match'|'miss'|'extra'|''>(m+1).fill(''));
    dp[0][0]=0;
    for(let i=1;i<=n;i++){dp[i][0]=dp[i-1][0]+missPenalty;choice[i][0]='miss';}
    for(let j=1;j<=m;j++){dp[0][j]=dp[0][j-1]+extraPenalty;choice[0][j]='extra';}
    for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
      let best=dp[i-1][j]+missPenalty,bestChoice:'match'|'miss'|'extra'='miss';
      const extraCost=dp[i][j-1]+extraPenalty;if(extraCost<best){best=extraCost;bestChoice='extra';}
      const err=Math.abs(taps[j-1]-expectedBeats[i-1]);
      if(err<=matchTolerance){const matchCost=dp[i-1][j-1]+err;if(matchCost<=best){best=matchCost;bestChoice='match';}}
      dp[i][j]=best;choice[i][j]=bestChoice;
    }
    const beatErrors=Array<number>(blindBeats).fill(missPenalty);let matched=0,extraTaps=overflowExtraTaps,i=n,j=m;
    while(i>0||j>0){const c=choice[i][j];if(c==='match'){beatErrors[i-1]=Math.round(Math.abs(taps[j-1]-expectedBeats[i-1]));matched++;i--;j--;}else if(c==='miss'){beatErrors[i-1]=missPenalty;i--;}else if(c==='extra'){extraTaps++;j--;}else break;}
    const misses=blindBeats-matched,penalisedExtras=Math.min(extraTaps,32),totalPenalty=beatErrors.reduce((a,b)=>a+b,0)+penalisedExtras*extraPenalty,averageError=Math.round(totalPenalty/blindBeats),worst=Math.max(...beatErrors);
    bars.forEach(el=>{el.classList.remove('current');el.classList.add('complete')});arena.className='beat-arena finished';blindSymbol.textContent='✓';msg.textContent='RHYTHM COMPLETE';pad.className='beat-pad finished';pad.innerHTML=`${averageError} ms AVG ERROR<small>${matched}/16 beats · ${misses} missed · ${extraTaps} extra</small>`;tapCount.textContent='LOWEST AVERAGE ERROR WINS';
    this.sendProgress(8,'FINISHED',averageError);await sleep(1100);if(this.destroyed)return;this.sendResult(averageError,worst,`${averageError} ms avg · ${matched}/16 beats${extraTaps?` · ${extraTaps} extra`:''}`,beatErrors);
  }
  async runOverpour(){
    const stage=this.stage();if(!stage)return;
    const rounds=5,maxScore=500,points:number[]=[],errors:number[]=[];
    stage.innerHTML=`<div class="pour-game">
      <div class="pour-topline"><div class="trial-label">POUR <span id="pour-round">1</span> / ${rounds}</div><div class="pour-score">SCORE <strong id="pour-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="pour-arena" id="pour-arena">
        <div class="pour-source"><span></span></div><div id="pour-stream" class="pour-stream"></div>
        <div class="pour-glass-wrap">
          <div class="pour-glass">
            <div id="pour-liquid" class="pour-liquid"><i></i><b></b></div>
            <div id="pour-perfect-band" class="pour-perfect-band"></div>
            <div id="pour-target" class="pour-target"><span id="pour-target-label">70%</span></div>
            <div class="pour-glass-shine"></div>
          </div>
          <div class="pour-scale"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
        </div>
      </div>
      <div class="pour-controls">
        <div class="pour-target-card"><small>TARGET LEVEL</small><strong id="pour-target-card">70%</strong><em id="pour-speed-label">STEADY FLOW</em></div>
        <div id="pour-message" class="pour-message">GET READY</div>
        <button id="pour-pad" class="pour-pad">HOLD TO POUR<small>Press and hold · release near the line</small></button>
        <div class="pour-wait"><div id="pour-wait-fill"></div></div>
        <div id="pour-history" class="pour-history"></div>
      </div>
    </div>`;
    const roundEl=document.querySelector<HTMLElement>('#pour-round')!,scoreEl=document.querySelector<HTMLElement>('#pour-score')!,arena=document.querySelector<HTMLElement>('#pour-arena')!,stream=document.querySelector<HTMLElement>('#pour-stream')!,liquid=document.querySelector<HTMLElement>('#pour-liquid')!,band=document.querySelector<HTMLElement>('#pour-perfect-band')!,targetLine=document.querySelector<HTMLElement>('#pour-target')!,targetLabel=document.querySelector<HTMLElement>('#pour-target-label')!,targetCard=document.querySelector<HTMLElement>('#pour-target-card')!,speedLabel=document.querySelector<HTMLElement>('#pour-speed-label')!,msg=document.querySelector<HTMLElement>('#pour-message')!,pad=document.querySelector<HTMLButtonElement>('#pour-pad')!,waitFill=document.querySelector<HTMLElement>('#pour-wait-fill')!,history=document.querySelector<HTMLElement>('#pour-history')!;
    type PourResult={fill:number;kind:'released'|'no-start'|'overflow'};
    let phase:'idle'|'waiting'|'pouring'|'locked'='idle',currentFill=0,pourStarted=0,flowRate=35,resolveRound:(r:PourResult)=>void=()=>{},activePointer=-1;
    const finishPour=(kind:'released'|'overflow')=>{if(phase!=='pouring')return;phase='locked';stream.classList.remove('active');pad.classList.remove('pouring');resolveRound({fill:Math.min(100,currentFill),kind});};
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(phase!=='waiting')return;phase='pouring';activePointer=e.pointerId;try{pad.setPointerCapture(e.pointerId)}catch{}pourStarted=performance.now();pad.classList.add('pouring');pad.innerHTML='POURING…<small>Release when the liquid reaches the target</small>';msg.textContent='RELEASE AT THE LINE';stream.classList.add('active');sound.beep(520,.04);});
    const release=(e:PointerEvent)=>{if(e.pointerId!==activePointer)return;e.preventDefault();finishPour('released');};
    pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);
    await sleep(650);
    for(let round=0;round<rounds&&!this.destroyed;round++){
      roundEl.textContent=String(round+1);currentFill=0;liquid.style.height='0%';arena.className='pour-arena';stream.classList.remove('active');pad.className='pour-pad';waitFill.style.width='100%';
      const target=Math.round(48+seededUnit(this.state.seed,700+round)*36);flowRate=28+seededUnit(this.state.seed,740+round)*18;
      const bandBottom=Math.max(0,target-2.5);band.style.bottom=`${bandBottom}%`;band.style.height='5%';targetLine.style.bottom=`${target}%`;targetLabel.textContent=`${target}%`;targetCard.textContent=`${target}%`;speedLabel.textContent=flowRate<34?'GENTLE FLOW':flowRate<40?'STEADY FLOW':'FAST FLOW';
      msg.textContent='HOLD WHEN READY';pad.innerHTML='HOLD TO POUR<small>Release near the gold target line</small>';phase='waiting';activePointer=-1;
      const waitingStarted=performance.now();let noStartTimer=0;
      const roundPromise=new Promise<PourResult>(resolve=>{resolveRound=resolve;noStartTimer=window.setTimeout(()=>{if(this.destroyed||phase!=='waiting')return;phase='locked';resolve({fill:0,kind:'no-start'});},4500);this.timers.push(noStartTimer)});
      const animate=(now:number)=>{if(this.destroyed||phase==='locked'||phase==='idle')return;
        if(phase==='waiting'){const left=Math.max(0,100-(now-waitingStarted)/45);waitFill.style.width=`${left}%`;}
        else if(phase==='pouring'){currentFill=Math.min(100,(now-pourStarted)*flowRate/1000);liquid.style.height=`${currentFill}%`;waitFill.style.width=`${Math.max(0,100-currentFill)}%`;if(currentFill>=100){finishPour('overflow');return;}}
        this.raf=requestAnimationFrame(animate);
      };this.raf=requestAnimationFrame(animate);
      const result=await roundPromise;clearTimeout(noStartTimer);if(this.raf)cancelAnimationFrame(this.raf);if(this.destroyed)return;
      const error=result.kind==='no-start'?target:Math.abs(result.fill-target);const earned=result.kind==='no-start'?0:Math.max(0,Math.min(100,Math.round(100-error*4)));
      points.push(earned);errors.push(error);const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);
      let feedback='',detail='';
      if(result.kind==='no-start'){feedback='NO POUR';detail='0 points · round advanced automatically';arena.classList.add('failed');pad.classList.add('miss');pad.innerHTML='0 POINTS<small>You did not start pouring</small>';sound.beep(190,.09);}
      else if(result.kind==='overflow'){feedback='OVERFLOW!';detail=`${Math.round(error)}% over target · ${earned} points`;arena.classList.add('overflow');pad.classList.add(earned>0?'close':'miss');pad.innerHTML=`${earned} POINTS<small>The glass overflowed</small>`;sound.beep(190,.1);}
      else {const signed=result.fill-target;const abs=Math.abs(signed);feedback=earned>=96?'PERFECT POUR!':earned>=84?'GREAT POUR!':earned>=68?'GOOD POUR!':earned>=45?'CLOSE!':signed>0?'OVERPOURED':'UNDERPOURED';detail=`${Math.round(result.fill)}% fill · ${abs.toFixed(1)}% ${signed>=0?'over':'under'}`;arena.classList.add(earned>=84?'success':earned>=45?'close':'failed');pad.classList.add(earned>=84?'success':earned>=45?'close':'miss');pad.innerHTML=`${earned} POINTS<small>${abs.toFixed(1)}% from target</small>`;sound.beep(earned>=90?900:earned>=60?650:350,.07);}
      msg.innerHTML=`${feedback}<small>${detail}</small>`;history.innerHTML=points.map((value,i)=>`<span class="${value>=84?'great':value>=45?'okay':'miss'}"><b>${i+1}</b>${value}</span>`).join('');this.sendProgress(round+1,feedback,total);await sleep(1050);phase='idle';
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),avgError=errors.reduce((a,b)=>a+b,0)/errors.length,totalError=Math.round(errors.reduce((a,b)=>a+b,0)*100);this.sendResult(total,totalError,`${total} / 500 pts · ${avgError.toFixed(1)}% avg error`,points);
  }
  async runChargeShot(){
    const stage=this.stage();if(!stage)return;
    const rounds=5,maxScore=500,points:number[]=[],errors:number[]=[];
    stage.innerHTML=`<div class="charge-game">
      <div class="charge-topline"><div class="trial-label">SHOT <span id="charge-round">1</span> / ${rounds}</div><div class="charge-score">SCORE <strong id="charge-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="charge-arena" id="charge-arena">
        <div class="charge-sky-glow"></div>
        <div class="charge-distance"><span>LAUNCH</span><span>MID</span><span>FAR</span></div>
        <div class="charge-target-zone" id="charge-target-zone"><i></i><b>TARGET</b></div>
        <div class="charge-ground"></div>
        <div class="charge-launcher"><span></span></div>
        <div class="charge-rocket" id="charge-rocket">🚀</div>
        <div class="charge-landing-marker" id="charge-landing-marker"></div>
      </div>
      <div class="charge-controls">
        <div class="charge-target-card"><small>TARGET RANGE</small><strong id="charge-target-card">70</strong><em id="charge-strength-label">STANDARD LAUNCHER</em></div>
        <div id="charge-message" class="charge-message">GET READY</div>
        <div class="charge-meter"><div id="charge-meter-fill"></div><span id="charge-power">0%</span></div>
        <button id="charge-pad" class="charge-pad">HOLD TO CHARGE<small>Release to launch toward the target</small></button>
        <div class="charge-wait"><div id="charge-wait-fill"></div></div>
        <div id="charge-history" class="charge-history"></div>
      </div>
    </div>`;
    const roundEl=document.querySelector<HTMLElement>('#charge-round')!,scoreEl=document.querySelector<HTMLElement>('#charge-score')!,arena=document.querySelector<HTMLElement>('#charge-arena')!,targetZone=document.querySelector<HTMLElement>('#charge-target-zone')!,targetCard=document.querySelector<HTMLElement>('#charge-target-card')!,strengthLabel=document.querySelector<HTMLElement>('#charge-strength-label')!,msg=document.querySelector<HTMLElement>('#charge-message')!,meterFill=document.querySelector<HTMLElement>('#charge-meter-fill')!,powerEl=document.querySelector<HTMLElement>('#charge-power')!,pad=document.querySelector<HTMLButtonElement>('#charge-pad')!,waitFill=document.querySelector<HTMLElement>('#charge-wait-fill')!,rocket=document.querySelector<HTMLElement>('#charge-rocket')!,marker=document.querySelector<HTMLElement>('#charge-landing-marker')!,history=document.querySelector<HTMLElement>('#charge-history')!;
    type ShotResult={power:number;kind:'released'|'full'|'no-start'};
    let phase:'idle'|'waiting'|'charging'|'locked'='idle',chargeStarted=0,currentPower=0,chargeRate=40,resolveRound:(r:ShotResult)=>void=()=>{},activePointer=-1;
    const fire=(kind:'released'|'full')=>{if(phase!=='charging')return;phase='locked';pad.classList.remove('charging');resolveRound({power:Math.min(100,currentPower),kind});};
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(phase!=='waiting')return;phase='charging';activePointer=e.pointerId;try{pad.setPointerCapture(e.pointerId)}catch{}chargeStarted=performance.now();pad.classList.add('charging');pad.innerHTML='CHARGING…<small>Release when you think the power is right</small>';msg.textContent='RELEASE TO FIRE';sound.beep(500,.04);});
    const release=(e:PointerEvent)=>{if(e.pointerId!==activePointer)return;e.preventDefault();fire('released');};
    pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);
    await sleep(650);
    for(let round=0;round<rounds&&!this.destroyed;round++){
      roundEl.textContent=String(round+1);currentPower=0;meterFill.style.width='0%';powerEl.textContent='0%';waitFill.style.width='100%';arena.className='charge-arena';pad.className='charge-pad';rocket.style.left='7%';rocket.style.bottom='45px';rocket.style.transform='translate(-50%,0) rotate(-18deg)';marker.className='charge-landing-marker';
      const target=48+seededUnit(this.state.seed,900+round)*36;const strength=.90+seededUnit(this.state.seed,940+round)*.25;chargeRate=31+seededUnit(this.state.seed,980+round)*20;
      const targetX=7+target*.86;targetZone.style.left=`${targetX}%`;targetCard.textContent=String(Math.round(target));strengthLabel.textContent=strength<.98?'GENTLE LAUNCHER':strength<1.08?'STANDARD LAUNCHER':'BOOSTED LAUNCHER';
      msg.textContent='HOLD WHEN READY';pad.innerHTML='HOLD TO CHARGE<small>Release to launch · full charge fires automatically</small>';phase='waiting';activePointer=-1;
      const waitingStarted=performance.now();let noStartTimer=0;
      const roundPromise=new Promise<ShotResult>(resolve=>{resolveRound=resolve;noStartTimer=window.setTimeout(()=>{if(this.destroyed||phase!=='waiting')return;phase='locked';resolve({power:0,kind:'no-start'});},4500);this.timers.push(noStartTimer)});
      const animateCharge=(now:number)=>{if(this.destroyed||phase==='locked'||phase==='idle')return;
        if(phase==='waiting'){waitFill.style.width=`${Math.max(0,100-(now-waitingStarted)/45)}%`;}
        else if(phase==='charging'){currentPower=Math.min(100,(now-chargeStarted)*chargeRate/1000);meterFill.style.width=`${currentPower}%`;powerEl.textContent=`${Math.round(currentPower)}%`;rocket.style.transform=`translate(-50%,0) rotate(${-18+Math.sin(now/70)*3}deg) scale(${1+currentPower*.0015})`;if(currentPower>=100){fire('full');return;}}
        this.raf=requestAnimationFrame(animateCharge);
      };this.raf=requestAnimationFrame(animateCharge);
      const result=await roundPromise;clearTimeout(noStartTimer);if(this.raf)cancelAnimationFrame(this.raf);if(this.destroyed)return;
      const landing=result.kind==='no-start'?0:Math.min(100,result.power*strength);const landingX=7+landing*.86;const error=result.kind==='no-start'?100:Math.abs(landing-target);const earned=result.kind==='no-start'?0:Math.max(0,Math.min(100,Math.round(100-error*4)));
      if(result.kind!=='no-start'){
        const start=performance.now(),duration=720,startX=7,endX=landingX;
        await new Promise<void>(resolve=>{const fly=(now:number)=>{if(this.destroyed){resolve();return;}const t=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-t,2),x=startX+(endX-startX)*ease,y=45+Math.sin(Math.PI*t)*Math.min(150,arena.clientHeight*.48);rocket.style.left=`${x}%`;rocket.style.bottom=`${y}px`;rocket.style.transform=`translate(-50%,0) rotate(${(-18+65*t)}deg)`;if(t<1)this.raf=requestAnimationFrame(fly);else resolve();};this.raf=requestAnimationFrame(fly);});
        if(this.destroyed)return;marker.style.left=`${landingX}%`;marker.className=`charge-landing-marker show ${earned>=84?'great':earned>=45?'okay':'miss'}`;rocket.style.bottom='45px';
      }
      points.push(earned);errors.push(error);const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);
      const signed=landing-target,abs=Math.abs(signed);let feedback='',detail='';
      if(result.kind==='no-start'){feedback='NO SHOT';detail='0 points · shot advanced automatically';arena.classList.add('failed');pad.classList.add('miss');pad.innerHTML='0 POINTS<small>You did not start charging</small>';sound.beep(190,.09);}
      else {feedback=earned>=96?'BULLSEYE!':earned>=84?'GREAT SHOT!':earned>=68?'GOOD SHOT!':earned>=45?'CLOSE!':signed>0?'OVERSHOT':'FELL SHORT';detail=`Landed ${abs.toFixed(1)} range units ${signed>=0?'past':'short of'} target`;arena.classList.add(earned>=84?'success':earned>=45?'close':'failed');pad.classList.add(earned>=84?'success':earned>=45?'close':'miss');pad.innerHTML=`${earned} POINTS<small>${abs.toFixed(1)} from target${result.kind==='full'?' · auto-fired at full charge':''}</small>`;sound.beep(earned>=90?920:earned>=60?650:330,.07);}
      msg.innerHTML=`${feedback}<small>${detail}</small>`;history.innerHTML=points.map((value,i)=>`<span class="${value>=84?'great':value>=45?'okay':'miss'}"><b>${i+1}</b>${value}</span>`).join('');this.sendProgress(round+1,feedback,total);await sleep(1050);phase='idle';
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),avgError=errors.reduce((a,b)=>a+b,0)/errors.length,totalError=Math.round(errors.reduce((a,b)=>a+b,0)*100);this.sendResult(total,totalError,`${total} / 500 pts · ${avgError.toFixed(1)} avg miss`,points);
  }
  async runStack(){
    const stage=this.stage();if(!stage)return;
    const drops=8,maxScore=800,points:number[]=[],overhangs:number[]=[];
    stage.innerHTML=`<div class="stack-game">
      <div class="stack-topline"><div class="trial-label">DROP <span id="stack-round">1</span> / ${drops}</div><div class="stack-score">SCORE <strong id="stack-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="stack-arena" id="stack-arena">
        <div class="stack-sky"></div><div class="stack-grid"></div>
        <div class="stack-tower" id="stack-tower"><div class="stack-base"><span>BASE</span></div></div>
        <div class="stack-moving" id="stack-moving"><span></span></div>
        <div class="stack-slice" id="stack-slice"></div>
        <div class="stack-ground"></div>
      </div>
      <div class="stack-controls">
        <div class="stack-status-card"><small>ALIGNMENT</small><strong id="stack-status">GET READY</strong><em id="stack-detail">Keep as much of every block as possible</em></div>
        <button id="stack-pad" class="stack-pad">DROP BLOCK<small>Tap when the moving block is centred over the tower</small></button>
        <div class="stack-time"><div id="stack-time-fill"></div><span id="stack-time-label">6.0 s</span></div>
        <div id="stack-history" class="stack-history"></div>
      </div>
    </div>`;
    const roundEl=document.querySelector<HTMLElement>('#stack-round')!,scoreEl=document.querySelector<HTMLElement>('#stack-score')!,arena=document.querySelector<HTMLElement>('#stack-arena')!,tower=document.querySelector<HTMLElement>('#stack-tower')!,moving=document.querySelector<HTMLElement>('#stack-moving')!,slice=document.querySelector<HTMLElement>('#stack-slice')!,status=document.querySelector<HTMLElement>('#stack-status')!,detail=document.querySelector<HTMLElement>('#stack-detail')!,pad=document.querySelector<HTMLButtonElement>('#stack-pad')!,timeFill=document.querySelector<HTMLElement>('#stack-time-fill')!,timeLabel=document.querySelector<HTMLElement>('#stack-time-label')!,history=document.querySelector<HTMLElement>('#stack-history')!;
    type DropResult={left:number;timedOut:boolean};
    let phase:'idle'|'running'|'locked'='idle',currentWidth=49.6,topLeft=25.2,resolveDrop:(r:DropResult)=>void=()=>{},movingLeft=25.2;
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(phase!=='running')return;phase='locked';resolveDrop({left:movingLeft,timedOut:false});sound.beep(780,.05)});
    await sleep(650);
    // Base width/position are percentages of the arena. Vertical spacing is
    // compressed on short landscape phones so all eight levels stay visible.
    const shortLandscape=window.innerWidth>window.innerHeight&&window.innerHeight<=520;const tinyLandscape=window.innerWidth>window.innerHeight&&window.innerHeight<=400;const firstBottom=tinyLandscape?58:shortLandscape?61:63;const blockStep=tinyLandscape?17:shortLandscape?19:22;
    const base=document.querySelector<HTMLElement>('.stack-base')!;base.style.left=`${topLeft}%`;base.style.width=`${currentWidth}%`;
    let collapsed=false;
    for(let round=0;round<drops&&!this.destroyed;round++){
      roundEl.textContent=String(round+1);status.className='';status.textContent='WATCH THE SWEEP';detail.textContent=round===0?'Build a clean foundation':'The remaining block is now your new platform';pad.className='stack-pad';pad.innerHTML='DROP BLOCK<small>Tap to place it on the tower</small>';slice.className='stack-slice';timeFill.style.width='100%';
      const blockWidth=currentWidth;const travelMin=3,travelMax=97-blockWidth;const speed=42+round*9;const startFromLeft=seededUnit(this.state.seed,1340+round)>.5;const startLeft=startFromLeft?travelMin:travelMax;const direction=startFromLeft?1:-1;
      moving.style.width=`${blockWidth}%`;moving.style.left=`${startLeft}%`;moving.style.bottom=`${firstBottom+round*blockStep}px`;moving.className='stack-moving active';moving.querySelector('span')!.textContent=round===0?'FIRST BLOCK':`BLOCK ${round+1}`;movingLeft=startLeft;phase='running';const started=performance.now();
      let timeoutId=0;const resultPromise=new Promise<DropResult>(resolve=>{resolveDrop=resolve;timeoutId=window.setTimeout(()=>{if(this.destroyed||phase!=='running')return;phase='locked';resolve({left:movingLeft,timedOut:true});},6000);this.timers.push(timeoutId)});
      const animate=(now:number)=>{if(this.destroyed||phase!=='running')return;const elapsed=(now-started)/1000;const span=Math.max(.1,travelMax-travelMin);const distance=(speed*elapsed)% (span*2);const offset=distance<=span?distance:(span*2-distance);movingLeft=startFromLeft?travelMin+offset:travelMax-offset;moving.style.left=`${movingLeft}%`;timeFill.style.width=`${Math.max(0,100-(now-started)/60)}%`;timeLabel.textContent=`${Math.max(0,6-(now-started)/1000).toFixed(1)} s`;this.raf=requestAnimationFrame(animate)};this.raf=requestAnimationFrame(animate);
      const dropped=await resultPromise;clearTimeout(timeoutId);if(this.raf)cancelAnimationFrame(this.raf);if(this.destroyed)return;movingLeft=dropped.left;
      const left=Math.max(movingLeft,topLeft),right=Math.min(movingLeft+blockWidth,topLeft+currentWidth),overlap=Math.max(0,right-left),offset=Math.abs(movingLeft-topLeft);let earned=0,perfect=false;
      if(!dropped.timedOut&&overlap>0){const snapTolerance=Math.max(.65,Math.min(1.8,currentWidth*.035));perfect=offset<=snapTolerance;earned=perfect?100:Math.max(8,Math.min(99,Math.round(100*(overlap/blockWidth))));}
      if(dropped.timedOut||overlap<=0){earned=0;collapsed=true;}
      points.push(earned);const overhangPct=dropped.timedOut?100:Math.max(0,100-overlap/blockWidth*100);overhangs.push(overhangPct);
      if(collapsed){moving.className='stack-moving dropped collapse';arena.classList.add('collapsed');status.className='bad';status.textContent=dropped.timedOut?'TIME OUT — TOWER LOST':'MISSED THE TOWER!';detail.textContent='The remaining drops score 0 automatically';pad.className='stack-pad miss';pad.innerHTML='TOWER COLLAPSED<small>Run ends automatically</small>';sound.beep(170,.12);
      }else{
        const placedLeft=perfect?topLeft:left,placedWidth=perfect?currentWidth:overlap;moving.className=`stack-moving dropped ${perfect?'perfect':''}`;moving.style.left=`${placedLeft}%`;moving.style.width=`${placedWidth}%`;
        if(!perfect&&overlap<blockWidth){const cutLeft=movingLeft<topLeft?movingLeft:left+overlap,cutWidth=blockWidth-overlap;slice.style.left=`${cutLeft}%`;slice.style.width=`${cutWidth}%`;slice.style.bottom=`${firstBottom+round*blockStep}px`;slice.className='stack-slice show';}
        const placed=document.createElement('div');placed.className=`stack-placed ${perfect?'perfect':''}`;placed.style.left=`${placedLeft}%`;placed.style.width=`${placedWidth}%`;placed.style.bottom=`${firstBottom+round*blockStep}px`;placed.innerHTML=`<span>${perfect?'PERFECT':''}</span>`;tower.appendChild(placed);
        topLeft=placedLeft;currentWidth=placedWidth;
        status.className=earned>=96?'good':earned>=75?'okay':'warn';status.textContent=perfect?'PERFECT STACK!':earned>=85?'GREAT DROP!':earned>=65?'SOLID DROP':'BIG SLICE!';detail.textContent=perfect?'No width lost':`${overhangPct.toFixed(1)}% sliced away · ${currentWidth.toFixed(1)}% tower width remains`;pad.className=`stack-pad ${earned>=85?'success':earned>=60?'close':'miss'}`;pad.innerHTML=`${earned} POINTS<small>${perfect?'Perfect alignment':`${overhangPct.toFixed(1)}% overhang removed`}</small>`;sound.beep(perfect?980:earned>=75?720:430,.075);
      }
      const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);history.innerHTML=points.map((v,i)=>`<span class="${v>=90?'great':v>=60?'okay':'miss'}"><b>${i+1}</b>${v}</span>`).join('');this.sendProgress(round+1,collapsed?'TOWER COLLAPSED':status.textContent,total);await sleep(collapsed?1150:850);moving.className='stack-moving';slice.className='stack-slice';phase='idle';
      if(collapsed){while(points.length<drops){points.push(0);overhangs.push(100)}break;}
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),avgOverhang=overhangs.reduce((a,b)=>a+b,0)/Math.max(1,overhangs.length),secondary=Math.round(avgOverhang*100);this.sendResult(total,secondary,`${total} / 800 pts · ${avgOverhang.toFixed(1)}% avg overhang`,points);
  }
  async runTrace(){
    const stage=this.stage();if(!stage)return;
    const paths=3,maxScore=300,points:number[]=[],avgErrors:number[]=[],traceTimes:number[]=[];
    const x0=.07,x1=.93,sampleCount=48;
    const pathY=(round:number,t:number)=>{
      const a1=.105+seededUnit(this.state.seed,1600+round*10)*.055;
      const a2=.035+seededUnit(this.state.seed,1601+round*10)*.045;
      const f1=1.05+seededUnit(this.state.seed,1602+round*10)*.75;
      const f2=2.15+seededUnit(this.state.seed,1603+round*10)*1.15;
      const p1=seededUnit(this.state.seed,1604+round*10)*Math.PI*2;
      const p2=seededUnit(this.state.seed,1605+round*10)*Math.PI*2;
      const slope=(seededUnit(this.state.seed,1606+round*10)-.5)*.16;
      return Math.max(.16,Math.min(.84,.5+slope*(t-.5)+a1*Math.sin(Math.PI*2*f1*t+p1)+a2*Math.sin(Math.PI*2*f2*t+p2)));
    };
    const makePath=(round:number)=>{
      const coords:string[]=[];
      for(let i=0;i<=120;i++){const t=i/120,x=(x0+(x1-x0)*t)*1000,y=pathY(round,t)*500;coords.push(`${i?'L':'M'} ${x.toFixed(1)} ${y.toFixed(1)}`)}
      return coords.join(' ');
    };
    stage.innerHTML=`<div class="trace-game">
      <div class="trace-topline"><div class="trial-label">PATH <span id="trace-round">1</span> / ${paths}</div><div class="trace-score">SCORE <strong id="trace-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="trace-arena" id="trace-arena">
        <div class="trace-grid"></div>
        <svg class="trace-svg" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
          <path id="trace-corridor" class="trace-corridor" d=""></path>
          <path id="trace-route" class="trace-route" d=""></path>
          <path id="trace-progress" class="trace-progress" d="" pathLength="100"></path>
        </svg>
        <div id="trace-start" class="trace-start"><b>START</b></div>
        <div id="trace-finish" class="trace-finish"><span>★</span><b>FINISH</b></div>
        <div id="trace-cursor" class="trace-cursor"></div>
        <div id="trace-overlay" class="trace-overlay"><strong>PRESS START</strong><small>Hold and trace the glowing line to the finish</small></div>
      </div>
      <div class="trace-controls">
        <div class="trace-status-card"><small>TRACE CONTROL</small><strong id="trace-status">GET READY</strong><em id="trace-detail">Accuracy is the main score · speed adds up to a 100% multiplier</em></div>
        <div class="trace-time"><div id="trace-time-fill"></div><span id="trace-time-label">9.0 s</span></div>
        <div class="trace-tip">✋ Keep your finger / pointer down and follow the route</div>
        <div id="trace-history" class="trace-history"></div>
      </div>
    </div>`;
    const roundEl=document.querySelector<HTMLElement>('#trace-round')!,scoreEl=document.querySelector<HTMLElement>('#trace-score')!,arena=document.querySelector<HTMLElement>('#trace-arena')!,corridor=document.querySelector<SVGPathElement>('#trace-corridor')!,route=document.querySelector<SVGPathElement>('#trace-route')!,progressPath=document.querySelector<SVGPathElement>('#trace-progress')!,startDot=document.querySelector<HTMLElement>('#trace-start')!,finishDot=document.querySelector<HTMLElement>('#trace-finish')!,cursor=document.querySelector<HTMLElement>('#trace-cursor')!,overlay=document.querySelector<HTMLElement>('#trace-overlay')!,status=document.querySelector<HTMLElement>('#trace-status')!,detail=document.querySelector<HTMLElement>('#trace-detail')!,timeFill=document.querySelector<HTMLElement>('#trace-time-fill')!,timeLabel=document.querySelector<HTMLElement>('#trace-time-label')!,history=document.querySelector<HTMLElement>('#trace-history')!;
    type TraceResult={kind:'finished'|'timeout'|'no-start'};
    let round=0,phase:'idle'|'waiting'|'tracing'|'locked'='idle',activePointer=-1,lastP=0,lastNy=.5,nextSample=0,resolveRound:(r:TraceResult)=>void=()=>{},sampleErrors:number[]=[];
    let startedAt=0,currentP=0,currentNy=.5;
    const local=(e:PointerEvent)=>{const r=arena.getBoundingClientRect();return {nx:(e.clientX-r.left)/Math.max(1,r.width),ny:(e.clientY-r.top)/Math.max(1,r.height),w:r.width,h:r.height}};
    const setCursor=(p:number,ny:number)=>{const nx=x0+(x1-x0)*p;cursor.style.left=`${nx*100}%`;cursor.style.top=`${ny*100}%`;currentP=p;currentNy=ny;progressPath.style.strokeDashoffset=String(Math.max(0,100-p*100));};
    const processForward=(p:number,ny:number,h:number)=>{
      p=Math.max(0,Math.min(1,p));
      if(p<=lastP+.0001){lastP=p;lastNy=ny;setCursor(p,ny);return;}
      while(nextSample<sampleCount){const sp=(nextSample+1)/sampleCount;if(sp>p+.0001)break;const ratio=Math.max(0,Math.min(1,(sp-lastP)/Math.max(.0001,p-lastP)));const sy=lastNy+(ny-lastNy)*ratio;sampleErrors.push(Math.abs(sy-pathY(round,sp))*h);nextSample++;}
      lastP=p;lastNy=ny;setCursor(p,ny);
      if(nextSample>=sampleCount&&p>=.985){phase='locked';resolveRound({kind:'finished'});sound.beep(940,.07);}
    };
    const tryStart=(e:PointerEvent)=>{if(phase!=='waiting')return;const pos=local(e),startY=pathY(round,0);if(Math.abs(pos.nx-x0)>.075||Math.abs(pos.ny-startY)>.16)return;e.preventDefault();phase='tracing';activePointer=e.pointerId;try{arena.setPointerCapture(e.pointerId)}catch{}startedAt=performance.now();lastP=0;lastNy=startY;nextSample=0;sampleErrors=[];setCursor(0,startY);cursor.classList.add('active');overlay.classList.add('hidden');status.className='';status.textContent='TRACING';detail.textContent='Stay close to the centre of the glowing route';sound.beep(620,.045);};
    arena.addEventListener('pointerdown',e=>{
      if(phase==='waiting'){tryStart(e);return;}
      if(phase!=='tracing'||activePointer!==-1)return;const pos=local(e),p=Math.max(0,Math.min(1,(pos.nx-x0)/(x1-x0)));const cursorNx=x0+(x1-x0)*currentP;if(Math.hypot((pos.nx-cursorNx)*pos.w,(pos.ny-currentNy)*pos.h)>55||p>currentP+.06)return;e.preventDefault();activePointer=e.pointerId;lastP=currentP;lastNy=currentNy;try{arena.setPointerCapture(e.pointerId)}catch{}status.textContent='TRACING';detail.textContent='Continue from the glowing cursor';
    });
    arena.addEventListener('pointermove',e=>{if(phase!=='tracing'||e.pointerId!==activePointer)return;e.preventDefault();const pos=local(e),p=(pos.nx-x0)/(x1-x0);processForward(p,pos.ny,pos.h);});
    const release=(e:PointerEvent)=>{if(e.pointerId!==activePointer)return;e.preventDefault();activePointer=-1;if(phase==='tracing'){status.textContent='TRACE PAUSED';detail.textContent='Touch the glowing cursor to continue · timer is still running';}};
    arena.addEventListener('pointerup',release);arena.addEventListener('pointercancel',release);
    await sleep(600);
    for(round=0;round<paths&&!this.destroyed;round++){
      roundEl.textContent=String(round+1);const d=makePath(round);corridor.setAttribute('d',d);route.setAttribute('d',d);progressPath.setAttribute('d',d);progressPath.style.strokeDashoffset='100';arena.className='trace-arena';cursor.className='trace-cursor';overlay.className='trace-overlay';overlay.innerHTML='<strong>PRESS START</strong><small>Hold and trace the glowing line to the finish</small>';status.className='';status.textContent='PRESS START';detail.textContent='Follow the entire path — cutting across loses accuracy';timeFill.style.width='100%';timeLabel.textContent='9.0 s';activePointer=-1;sampleErrors=[];nextSample=0;currentP=0;currentNy=pathY(round,0);lastP=0;lastNy=currentNy;setCursor(0,currentNy);
      const startY=pathY(round,0),finishY=pathY(round,1);startDot.style.left=`${x0*100}%`;startDot.style.top=`${startY*100}%`;finishDot.style.left=`${x1*100}%`;finishDot.style.top=`${finishY*100}%`;phase='waiting';const waitStarted=performance.now();let noStartTimer=0,traceTimer=0;
      const resultPromise=new Promise<TraceResult>(resolve=>{resolveRound=resolve;noStartTimer=window.setTimeout(()=>{if(this.destroyed||phase!=='waiting')return;phase='locked';resolve({kind:'no-start'});},4000);this.timers.push(noStartTimer)});
      const animate=(now:number)=>{if(this.destroyed||phase==='locked'||phase==='idle')return;if(phase==='waiting'){const left=Math.max(0,100-(now-waitStarted)/40);timeFill.style.width=`${left}%`;timeLabel.textContent=`START ${(Math.max(0,4-(now-waitStarted)/1000)).toFixed(1)} s`;}else if(phase==='tracing'){const elapsed=now-startedAt,left=Math.max(0,100-elapsed/90);timeFill.style.width=`${left}%`;timeLabel.textContent=`${Math.max(0,9-elapsed/1000).toFixed(1)} s`;if(elapsed>=9000){phase='locked';resolveRound({kind:'timeout'});return;}}this.raf=requestAnimationFrame(animate)};this.raf=requestAnimationFrame(animate);
      const result=await resultPromise;clearTimeout(noStartTimer);clearTimeout(traceTimer);if(this.raf)cancelAnimationFrame(this.raf);if(this.destroyed)return;activePointer=-1;
      const missing=Math.max(0,sampleCount-sampleErrors.length),fallbackError=Math.max(54,arena.clientHeight*.20);const allErrors=[...sampleErrors,...Array.from({length:missing},()=>fallbackError)];const avgError=allErrors.reduce((a,b)=>a+b,0)/sampleCount;const completion=sampleErrors.length/sampleCount;const elapsedMs=result.kind==='no-start'?9000:Math.min(9000,Math.max(0,performance.now()-startedAt));let accuracyScore=result.kind==='no-start'?0:Math.max(0,Math.min(100,Math.round(100-Math.max(0,avgError-4)*1.45)));if(result.kind==='timeout')accuracyScore=Math.round(accuracyScore*(.45+.55*completion));const speedMultiplier=result.kind==='no-start'?0:Math.max(.85,Math.min(1,1-Math.max(0,elapsedMs-3000)/6000*.15));const earned=result.kind==='no-start'?0:Math.round(accuracyScore*speedMultiplier);points.push(earned);avgErrors.push(avgError);traceTimes.push(elapsedMs);const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);
      const speedPct=Math.round(speedMultiplier*100);const elapsedText=`${(elapsedMs/1000).toFixed(2)} s`;let feedback='';if(result.kind==='no-start'){feedback='NO TRACE';status.className='bad';status.textContent='NO START — 0 POINTS';detail.textContent='The next path loads automatically';arena.classList.add('failed');sound.beep(180,.09);}else if(result.kind==='timeout'){feedback='TIME OUT';status.className=earned>=65?'okay':'bad';status.textContent=`TIME OUT — ${earned} POINTS`;detail.textContent=`${Math.round(completion*100)}% completed · ${avgError.toFixed(1)} px avg · ${speedPct}% speed`;arena.classList.add(earned>=65?'okay':'failed');sound.beep(earned>=65?560:220,.08);}else{feedback=earned>=96?'LASER PRECISE!':earned>=86?'EXCELLENT TRACE!':earned>=72?'GREAT TRACE!':earned>=55?'SOLID TRACE!':'WIDE TRACE';status.className=earned>=86?'good':earned>=60?'okay':'warn';status.textContent=`${feedback} — ${earned} PTS`;detail.textContent=`${avgError.toFixed(1)} px avg · ${elapsedText} · ${speedPct}% speed multiplier`;arena.classList.add(earned>=86?'success':earned>=55?'okay':'failed');sound.beep(earned>=95?980:earned>=75?760:earned>=55?520:300,.075);}
      overlay.classList.remove('hidden');overlay.innerHTML=result.kind==='no-start'?`<strong>NO TRACE</strong><small>0 points · no trace started</small>`:`<strong>${result.kind==='finished'?'PATH COMPLETE':feedback}</strong><small>${earned} pts · accuracy ${accuracyScore}/100 × speed ${speedPct}% · ${elapsedText}</small>`;history.innerHTML=points.map((v,i)=>`<span class="${v>=86?'great':v>=55?'okay':'miss'}"><b>${i+1}</b>${v}</span>`).join('');this.sendProgress(round+1,result.kind==='finished'?feedback:result.kind==='no-start'?'NO TRACE':'TIME OUT',total);await sleep(1050);phase='idle';
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),overallError=avgErrors.reduce((a,b)=>a+b,0)/Math.max(1,avgErrors.length),avgTime=traceTimes.reduce((a,b)=>a+b,0)/Math.max(1,traceTimes.length),secondary=Math.min(50000,Math.round(avgErrors.reduce((a,b)=>a+b,0)*100));this.sendResult(total,secondary,`${total} / 300 pts · ${overallError.toFixed(1)} px avg · ${(avgTime/1000).toFixed(2)} s avg`,points);
  }
  async runRicochet(){
    const stage=this.stage();if(!stage)return;
    const shootoutRound=Math.max(0,Math.round(this.state.ricochetRound??0));
    const shieldScale=Math.pow(.8,shootoutRound);
    stage.innerHTML=`<div class="rico-game">
      <div class="rico-topline"><div class="trial-label">${shootoutRound?`SHOOTOUT ${shootoutRound} <span>·</span> SHIELD ${Math.round((1-shieldScale)*100)}% SMALLER`:`ONE SHOT <span>·</span> RICOCHET`}</div><div class="rico-score">SCORE <strong id="rico-score">—</strong><small>/ 1000</small></div></div>
      <div id="rico-arena" class="rico-arena"><canvas id="rico-canvas"></canvas></div>
      <div class="rico-controls">
        <div class="rico-status-card"><small id="rico-kicker">AIM THE BANK</small><strong id="rico-status">DRAG TO AIM</strong><em id="rico-detail">${shootoutRound?`Draw — shield is now ${Math.round(shieldScale*100)}% of its original length`:`Aim the bank while the launcher moves vertically`}</em></div>
        <div class="rico-angle"><span>AIM</span><strong id="rico-angle">0°</strong><small>Arrow and shot now share the exact same angle</small></div>
        <button id="rico-fire" class="rico-fire">FIRE SHOT<small>One chance · make the bank count</small></button>
        <div class="rico-time"><div id="rico-time-fill"></div><span id="rico-time-label">12.0 s</span></div>
        <div class="rico-tip">${shootoutRound?`🔥 SHOOTOUT ${shootoutRound} · smaller shield · another one-shot chance`:`💥 Aim the bank · time the moving launcher height · one shot only`}</div>
      </div>
    </div>`;
    const arena=document.querySelector<HTMLElement>('#rico-arena')!,canvas=document.querySelector<HTMLCanvasElement>('#rico-canvas')!,ctx=canvas.getContext('2d')!,scoreEl=document.querySelector<HTMLElement>('#rico-score')!,kicker=document.querySelector<HTMLElement>('#rico-kicker')!,status=document.querySelector<HTMLElement>('#rico-status')!,detail=document.querySelector<HTMLElement>('#rico-detail')!,angleEl=document.querySelector<HTMLElement>('#rico-angle')!,fireBtn=document.querySelector<HTMLButtonElement>('#rico-fire')!,timeFill=document.querySelector<HTMLElement>('#rico-time-fill')!,timeLabel=document.querySelector<HTMLElement>('#rico-time-label')!;
    type P={x:number;y:number};
    const ballRadius=.014,bankBottom=seededUnit(this.state.seed,1600)>.5;
    const launchCenterY=bankBottom?.24+seededUnit(this.state.seed,1601)*.13:.76-seededUnit(this.state.seed,1601)*.13;
    const launchRange=.075+seededUnit(this.state.seed,1605)*.035;
    const launchPeriod=2500+seededUnit(this.state.seed,1606)*900;
    const launchPhase=seededUnit(this.state.seed,1607)*Math.PI*2;
    const start:P={x:.09,y:launchCenterY};
    const target:P={x:.86,y:bankBottom?.22+seededUnit(this.state.seed,1602)*.16:.78-seededUnit(this.state.seed,1602)*.16};
    const bounceLine=bankBottom?1-ballRadius:ballRadius,mirrorY=2*bounceLine-target.y,idealDy=mirrorY-launchCenterY,idealDx=target.x-start.x;
    const bounceT=(bounceLine-start.y)/idealDy,bounceX=start.x+idealDx*bounceT;
    const shieldX=Math.max(.39,Math.min(.60,bounceX+.055+seededUnit(this.state.seed,1603)*.035));
    const baseShieldEdge=bankBottom?.72+seededUnit(this.state.seed,1604)*.05:.28-seededUnit(this.state.seed,1604)*.05;
    // Each tied score shortens the shield to 80% of its previous length.
    const shieldEdge=bankBottom?baseShieldEdge*shieldScale:1-(1-baseShieldEdge)*shieldScale;
    let aimAngle=0,phase:'aiming'|'flying'|'done'='aiming',activePointer=-1,trail:P[]=[];
    let ball:P={...start},firedStart:P={...start},vx=0,vy=0,bounces=0,blocked=false,minDist=Infinity,flightMs=0;
    const launchMotionStarted=performance.now();
    const launcherYAt=(now:number)=>Math.max(.13,Math.min(.87,launchCenterY+Math.sin(launchPhase+(now-launchMotionStarted)/launchPeriod*Math.PI*2)*launchRange));
    const size=()=>{const r=arena.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(280,Math.round(r.width)),h=Math.max(170,Math.round(r.height));if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(dpr,0,0,dpr,0,0);}return{w,h};};
    const distToSegment=(a:P,b:P,p:P,w:number,h:number)=>{const ax=a.x*w,ay=a.y*h,bx=b.x*w,by=b.y*h,px=p.x*w,py=p.y*h,dx=bx-ax,dy=by-ay,d2=dx*dx+dy*dy;if(d2<.0001)return Math.hypot(px-ax,py-ay);const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/d2)),qx=ax+t*dx,qy=ay+t*dy;return Math.hypot(px-qx,py-qy);};
    const draw=()=>{const {w,h}=size();ctx.clearRect(0,0,w,h);const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#0b1838');grad.addColorStop(1,'#050b20');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(80,210,255,.06)';ctx.lineWidth=1;for(let x=0;x<w;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
      ctx.strokeStyle='#5a718f';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(7,5);ctx.lineTo(w-7,5);ctx.moveTo(7,h-5);ctx.lineTo(w-7,h-5);ctx.stroke();ctx.strokeStyle='rgba(78,231,255,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,10);ctx.lineTo(w-7,10);ctx.moveTo(7,h-10);ctx.lineTo(w-7,h-10);ctx.stroke();
      const sx=shieldX*w,edge=shieldEdge*h;ctx.fillStyle='rgba(255,72,121,.2)';ctx.strokeStyle='#ff527f';ctx.lineWidth=2;if(bankBottom){ctx.fillRect(sx-8,0,16,edge);ctx.strokeRect(sx-8,0,16,edge)}else{ctx.fillRect(sx-8,edge,16,h-edge);ctx.strokeRect(sx-8,edge,16,h-edge)}ctx.save();ctx.translate(sx+(bankBottom?18:-18),bankBottom?edge*.52:edge+(h-edge)*.48);ctx.rotate(-Math.PI/2);ctx.fillStyle='#ff8aaa';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.fillText('SHIELD',0,0);ctx.restore();
      const tx=target.x*w,ty=target.y*h;for(const [rr,col] of [[36,'rgba(255,211,77,.16)'],[25,'rgba(255,211,77,.28)'],[14,'rgba(255,211,77,.5)']] as [number,string][]){ctx.beginPath();ctx.arc(tx,ty,rr,0,Math.PI*2);ctx.fillStyle=col;ctx.fill()}ctx.beginPath();ctx.arc(tx,ty,7,0,Math.PI*2);ctx.fillStyle='#fff1a6';ctx.fill();ctx.strokeStyle='#ffd34d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(tx-44,ty);ctx.lineTo(tx+44,ty);ctx.moveTo(tx,ty-44);ctx.lineTo(tx,ty+44);ctx.stroke();ctx.fillStyle='#ffe47c';ctx.font='800 9px system-ui';ctx.textAlign='center';ctx.fillText('TARGET',tx,Math.max(14,ty-48));
      if(trail.length>1){ctx.beginPath();ctx.moveTo(trail[0].x*w,trail[0].y*h);for(let i=1;i<trail.length;i++)ctx.lineTo(trail[i].x*w,trail[i].y*h);ctx.strokeStyle='rgba(83,239,255,.8)';ctx.lineWidth=3;ctx.shadowColor='#4ee7ff';ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;}
      const bx=ball.x*w,by=ball.y*h;if(phase==='aiming'){const len=Math.min(w,h)*.24,dx=Math.cos(aimAngle)*len,dy=Math.sin(aimAngle)*len;ctx.setLineDash([8,7]);ctx.beginPath();ctx.moveTo(start.x*w,start.y*h);ctx.lineTo(start.x*w+dx,start.y*h+dy);ctx.strokeStyle='#72efff';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(start.x*w+dx,start.y*h+dy);ctx.lineTo(start.x*w+dx-Math.cos(aimAngle-.55)*13,start.y*h+dy-Math.sin(aimAngle-.55)*13);ctx.moveTo(start.x*w+dx,start.y*h+dy);ctx.lineTo(start.x*w+dx-Math.cos(aimAngle+.55)*13,start.y*h+dy-Math.sin(aimAngle+.55)*13);ctx.stroke();}
      const launchMin=Math.max(.13,launchCenterY-launchRange)*h,launchMax=Math.min(.87,launchCenterY+launchRange)*h,launchX=start.x*w;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(launchX,launchMin);ctx.lineTo(launchX,launchMax);ctx.strokeStyle='rgba(98,234,255,.28)';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(143,234,255,.78)';ctx.font='700 7px system-ui';ctx.textAlign='left';ctx.fillText('MOVING LAUNCH',launchX+24,Math.max(12,launchMin-7));
      ctx.beginPath();ctx.arc(bx,by,10,0,Math.PI*2);ctx.fillStyle=blocked?'#ff5474':'#f6fbff';ctx.shadowColor=blocked?'#ff5474':'#4ee7ff';ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=blocked?'#ffd1da':'#62eaff';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.arc(start.x*w,start.y*h,19,0,Math.PI*2);ctx.strokeStyle='rgba(98,234,255,.55)';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(start.x*w,start.y*h,24,0,Math.PI*2);ctx.strokeStyle='rgba(98,234,255,.14)';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#8feaff';ctx.font='800 8px system-ui';ctx.textAlign='left';ctx.fillText('LAUNCH',start.x*w+24,start.y*h+3);
      const gapY=(bankBottom?shieldEdge+.08:shieldEdge-.08)*h;ctx.fillStyle='rgba(102,255,191,.9)';ctx.font='800 8px system-ui';ctx.textAlign='center';ctx.fillText('BANK ROUTE',sx,Math.max(14,Math.min(h-9,gapY)));
    };
    const updateAim=(e:PointerEvent)=>{if(phase!=='aiming')return;const r=arena.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,launchPx=start.x*r.width,launchPy=start.y*r.height,dx=px-launchPx,dy=py-launchPy;if(dx<=12)return;aimAngle=Math.max(-1.37,Math.min(1.37,Math.atan2(dy,dx)));angleEl.textContent=`${Math.round(Math.abs(aimAngle*180/Math.PI))}° ${aimAngle<0?'UP':'DOWN'}`;draw();};
    arena.addEventListener('pointerdown',e=>{if(phase!=='aiming')return;e.preventDefault();activePointer=e.pointerId;try{arena.setPointerCapture(e.pointerId)}catch{}updateAim(e)});arena.addEventListener('pointermove',e=>{if(e.pointerId===activePointer)updateAim(e)});const releaseAim=(e:PointerEvent)=>{if(e.pointerId===activePointer)activePointer=-1};arena.addEventListener('pointerup',releaseAim);arena.addEventListener('pointercancel',releaseAim);
    draw();await sleep(450);if(this.destroyed)return;
    let resolveFire:(timedOut:boolean)=>void=()=>{};const firePromise=new Promise<boolean>(r=>resolveFire=r);const fire=(timedOut:boolean)=>{if(phase!=='aiming')return;const now=performance.now();start.y=launcherYAt(now);ball={...start};firedStart={...start};phase='flying';activePointer=-1;resolveFire(timedOut);};fireBtn.addEventListener('pointerdown',e=>{e.preventDefault();fire(false)});
    const aimStarted=performance.now();const aimTimeout=window.setTimeout(()=>fire(true),12000);this.timers.push(aimTimeout);const aimTick=(now:number)=>{if(this.destroyed||phase!=='aiming')return;start.y=launcherYAt(now);ball={...start};const elapsed=now-aimStarted,left=Math.max(0,12000-elapsed);timeFill.style.width=`${left/120}%`;timeLabel.textContent=`${(left/1000).toFixed(1)} s`;draw();this.raf=requestAnimationFrame(aimTick)};this.raf=requestAnimationFrame(aimTick);
    const timedOut=await firePromise;clearTimeout(aimTimeout);if(this.raf)cancelAnimationFrame(this.raf);if(this.destroyed)return;kicker.textContent='SHOT AWAY';status.textContent=timedOut?'AUTO-FIRED':'RICOCHET IN MOTION';detail.textContent=timedOut?'Aim time expired — current angle fired':'No more control · watch the bank';fireBtn.disabled=true;fireBtn.innerHTML='SHOT FIRED<small>One shot only</small>';fireBtn.classList.add('fired');timeFill.style.width='100%';timeLabel.textContent='IN FLIGHT';sound.beep(820,.07);this.sendProgress(1,'SHOT FIRED',0);
    const launchSize=size(),speed=.76;vx=Math.cos(aimAngle)*speed;vy=Math.sin(aimAngle)*speed*(launchSize.w/launchSize.h);ball={...firedStart};start.y=firedStart.y;trail=[{...ball}];minDist=Infinity;bounces=0;blocked=false;const flightStart=performance.now();let last=flightStart;
    const finish=await new Promise<'done'|'blocked'>(resolve=>{const step=(now:number)=>{if(this.destroyed)return;const dt=Math.min(.028,Math.max(.001,(now-last)/1000));last=now;const before={...ball};let nx=ball.x+vx*dt,ny=ball.y+vy*dt;const rad=ballRadius;
        if(ny<rad){ny=rad+(rad-ny);vy=Math.abs(vy);bounces++;sound.beep(520,.025)}else if(ny>1-rad){ny=(1-rad)-Math.abs(ny-(1-rad));vy=-Math.abs(vy);bounces++;sound.beep(520,.025)}
        if(nx>1-rad){nx=(1-rad)-Math.abs(nx-(1-rad));vx=-Math.abs(vx);bounces++;sound.beep(440,.025)}else if(nx<rad&&now-flightStart>350){nx=rad+(rad-nx);vx=Math.abs(vx);bounces++;}
        const crossed=(before.x<shieldX&&nx>=shieldX)||(before.x>shieldX&&nx<=shieldX);if(crossed){const t=(shieldX-before.x)/((nx-before.x)||.000001),yc=before.y+(ny-before.y)*t;const inShield=bankBottom?yc<=shieldEdge:yc>=shieldEdge;if(inShield){ball={x:shieldX,y:yc};blocked=true;trail.push({...ball});draw();resolve('blocked');return;}}
        ball={x:nx,y:ny};trail.push({...ball});if(trail.length>260)trail.shift();const {w,h}=size();minDist=Math.min(minDist,distToSegment(before,ball,target,w,h));flightMs=now-flightStart;draw();if((vx>0&&ball.x>=.95)||minDist<=Math.max(6,h*.014)||flightMs>=5600||bounces>=7){resolve('done');return;}this.raf=requestAnimationFrame(step)};this.raf=requestAnimationFrame(step)});if(this.raf)cancelAnimationFrame(this.raf);if(this.destroyed)return;phase='done';const {h}=size();const missPx=Number.isFinite(minDist)?minDist:h*.8;let score=blocked?0:Math.round(1000*Math.pow(Math.max(0,1-missPx/(h*.34)),1.28));if(missPx<=Math.max(7,h*.018)&&!blocked)score=1000;score=Math.max(0,Math.min(1000,score));scoreEl.textContent=String(score);const secondary=blocked?100000:Math.min(99999,Math.round(missPx*100));let feedback='';if(blocked){feedback='BLOCKED BY SHIELD';status.className='bad';sound.beep(170,.13)}else if(score>=970){feedback='BULLSEYE!';status.className='good';sound.beep(980,.12)}else if(score>=820){feedback='BRILLIANT BANK!';status.className='good';sound.beep(840,.1)}else if(score>=620){feedback='GREAT RICOCHET';status.className='okay';sound.beep(680,.09)}else if(score>=350){feedback='CLOSE BANK';status.className='warn';sound.beep(440,.08)}else{feedback='WIDE MISS';status.className='bad';sound.beep(240,.09)}status.textContent=`${feedback} — ${score} PTS`;kicker.textContent='SHOT RESULT';detail.textContent=blocked?'The direct route hit the shield':`${Math.round(missPx)} px closest approach · ${bounces} bounce${bounces===1?'':'s'}`;fireBtn.classList.toggle('success',score>=820);fireBtn.classList.toggle('miss',score<350);fireBtn.innerHTML=`${score} POINTS<small>${blocked?'Shield blocked the shot':`${Math.round(missPx)} px from bullseye · ${bounces} bounce${bounces===1?'':'s'}`}</small>`;timeLabel.textContent=`${(flightMs/1000).toFixed(1)} s flight`;timeFill.style.width='0%';this.sendProgress(1,feedback,score);await sleep(1450);if(this.destroyed)return;this.sendResult(score,secondary,blocked?`0 / 1000 pts · shield blocked${shootoutRound?` · shootout ${shootoutRound}`:''}`:`${score} / 1000 pts · ${Math.round(missPx)} px miss · ${bounces} bounce${bounces===1?'':'s'}${shootoutRound?` · shootout ${shootoutRound}`:''}`,[score]);
  }
  async runKnifeWheel(){
    const stage=this.stage();if(!stage)return;
    const throws=10,maxScore=1000,collisionDeg=8;
    const points:number[]=[],quality:number[]=[];
    stage.innerHTML=`<div class="knife-game">
      <div class="knife-topline"><div class="trial-label">KNIFE <span id="knife-round">1</span> / ${throws}</div><div class="knife-score">SCORE <strong id="knife-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="knife-arena"><canvas id="knife-canvas"></canvas></div>
      <div class="knife-controls">
        <div class="knife-status-card"><small>TIMING + SPACE</small><strong id="knife-status">WATCH THE GAPS</strong><em id="knife-detail">Tap when the bottom of the wheel is clear</em></div>
        <button id="knife-throw" class="knife-throw">THROW KNIFE<small>One tap · judge the spinning gap</small></button>
        <div class="knife-time"><div id="knife-time-fill"></div><span id="knife-time-label">4.5 s</span></div>
        <div class="knife-tip">🔪 Embedded knives stay on the wheel · every success makes the next throw tighter</div>
        <div id="knife-history" class="knife-history"></div>
      </div>
    </div>`;
    const canvas=document.querySelector<HTMLCanvasElement>('#knife-canvas')!,ctx=canvas.getContext('2d')!,arena=document.querySelector<HTMLElement>('.knife-arena')!,roundEl=document.querySelector<HTMLElement>('#knife-round')!,scoreEl=document.querySelector<HTMLElement>('#knife-score')!,status=document.querySelector<HTMLElement>('#knife-status')!,detail=document.querySelector<HTMLElement>('#knife-detail')!,throwBtn=document.querySelector<HTMLButtonElement>('#knife-throw')!,timeFill=document.querySelector<HTMLElement>('#knife-time-fill')!,timeLabel=document.querySelector<HTMLElement>('#knife-time-label')!,history=document.querySelector<HTMLElement>('#knife-history')!;
    type Flight={active:boolean;progress:number;hit:boolean};
    let rotation=seededUnit(this.state.seed,2100)*360,lastFrame=performance.now(),speed=0,phase:'idle'|'ready'|'flying'|'locked'='idle',resolveThrow:(v:'throw'|'timeout')=>void=()=>{},flight:Flight={active:false,progress:0,hit:false};
    // Three evenly distributed starter knives with small seeded offsets. This
    // gives every player the same readable opening board without huge empty arcs.
    const embedded:number[]=[
      (18+(seededUnit(this.state.seed,2110)-.5)*22+360)%360,
      (138+(seededUnit(this.state.seed,2111)-.5)*22+360)%360,
      (258+(seededUnit(this.state.seed,2112)-.5)*22+360)%360,
    ];
    const size=()=>{const r=arena.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(260,Math.round(r.width)),h=Math.max(190,Math.round(r.height));if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(dpr,0,0,dpr,0,0);}return{w,h};};
    const drawKnife=(cx:number,cy:number,r:number,worldDeg:number,thrown=false)=>{const a=(worldDeg-90)*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),tipX=cx+ux*(r-3),tipY=cy+uy*(r-3),handleX=cx+ux*(r+36),handleY=cy+uy*(r+36);ctx.save();ctx.lineCap='round';ctx.strokeStyle=thrown?'#fff7d2':'#dfeaff';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(handleX,handleY);ctx.stroke();ctx.strokeStyle=thrown?'#ffd34d':'#9faed0';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(cx+ux*(r+25),cy+uy*(r+25));ctx.lineTo(handleX,handleY);ctx.stroke();ctx.strokeStyle='#ff4e9e';ctx.lineWidth=3;const px=-uy,py=ux;ctx.beginPath();ctx.moveTo(cx+ux*(r+20)+px*8,cy+uy*(r+20)+py*8);ctx.lineTo(cx+ux*(r+20)-px*8,cy+uy*(r+20)-py*8);ctx.stroke();ctx.restore();};
    const draw=()=>{const {w,h}=size();ctx.clearRect(0,0,w,h);const bg=ctx.createRadialGradient(w*.48,h*.46,20,w*.48,h*.46,Math.max(w,h)*.6);bg.addColorStop(0,'#14214a');bg.addColorStop(1,'#050a20');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(78,231,255,.06)';ctx.lineWidth=1;for(let x=0;x<w;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
      const cx=w*.50,cy=h*.45,r=Math.min(w*.245,h*.32);ctx.beginPath();ctx.arc(cx,cy,r+11,0,Math.PI*2);ctx.fillStyle='rgba(5,10,28,.88)';ctx.fill();ctx.strokeStyle='#334b78';ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);const wheel=ctx.createRadialGradient(cx-r*.28,cy-r*.32,8,cx,cy,r);wheel.addColorStop(0,'#4a5d86');wheel.addColorStop(.42,'#222d50');wheel.addColorStop(1,'#10172e');ctx.fillStyle=wheel;ctx.fill();ctx.strokeStyle='#75e8ff';ctx.lineWidth=3;ctx.stroke();
      // Wheel spokes make the rotation readable without giving away safe gaps.
      ctx.save();ctx.translate(cx,cy);ctx.rotate(rotation*Math.PI/180);ctx.strokeStyle='rgba(123,164,211,.22)';ctx.lineWidth=3;for(let i=0;i<8;i++){ctx.rotate(Math.PI/4);ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(r-18,0);ctx.stroke()}ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fillStyle='#0c1430';ctx.fill();ctx.strokeStyle='#4ee7ff';ctx.lineWidth=2;ctx.stroke();ctx.restore();
      for(const localAngle of embedded)drawKnife(cx,cy,r,(localAngle+rotation)%360);
      // Contact marker at the bottom of the wheel: all thrown knives enter here.
      const contactY=cy+r;ctx.beginPath();ctx.arc(cx,contactY,7,0,Math.PI*2);ctx.fillStyle='#68ffc0';ctx.shadowColor='#68ffc0';ctx.shadowBlur=16;ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#82ffca';ctx.font='800 8px system-ui';ctx.textAlign='center';ctx.fillText('IMPACT',cx,contactY-13);
      const startY=h-24,knifeY=flight.active?startY-(startY-contactY)*Math.min(1,flight.progress):startY;ctx.save();ctx.translate(cx,knifeY);ctx.rotate(0);ctx.fillStyle='#f4f8ff';ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(5,2);ctx.lineTo(-5,2);ctx.closePath();ctx.fill();ctx.fillStyle='#9daac8';ctx.fillRect(-4,2,8,25);ctx.fillStyle='#ff4e9e';ctx.fillRect(-12,5,24,4);ctx.restore();
      ctx.fillStyle='#9bb2cc';ctx.font='800 8px system-ui';ctx.textAlign='left';ctx.fillText(`${embedded.length} KNIVES ON WHEEL`,14,18);ctx.textAlign='right';ctx.fillText(`${Math.round(Math.abs(speed))}°/s`,w-14,18);
    };
    const containingGap=(angle:number)=>{const a=((angle%360)+360)%360,sorted=[...embedded].sort((x,y)=>x-y);let prev=sorted[sorted.length-1]-360,next=sorted[0]+360;for(const v of sorted){if(v<a&&v>prev)prev=v;if(v>a&&v<next)next=v;}const span=next-prev,centre=prev+span/2,centreDist=angularDistance(a,((centre%360)+360)%360);return{span,centreDist};};
    throwBtn.addEventListener('pointerdown',e=>{e.preventDefault();if(phase!=='ready')return;phase='locked';resolveThrow('throw');});
    await sleep(600);
    for(let i=0;i<throws&&!this.destroyed;i++){
      roundEl.textContent=String(i+1);phase='ready';flight={active:false,progress:0,hit:false};throwBtn.disabled=false;throwBtn.className='knife-throw';throwBtn.innerHTML='THROW KNIFE<small>Tap when the impact point is inside a safe gap</small>';status.className='';status.textContent='WATCH THE GAPS';detail.textContent=i<3?'Read the wheel speed and wait for a clear opening':'The gaps are shrinking — stay patient';
      // The wheel gets gradually faster. Direction occasionally reverses, but
      // the same seed gives both opponents the same speed/direction sequence.
      const base=92+i*8,jitter=(seededUnit(this.state.seed,2200+i)-.5)*14,direction=seededUnit(this.state.seed,2240+i)>.36?1:-1;speed=(base+jitter)*direction;
      const roundStart=performance.now();lastFrame=roundStart;let timer=0;const resultPromise=new Promise<'throw'|'timeout'>(resolve=>{resolveThrow=resolve;timer=window.setTimeout(()=>{if(this.destroyed||phase!=='ready')return;phase='locked';resolve('timeout');},4500);this.timers.push(timer)});
      const animate=(now:number)=>{if(this.destroyed||phase==='idle')return;const dt=Math.min(.04,Math.max(0,(now-lastFrame)/1000));lastFrame=now;rotation=((rotation+speed*dt)%360+360)%360;if(phase==='ready'){const left=Math.max(0,4500-(now-roundStart));timeFill.style.width=`${left/45}%`;timeLabel.textContent=`${(left/1000).toFixed(1)} s`;}draw();if(phase==='ready'||phase==='flying')this.raf=requestAnimationFrame(animate)};this.raf=requestAnimationFrame(animate);
      const action=await resultPromise;clearTimeout(timer);if(this.destroyed)return;
      if(action==='timeout'){
        if(this.raf)cancelAnimationFrame(this.raf);points.push(0);quality.push(180);phase='idle';throwBtn.disabled=true;throwBtn.classList.add('miss');throwBtn.innerHTML='NO THROW — 0<small>Next knife loading automatically</small>';status.className='bad';status.textContent='TIME OUT';detail.textContent='You have 4.5 seconds for each throw';history.innerHTML=points.map((v,j)=>`<span class="${v?'knife-hit':'knife-miss'}">${j+1}: ${v}</span>`).join('');this.sendProgress(i+1,'TIME OUT',points.reduce((a,b)=>a+b,0));sound.beep(170,.1);await sleep(700);continue;
      }
      phase='flying';flight={active:true,progress:0,hit:false};throwBtn.disabled=true;throwBtn.classList.add('flying');throwBtn.innerHTML='KNIFE AWAY<small>Watch the impact</small>';status.textContent='KNIFE AWAY';detail.textContent='The wheel keeps moving during the throw';const flightStart=performance.now();let flightLast=flightStart;const flightMs=90;
      await new Promise<void>(resolve=>{const fly=(now:number)=>{if(this.destroyed){resolve();return;}const dt=Math.min(.04,Math.max(0,(now-flightLast)/1000));flightLast=now;rotation=((rotation+speed*dt)%360+360)%360;flight.progress=Math.min(1,(now-flightStart)/flightMs);draw();if(flight.progress>=1){resolve();return;}this.raf=requestAnimationFrame(fly)};this.raf=requestAnimationFrame(fly)});if(this.destroyed)return;
      // Bottom impact is 180 degrees in wheel/world space. Convert it into
      // wheel-local coordinates at the exact impact frame before collision.
      const impactLocal=((180-rotation)%360+360)%360;const nearest=Math.min(...embedded.map(a=>angularDistance(impactLocal,a)));const collision=nearest<collisionDeg;let earned=0,centreDist=180;
      if(!collision){const gap=containingGap(impactLocal);centreDist=gap.centreDist;const half=Math.max(collisionDeg+1,gap.span/2);const usable=Math.max(1,half-collisionDeg);const centred=Math.max(0,Math.min(1,1-Math.max(0,centreDist-collisionDeg*.12)/usable));earned=Math.round(58+42*Math.pow(centred,.72));embedded.push(impactLocal);}
      points.push(earned);quality.push(collision?180:centreDist);const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);phase='idle';flight.active=false;timeFill.style.width='0%';timeLabel.textContent=collision?'CLASH!':`${earned} PTS`;if(collision){status.className='bad';status.textContent='CLASH! — 0 POINTS';detail.textContent=`Too close to an existing knife · ${nearest.toFixed(1)}° clearance`;throwBtn.classList.remove('flying');throwBtn.classList.add('miss');throwBtn.innerHTML='KNIFE COLLISION<small>The match continues</small>';sound.beep(150,.13);}else{const label=earned>=96?'PERFECT GAP!':earned>=86?'CLEAN THREAD!':earned>=72?'SAFE THROW':'SQUEEZED IN';status.className=earned>=86?'good':'okay';status.textContent=`${label} — ${earned} PTS`;detail.textContent=`${centreDist.toFixed(1)}° from the centre of the gap`;throwBtn.classList.remove('flying');throwBtn.classList.add('hit');throwBtn.innerHTML=`${earned} POINTS<small>Knife embedded · gap gets tighter</small>`;sound.beep(earned>=95?980:earned>=80?760:580,.08);}history.innerHTML=points.map((v,j)=>`<span class="${v?'knife-hit':'knife-miss'}">${j+1}: ${v}</span>`).join('');this.sendProgress(i+1,collision?'KNIFE COLLISION':'KNIFE EMBEDDED',total);draw();await sleep(820);
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),hits=points.filter(v=>v>0).length,secondary=Math.min(100000,Math.round(quality.reduce((a,b)=>a+b,0)*100));this.sendResult(total,secondary,`${total} / 1000 pts · ${hits}/10 knives`,points);
  }
  async runConveyorChef(){
    const stage=this.stage();if(!stage)return;
    const cuts=10,maxScore=1000,points:number[]=[],errors:number[]=[];
    const ingredients=[
      {emoji:'🥒',name:'CUCUMBER'},
      {emoji:'🥕',name:'CARROT'},
      {emoji:'🍅',name:'TOMATO'},
      {emoji:'🥖',name:'BAGUETTE'},
      {emoji:'🍆',name:'EGGPLANT'},
      {emoji:'🌽',name:'CORN'},
      {emoji:'🥔',name:'POTATO'},
      {emoji:'🧀',name:'CHEESE'}
    ];
    stage.innerHTML=`<div class="chef-game">
      <div class="chef-topline"><div class="trial-label">ORDER <span id="chef-round">1</span> / ${cuts}</div><div class="chef-score">SCORE <strong id="chef-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="chef-arena" id="chef-arena">
        <div class="chef-kitchen-bg"><span>🔥</span><span>🍳</span><span>🧂</span><span>🥣</span></div>
        <div class="chef-order-ticket"><small>HEAD CHEF SAYS</small><strong id="chef-order-name">PRECISION CUT</strong></div>
        <div class="chef-knife" id="chef-knife"><div class="chef-handle"></div><div class="chef-blade">🔪</div><div class="chef-cut-zone"></div></div>
        <div class="chef-belt"><div class="chef-belt-stripes"></div><div class="chef-rollers">${Array.from({length:9},()=>'<span></span>').join('')}</div></div>
        <div class="chef-ingredient" id="chef-ingredient"><span id="chef-food">🥒</span><div class="chef-mark" id="chef-mark"><i></i><b>CUT</b></div></div>
        <div class="chef-chop-flash" id="chef-chop-flash">CHOP!</div>
      </div>
      <div class="chef-controls">
        <div class="chef-status-card"><small>TRACK THE MARK</small><strong id="chef-status">WATCH THE CONVEYOR</strong><em id="chef-detail">Tap when the glowing line reaches the knife</em></div>
        <button id="chef-cut" class="chef-cut">CUT!<small>One tap · time the moving guide</small></button>
        <div class="chef-meter"><div id="chef-meter-fill"></div><span id="chef-meter-label">READY</span></div>
        <div class="chef-tip">👨‍🍳 The knife stays fixed — follow the marked line, not the centre of the ingredient</div>
        <div id="chef-history" class="chef-history"></div>
      </div>
    </div>`;
    const arena=document.querySelector<HTMLElement>('#chef-arena')!,roundEl=document.querySelector<HTMLElement>('#chef-round')!,scoreEl=document.querySelector<HTMLElement>('#chef-score')!,orderName=document.querySelector<HTMLElement>('#chef-order-name')!,ingredient=document.querySelector<HTMLElement>('#chef-ingredient')!,food=document.querySelector<HTMLElement>('#chef-food')!,mark=document.querySelector<HTMLElement>('#chef-mark')!,knife=document.querySelector<HTMLElement>('#chef-knife')!,status=document.querySelector<HTMLElement>('#chef-status')!,detail=document.querySelector<HTMLElement>('#chef-detail')!,cutBtn=document.querySelector<HTMLButtonElement>('#chef-cut')!,meterFill=document.querySelector<HTMLElement>('#chef-meter-fill')!,meterLabel=document.querySelector<HTMLElement>('#chef-meter-label')!,history=document.querySelector<HTMLElement>('#chef-history')!,flash=document.querySelector<HTMLElement>('#chef-chop-flash')!;
    let phase:'idle'|'ready'|'locked'='idle',resolveCut:(v:'cut'|'timeout')=>void=()=>{},targetAt=0,currentMarkX=0,knifeX=0,roundStart=0,roundLimitMs=0,activeRoundToken=0;
    const scoreForError=(errorMs:number)=>Math.max(0,Math.min(100,Math.round(100*Math.exp(-Math.pow(errorMs/210,1.35)))));
    const doCut=()=>{if(phase!=='ready')return;phase='locked';resolveCut('cut');};
    cutBtn.addEventListener('pointerdown',e=>{e.preventDefault();doCut();});
    await sleep(550);
    for(let i=0;i<cuts&&!this.destroyed;i++){
      const spec=ingredients[Math.floor(seededUnit(this.state.seed,2700+i)*ingredients.length)%ingredients.length];
      const markFrac=.27+seededUnit(this.state.seed,2740+i)*.46;
      const width=Math.max(88,Math.min(142,arena.clientWidth*.22));
      const startMarkX=arena.clientWidth+Math.max(30,width*.42);
      knifeX=Math.max(120,Math.min(arena.clientWidth-110,arena.clientWidth*.43));
      const travelMs=Math.max(1120,Math.round(2050-i*78+(seededUnit(this.state.seed,2780+i)-.5)*230));
      const speed=(startMarkX-knifeX)/(travelMs/1000);
      const missAfterMs=680;
      roundLimitMs=travelMs+missAfterMs;
      roundStart=performance.now();targetAt=roundStart+travelMs;currentMarkX=startMarkX;
      roundEl.textContent=String(i+1);orderName.textContent=`${spec.name} · CUT ${Math.round(markFrac*100)}%`;food.textContent=spec.emoji;
      ingredient.style.width=`${width}px`;mark.style.left=`${markFrac*100}%`;knife.style.left=`${knifeX}px`;flash.style.left=`${knifeX}px`;ingredient.style.transform=`translate3d(${startMarkX-width*markFrac}px,0,0)`;ingredient.className='chef-ingredient';flash.className='chef-chop-flash';
      phase='ready';cutBtn.disabled=false;cutBtn.className='chef-cut';cutBtn.innerHTML='CUT!<small>Tap when the glowing guide reaches the knife</small>';status.className='';status.textContent=i<3?'TRACK THE CUT LINE':i<7?'BELT SPEED INCREASING':'DINNER RUSH!';detail.textContent=i<3?'The knife is fixed — follow the bright mark':'Stay smooth. Near misses still earn points.';meterFill.style.width='100%';meterLabel.textContent=`BELT ${i+1}/10`;
      // Keep the timeout strictly scoped to this ingredient. Previously a cut
      // resolved the promise but left its timeout alive. That stale callback
      // could fire during a later order, see phase === 'ready', set the shared
      // phase to 'locked', and leave the CURRENT order's promise unresolved.
      // The client then appeared frozen until the server watchdog ended the
      // match. Clear every round timer as soon as that same round resolves and
      // guard the callback with a round token so an old timer can never lock a
      // newer vegetable.
      const roundToken=++activeRoundToken;
      let timeoutId=0;
      const promise=new Promise<'cut'|'timeout'>(resolve=>{
        resolveCut=resolve;
        timeoutId=window.setTimeout(()=>{
          if(this.destroyed||phase!=='ready'||roundToken!==activeRoundToken)return;
          phase='locked';
          resolve('timeout');
        },roundLimitMs);
        this.timers.push(timeoutId);
      });
      const animate=(now:number)=>{if(this.destroyed||phase!=='ready')return;const elapsed=Math.max(0,now-roundStart);currentMarkX=startMarkX-speed*(elapsed/1000);const left=currentMarkX-width*markFrac;ingredient.style.transform=`translate3d(${left}px,0,0)`;const remaining=Math.max(0,targetAt+missAfterMs-now);meterFill.style.width=`${Math.max(0,Math.min(100,remaining/roundLimitMs*100))}%`;const toTarget=targetAt-now;meterLabel.textContent=toTarget>0?`${(toTarget/1000).toFixed(1)} s TO KNIFE`:'CUT NOW';this.raf=requestAnimationFrame(animate)};this.raf=requestAnimationFrame(animate);
      const action=await promise;clearTimeout(timeoutId);if(this.destroyed)return;if(this.raf)cancelAnimationFrame(this.raf);
      cutBtn.disabled=true;phase='idle';let earned=0,errorMs=1000,feedback='MISSED ORDER',feedbackClass='bad';
      if(action==='timeout'){
        ingredient.classList.add('missed');status.textContent='MISSED THE KNIFE — 0 PTS';detail.textContent='No cut registered before the ingredient passed';cutBtn.classList.add('miss');cutBtn.innerHTML='NO CUT — 0<small>Next ingredient loading automatically</small>';meterLabel.textContent='MISSED';sound.beep(160,.12);
      }else{
        const cutAt=performance.now();errorMs=Math.abs(cutAt-targetAt);earned=scoreForError(errorMs);const signed=cutAt-targetAt;currentMarkX=knifeX-speed*(signed/1000);const left=currentMarkX-width*markFrac;ingredient.style.transform=`translate3d(${left}px,0,0)`;ingredient.classList.add('chopped');flash.classList.add('show');
        if(earned>=97){feedback='MICHELIN CUT!';feedbackClass='good';}
        else if(earned>=88){feedback='RAZOR SHARP!';feedbackClass='good';}
        else if(earned>=72){feedback='CLEAN SLICE!';feedbackClass='okay';}
        else if(earned>=50){feedback='DECENT CUT';feedbackClass='okay';}
        else if(earned>=20){feedback='ROUGH CHOP';feedbackClass='warn';}
        else{feedback='WAY OFF LINE';feedbackClass='bad';}
        const direction=errorMs<18?'dead centre':signed<0?'early':'late';status.className=feedbackClass;status.textContent=`${feedback} — ${earned} PTS`;detail.textContent=`${Math.round(errorMs)} ms ${direction==='dead centre'?'from perfect':direction}`;cutBtn.classList.add(earned>=72?'hit':earned>=20?'okay':'miss');cutBtn.innerHTML=`${earned} POINTS<small>${Math.round(errorMs)} ms from the marked line</small>`;meterLabel.textContent=`${earned} PTS`;sound.beep(earned>=97?1040:earned>=88?850:earned>=72?680:earned>=50?520:earned>=20?350:180,.08);
      }
      points.push(earned);errors.push(errorMs);const total=points.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);history.innerHTML=points.map((v,j)=>`<span class="${v>=88?'chef-perfect':v>=50?'chef-good':v>0?'chef-rough':'chef-miss'}">${j+1}: ${v}</span>`).join('');this.sendProgress(i+1,action==='timeout'?'MISSED ORDER':feedback,total);await sleep(720);
    }
    if(this.destroyed)return;const total=points.reduce((a,b)=>a+b,0),avgError=Math.round(errors.reduce((a,b)=>a+b,0)/cuts),secondary=Math.min(20000,errors.reduce((a,b)=>a+Math.min(2000,b),0));this.sendResult(total,secondary,`${total} / 1000 pts · ${avgError} ms avg error`,points);
  }
  async runPoleBalance(){
    const stage=this.stage();if(!stage)return;
    const sections=10,durationMs=18000,sectionMs=durationMs/sections,maxScore=1000;
    const rounds:number[]=[],sectionQuality=Array.from({length:sections},()=>0),sectionTime=Array.from({length:sections},()=>0),sectionStumbles=Array.from({length:sections},()=>0);
    stage.innerHTML=`<div class="pole-game">
      <div class="pole-topline"><div class="trial-label">WALK <span id="pole-section">1</span> / ${sections}</div><div class="pole-score">SCORE <strong id="pole-score">0</strong><small>/ ${maxScore}</small></div></div>
      <div class="pole-arena" id="pole-arena">
        <div class="pole-crowd"><span>👏</span><span>🎪</span><span>✨</span><span>👏</span><span>🎟️</span></div>
        <div class="pole-finish"><b>FINISH</b><i>🏁</i></div>
        <div class="pole-wire"></div>
        <div class="pole-checkpoints">${Array.from({length:sections},(_,i)=>`<span data-pole-check="${i}"></span>`).join('')}</div>
        <div class="pole-wind" id="pole-wind">GUST →</div>
        <div class="pole-performer" id="pole-performer">
          <div class="pole-stick" id="pole-stick"><span class="pole-top-weight"></span></div>
          <div class="pole-hand"></div><div class="pole-person">🤹</div><div class="pole-shadow"></div>
        </div>
        <div class="pole-stumble" id="pole-stumble">STUMBLE!</div>
      </div>
      <div class="pole-controls">
        <div class="pole-status-card"><small>KEEP IT UPRIGHT</small><strong id="pole-status">GET READY</strong><em id="pole-detail">Tiny corrections beat long holds</em></div>
        <div class="pole-angle-meter"><div class="pole-danger left"></div><div class="pole-safe"></div><div class="pole-danger right"></div><i id="pole-angle-needle"></i><span id="pole-angle-label">0°</span></div>
        <div class="pole-buttons"><button id="pole-left" class="pole-btn left">◀<strong>LEFT</strong><small>hold to push left</small></button><button id="pole-right" class="pole-btn right">▶<strong>RIGHT</strong><small>hold to push right</small></button></div>
        <div class="pole-progress"><div id="pole-progress-fill"></div><span id="pole-progress-label">STARTING…</span></div>
        <div class="pole-tip">🤹 Correct toward centre, then RELEASE — the pole keeps its momentum.</div>
        <div id="pole-history" class="pole-history"></div>
      </div>
    </div>`;
    const arena=document.querySelector<HTMLElement>('#pole-arena')!,sectionEl=document.querySelector<HTMLElement>('#pole-section')!,scoreEl=document.querySelector<HTMLElement>('#pole-score')!,performer=document.querySelector<HTMLElement>('#pole-performer')!,stick=document.querySelector<HTMLElement>('#pole-stick')!,wind=document.querySelector<HTMLElement>('#pole-wind')!,stumbleEl=document.querySelector<HTMLElement>('#pole-stumble')!,status=document.querySelector<HTMLElement>('#pole-status')!,detail=document.querySelector<HTMLElement>('#pole-detail')!,needle=document.querySelector<HTMLElement>('#pole-angle-needle')!,angleLabel=document.querySelector<HTMLElement>('#pole-angle-label')!,leftBtn=document.querySelector<HTMLButtonElement>('#pole-left')!,rightBtn=document.querySelector<HTMLButtonElement>('#pole-right')!,progressFill=document.querySelector<HTMLElement>('#pole-progress-fill')!,progressLabel=document.querySelector<HTMLElement>('#pole-progress-label')!,history=document.querySelector<HTMLElement>('#pole-history')!;
    const checkpointEls=Array.from(document.querySelectorAll<HTMLElement>('[data-pole-check]'));
    type Gust={at:number;impulse:number};const gusts:Gust[]=[];let gustAt=1450;
    for(let j=0;j<12;j++){gustAt+=1250+seededUnit(this.state.seed,5100+j)*550;if(gustAt>=durationMs-450)break;const dir=seededUnit(this.state.seed,5140+j)>.5?1:-1;const strength=3+j*.45+seededUnit(this.state.seed,5180+j)*3.5;gusts.push({at:gustAt,impulse:dir*strength});}
    let phase:'intro'|'running'|'done'='intro',leftDown=false,rightDown=false,angle=(seededUnit(this.state.seed,5000)-.5)*5,velocity=(seededUnit(this.state.seed,5001)-.5)*2,gustIndex=0,stumbles=0,totalAngleIntegral=0,totalIntegratedTime=0,nextSection=1,startAt=0,lastFrame=0,stumbleUntil=0;
    const setHeld=(side:'left'|'right',down:boolean,e?:PointerEvent)=>{e?.preventDefault();if(phase!=='running'&&down)return;if(side==='left'){leftDown=down;leftBtn.classList.toggle('held',down);}else{rightDown=down;rightBtn.classList.toggle('held',down);}};
    const bindHold=(btn:HTMLButtonElement,side:'left'|'right')=>{btn.addEventListener('pointerdown',e=>{if(phase!=='running')return;try{btn.setPointerCapture(e.pointerId)}catch{}setHeld(side,true,e)});btn.addEventListener('pointerup',e=>setHeld(side,false,e));btn.addEventListener('pointercancel',e=>setHeld(side,false,e));btn.addEventListener('lostpointercapture',()=>setHeld(side,false));};
    bindHold(leftBtn,'left');bindHold(rightBtn,'right');
    const clearControls=()=>{leftDown=false;rightDown=false;leftBtn.classList.remove('held');rightBtn.classList.remove('held')};
    const onBlur=()=>clearControls();window.addEventListener('blur',onBlur,{once:true});
    const sectionScore=(idx:number)=>{if(sectionTime[idx]<=0)return 0;const base=100*sectionQuality[idx]/sectionTime[idx];return Math.max(0,Math.min(100,Math.round(base-sectionStumbles[idx]*18)));};
    const draw=(elapsed:number)=>{
      const progress=Math.max(0,Math.min(1,elapsed/durationMs));const arenaWidth=Math.max(1,arena.clientWidth);const x=arenaWidth*(.09+.79*progress);performer.style.left=`${x}px`;stick.style.transform=`translateX(-50%) rotate(${angle.toFixed(2)}deg)`;
      const meterPct=Math.max(0,Math.min(100,50+(angle/42)*50));needle.style.left=`${meterPct}%`;angleLabel.textContent=`${angle>0?'+':''}${Math.round(angle)}°`;angleLabel.className=Math.abs(angle)<10?'safe':Math.abs(angle)<27?'warn':'danger';
      progressFill.style.width=`${progress*100}%`;progressLabel.textContent=`${Math.max(0,(durationMs-elapsed)/1000).toFixed(1)} s · ${Math.round(progress*100)}% TO FINISH`;
      performer.classList.toggle('correct-left',leftDown&&!rightDown);performer.classList.toggle('correct-right',rightDown&&!leftDown);performer.classList.toggle('stumbling',performance.now()<stumbleUntil);
      const abs=Math.abs(angle);status.className=abs<9?'good':abs<21?'okay':abs<33?'warn':'bad';status.textContent=abs<9?'STEADY!':abs<21?'CORRECT GENTLY':abs<33?'LEANING HARD!':'DANGER — CATCH IT!';detail.textContent=leftDown===rightDown?'Release between corrections to kill the swing':leftDown?'Pushing the pole LEFT': 'Pushing the pole RIGHT';
    };
    draw(0);status.textContent='GET READY';detail.textContent='The walk starts automatically';leftBtn.disabled=true;rightBtn.disabled=true;await sleep(700);if(this.destroyed)return;status.textContent='BALANCE!';detail.textContent='Use short LEFT / RIGHT holds';leftBtn.disabled=false;rightBtn.disabled=false;phase='running';startAt=performance.now();lastFrame=startAt;sound.beep(620,.06);
    await new Promise<void>(resolve=>{
      const frame=(now:number)=>{
        if(this.destroyed){resolve();return;}if(phase!=='running'){resolve();return;}
        const elapsed=Math.min(durationMs,Math.max(0,now-startAt));const rawDt=Math.max(0,(now-lastFrame)/1000);const dt=Math.min(.05,rawDt);lastFrame=now;
        while(gustIndex<gusts.length&&gusts[gustIndex].at<=elapsed){const gust=gusts[gustIndex++];velocity+=gust.impulse;wind.textContent=gust.impulse>0?'GUST →':'← GUST';wind.className=`pole-wind show ${gust.impulse>0?'right':'left'}`;const windTimer=window.setTimeout(()=>wind.classList.remove('show'),520);this.timers.push(windTimer);sound.beep(300+Math.min(260,Math.abs(gust.impulse)*22),.045);}
        const control=(rightDown?1:0)-(leftDown?1:0);const difficulty=1+.18*(elapsed/durationMs);const acceleration=1.55*difficulty*angle-.42*velocity+control*55;velocity=Math.max(-105,Math.min(105,velocity+acceleration*dt));angle+=velocity*dt;
        const sectionIdx=Math.max(0,Math.min(sections-1,Math.floor(elapsed/sectionMs)));if(Math.abs(angle)>=42){stumbles++;sectionStumbles[sectionIdx]++;const sign=angle>=0?1:-1;angle=sign*18;velocity=-sign*10;stumbleUntil=now+520;stumbleEl.textContent=`STUMBLE! −18`;stumbleEl.className='pole-stumble show';const timer=window.setTimeout(()=>stumbleEl.classList.remove('show'),520);this.timers.push(timer);sound.beep(150,.12);}
        const quality=Math.max(0,1-Math.pow(Math.abs(angle)/34,1.45));sectionQuality[sectionIdx]+=quality*dt;sectionTime[sectionIdx]+=dt;totalAngleIntegral+=Math.abs(angle)*dt;totalIntegratedTime+=dt;
        while(nextSection*sectionMs<=elapsed&&nextSection<=sections){const idx=nextSection-1;const earned=sectionScore(idx);rounds.push(earned);checkpointEls[idx]?.classList.add(earned>=85?'excellent':earned>=60?'good':earned>=30?'rough':'miss');const total=rounds.reduce((a,b)=>a+b,0);scoreEl.textContent=String(total);sectionEl.textContent=String(Math.min(sections,nextSection+1));history.innerHTML=rounds.map((v,j)=>`<span class="${v>=85?'pole-excellent':v>=60?'pole-good':v>=30?'pole-rough':'pole-miss'}">${j+1}: ${v}</span>`).join('');this.sendProgress(nextSection,earned>=85?'STEADY SECTION':sectionStumbles[idx]?'STUMBLED':'BALANCING',total);nextSection++;}
        draw(elapsed);
        if(elapsed>=durationMs){phase='done';clearControls();leftBtn.disabled=true;rightBtn.disabled=true;resolve();return;}this.raf=requestAnimationFrame(frame);
      };this.raf=requestAnimationFrame(frame);
    });
    if(this.destroyed)return;if(this.raf)cancelAnimationFrame(this.raf);
    while(rounds.length<sections){const idx=rounds.length,earned=sectionScore(idx);rounds.push(earned);checkpointEls[idx]?.classList.add(earned>=85?'excellent':earned>=60?'good':earned>=30?'rough':'miss');}
    const total=rounds.reduce((a,b)=>a+b,0),avgAngle=totalIntegratedTime>0?totalAngleIntegral/totalIntegratedTime:42,secondary=Math.min(100000,Math.round(avgAngle*1000)+stumbles*1200);
    scoreEl.textContent=String(total);progressFill.style.width='100%';progressLabel.textContent='FINISH!';status.className=total>=850?'good':total>=650?'okay':total>=400?'warn':'bad';status.textContent=total>=850?'MASTER BALANCE!':total>=650?'STRONG FINISH!':total>=400?'MADE IT!':'WOBBLY FINISH';detail.textContent=`${avgAngle.toFixed(1)}° average lean · ${stumbles} stumble${stumbles===1?'':'s'}`;performer.classList.add('finished');sound.beep(total>=850?980:total>=650?760:520,.12);await sleep(650);if(this.destroyed)return;
    this.sendResult(total,secondary,`${total} / 1000 pts · ${avgAngle.toFixed(1)}° avg · ${stumbles} stumble${stumbles===1?'':'s'}`,rounds);
  }
  async runTimeStop(){
    const targets=this.state.targets?.length?this.state.targets:[7.43,9.18,12.05];const errors:number[]=[];const timedOutRounds:boolean[]=[];const stage=this.stage();if(!stage)return;
    stage.innerHTML=`<div class="time-game"><div class="trial-label">TARGET <span id="time-round">1</span> / 3</div><div class="target-box"><small>STOP AT</small><strong id="target-time">${targets[0].toFixed(2)}</strong><em>SECONDS</em></div><div id="clock-display" class="clock-display">GET READY</div><button id="time-pad" class="time-pad">3<small>Starts automatically</small></button><div class="time-limit-note">Each target starts automatically · 20 second stop limit</div><div id="time-history" class="reaction-history"></div></div>`;
    const roundEl=document.querySelector<HTMLElement>('#time-round')!,targetEl=document.querySelector<HTMLElement>('#target-time')!,clock=document.querySelector<HTMLElement>('#clock-display')!,pad=document.querySelector<HTMLButtonElement>('#time-pad')!,history=document.querySelector<HTMLElement>('#time-history')!;
    let phase:'countdown'|'running'|'locked'='countdown',startAt=0,resolveStop:(v:{elapsedMs:number;timedOut:boolean})=>void=()=>{};
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(phase!=='running')return;phase='locked';resolveStop({elapsedMs:performance.now()-startAt,timedOut:false});sound.beep(760,.07)});
    const beginCountdown=async()=>{phase='countdown';pad.classList.remove('stop','timeout');for(const n of [3,2,1]){clock.textContent=String(n);pad.innerHTML=`${n}<small>Get ready — starts automatically</small>`;sound.beep(360+n*80,.05);await sleep(1000);if(this.destroyed)return false;}clock.textContent='0.00';pad.innerHTML='STOP<small>Tap when you reach the target · max 20 s</small>';pad.classList.add('stop');startAt=performance.now();phase='running';const animate=()=>{if(this.destroyed||phase!=='running')return;const e=performance.now()-startAt;clock.textContent=e<1000?(e/1000).toFixed(2):'?.??';this.raf=requestAnimationFrame(animate)};animate();return true;};
    for(let i=0;i<3&&!this.destroyed;i++){
      roundEl.textContent=String(i+1);targetEl.textContent=targets[i].toFixed(2);clock.textContent='GET READY';pad.classList.remove('stop','timeout');pad.innerHTML='3<small>Starts automatically</small>';
      const countdownOk=await beginCountdown();if(!countdownOk||this.destroyed)return;
      let timeoutId=0;const stopped=await new Promise<{elapsedMs:number;timedOut:boolean}>(r=>{resolveStop=r;timeoutId=window.setTimeout(()=>{if(this.destroyed||phase!=='running')return;phase='locked';resolveStop({elapsedMs:20000,timedOut:true});},20000);this.timers.push(timeoutId)});clearTimeout(timeoutId);if(this.destroyed)return;if(this.raf)cancelAnimationFrame(this.raf);
      const measured=Math.round((stopped.elapsedMs/1000)*100)/100;const err=Math.round(Math.abs(measured-targets[i])*1000);errors.push(err);timedOutRounds.push(stopped.timedOut);clock.textContent=stopped.timedOut?'TIME OUT':`${measured.toFixed(2)} s`;pad.classList.remove('stop');if(stopped.timedOut)pad.classList.add('timeout');pad.innerHTML=stopped.timedOut?`TIME OUT<small>Scored as 20.00 s · next target loading</small>`:`ERROR ${(err/1000).toFixed(2)} s<small>Target ${targets[i].toFixed(2)} s</small>`;history.innerHTML=errors.map((v,j)=>`<span class="${timedOutRounds[j]?'timed-out':''}">${j+1}: ${timedOutRounds[j]?'TIME OUT ':''}+${(v/1000).toFixed(2)} s</span>`).join('');this.sendProgress(i+1,stopped.timedOut?'TIME OUT':'TIMING ERROR',err);sound.beep(stopped.timedOut?180:err<=30?900:err<=100?650:420,.08);await sleep(1200);
    }
    if(this.destroyed)return;const total=errors.reduce((a,b)=>a+b,0),worst=Math.max(...errors),timeouts=timedOutRounds.filter(Boolean).length;this.sendResult(total,worst,`${(total/1000).toFixed(2)} s total error${timeouts?` · ${timeouts} timeout${timeouts===1?'':'s'}`:''}`,errors);
  }
}

new MinuteApp();
