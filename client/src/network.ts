export type PlayerState = { id:string; name:string; isHost:boolean; connected:boolean; points:number; isBot:boolean };
export type PrecisionResult = { score:number; secondary:number; display:string; rounds:number[]; submittedAt:number };
export type PrecisionProgress = { round:number; label:string; value?:number };
export type PrecisionState = {
  phase:'playing'|'results'; gameId:string; seed:number; targets?:number[];
  results:Record<string,PrecisionResult>; progress:Record<string,PrecisionProgress>;
  winnerId?:string; resultRevealAt?:number;
};
export type MatchState = {
  id:string; courtIndex:number; playerIds:[string,string]; status:'ready'|'countdown'|'playing'|'complete';
  startsAt?:number; winnerId?:string; precision?:PrecisionState;
  disconnectPause?:{playerId:string;graceUntil:number};
};
export type CourtState = { index:number; activeMatch?:MatchState; waiting:string[] };
export type RoomState = {
  code:string; hostId:string; selectedGameId:string; phase:'lobby'|'matchups'|'playing'; hostParticipating:boolean;
  turnSeconds:number; serverTime:number; lateJoinQueue:string[]; currentChampionId?:string;
  players:PlayerState[]; courts:CourtState[];
};

type Session = { roomCode:string; playerId:string; resumeToken:string; isHost:boolean };
type Events = {
  onStatus:(status:'connecting'|'online'|'offline',detail?:string)=>void;
  onJoined:(session:Session)=>void;
  onRoomState:(room:RoomState)=>void;
  onError:(message:string,code?:string)=>void;
  onKicked:(message:string,bannedName?:string,roomCode?:string)=>void;
  onResumeFailed:()=>void;
};

const DEVICE_KEY='minute-to-win-it-device-id-v1';
const SESSION_KEY='minute-to-win-it-session-v1';
const DEFAULT_PRODUCTION_SERVER_URL='wss://minute-to-win-it-classroom-260813-a7f3.onrender.com';

function makeId(){ return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function getDeviceId(){ let id=localStorage.getItem(DEVICE_KEY); if(!id){id=makeId();localStorage.setItem(DEVICE_KEY,id);} return id; }
function getServerUrl(){
  const qp=new URLSearchParams(location.search).get('server');
  if(qp && /^wss?:\/\//i.test(qp)){ localStorage.setItem('minute-to-win-it-server-url',qp); return qp; }
  const saved=localStorage.getItem('minute-to-win-it-server-url');
  if(saved && /^wss?:\/\//i.test(saved)) return saved;
  const configured=(import.meta as ImportMeta & {env?:{VITE_SERVER_URL?:string}}).env?.VITE_SERVER_URL;
  if(configured?.trim()) return configured.trim();
  const host=location.hostname||'localhost';
  const local=host==='localhost'||host==='127.0.0.1'||host.startsWith('192.168.')||host.startsWith('10.');
  if(!local && location.protocol==='https:') return DEFAULT_PRODUCTION_SERVER_URL;
  return `${location.protocol==='https:'?'wss:':'ws:'}//${host}:3001`;
}

export class NetworkClient {
  private ws?:WebSocket; private retryTimer?:number; private heartbeatTimer?:number; private retryDelay=450;
  private stopped=false; private connected=false; private lastServerMessageAt=0; private events:Events;
  readonly deviceId=getDeviceId(); session?:Session;
  constructor(events:Events){ this.events=events; this.session=this.readSession(); window.addEventListener('pageshow',this.checkConnectionAfterWake); window.addEventListener('online',this.checkConnectionAfterWake); document.addEventListener('visibilitychange',this.handleVisibilityChange); }
  start(){this.stopped=false;this.connect();}
  stop(){this.stopped=true;if(this.retryTimer)clearTimeout(this.retryTimer);this.stopHeartbeat();this.ws?.close();}
  private readSession(){const raw=sessionStorage.getItem(SESSION_KEY);if(!raw)return undefined;try{return JSON.parse(raw) as Session}catch{sessionStorage.removeItem(SESSION_KEY);return undefined}}
  clearSession(){this.session=undefined;sessionStorage.removeItem(SESSION_KEY);}
  private saveSession(s:Session){this.session=s;sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));}
  private connect(){
    if(this.stopped)return; this.events.onStatus('connecting',this.session?'Restoring your room…':'Connecting to the game server…');
    let socket:WebSocket; try{socket=new WebSocket(getServerUrl());this.ws=socket}catch{this.scheduleReconnect();return}
    socket.addEventListener('open',()=>{if(this.ws!==socket||this.stopped)return;this.connected=true;this.retryDelay=450;this.lastServerMessageAt=Date.now();this.startHeartbeat();if(this.session){socket.send(JSON.stringify({type:'resume',roomCode:this.session.roomCode,playerId:this.session.playerId,resumeToken:this.session.resumeToken,deviceId:this.deviceId}));}else this.events.onStatus('online');});
    socket.addEventListener('message',(event)=>{if(this.ws!==socket)return;this.lastServerMessageAt=Date.now();let p:any;try{p=JSON.parse(event.data)}catch{return}switch(p.type){
      case'joined':{const s:Session={roomCode:p.roomCode,playerId:p.playerId,resumeToken:p.resumeToken,isHost:Boolean(p.isHost)};this.saveSession(s);this.events.onStatus('online');this.events.onJoined(s);break}
      case'room-state':this.events.onRoomState(p.room as RoomState);break;
      case'pong':break;
      case'error':this.events.onError(p.message||'Something went wrong.',p.code);break;
      case'kicked':this.clearSession();this.events.onKicked(p.message||'You were removed by the host.',p.bannedName,p.roomCode);break;
      case'resume-failed':this.clearSession();this.events.onStatus('online');this.events.onResumeFailed();break;
    }});
    socket.addEventListener('close',()=>{if(this.ws!==socket)return;this.connected=false;this.stopHeartbeat();if(!this.stopped){this.events.onStatus('offline','Connection lost. Reconnecting automatically — active matches allow a 20 second resume window.');this.scheduleReconnect();}});
  }
  private startHeartbeat(){this.stopHeartbeat();this.heartbeatTimer=window.setInterval(()=>{if(this.stopped)return;const s=this.ws;if(!s||s.readyState!==WebSocket.OPEN)return;if(Date.now()-this.lastServerMessageAt>15000){this.restart('Server response paused. Restoring your room…');return;}try{s.send(JSON.stringify({type:'ping',sentAt:Date.now()}))}catch{this.restart('Rechecking the game connection…')}},5000)}
  private stopHeartbeat(){if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);this.heartbeatTimer=undefined;}
  private restart(detail:string){if(this.stopped)return;this.connected=false;this.stopHeartbeat();this.events.onStatus('offline',detail);try{this.ws?.close(4001,'Heartbeat timeout')}catch{}this.scheduleReconnect();}
  private handleVisibilityChange=()=>{if(document.visibilityState==='visible')this.checkConnectionAfterWake();};
  private checkConnectionAfterWake=()=>{if(this.stopped)return;const s=this.ws;if(s?.readyState===WebSocket.OPEN){if(this.lastServerMessageAt&&Date.now()-this.lastServerMessageAt>15000){this.restart('This device woke with a stale connection. Restoring your room…');return;}try{s.send(JSON.stringify({type:'ping',sentAt:Date.now()}))}catch{this.restart('Rechecking the game connection…')}return;}if(!this.retryTimer){this.retryDelay=150;this.scheduleReconnect();}};
  private scheduleReconnect(){if(this.stopped||this.retryTimer)return;const d=this.retryDelay;this.retryDelay=Math.min(4000,Math.round(this.retryDelay*1.55));this.retryTimer=window.setTimeout(()=>{this.retryTimer=undefined;this.connect()},d);}
  isOnline(){return this.connected&&this.ws?.readyState===WebSocket.OPEN;}
  send(payload:unknown){if(!this.isOnline()){this.events.onError('Still connecting to the server. Minute to Win It will keep retrying automatically.');return;}this.ws!.send(JSON.stringify(payload));}
  hostRoom(name:string){this.send({type:'host-room',name,deviceId:this.deviceId});}
  joinRoom(name:string,roomCode:string){this.send({type:'join-room',name,roomCode,deviceId:this.deviceId});}
}
