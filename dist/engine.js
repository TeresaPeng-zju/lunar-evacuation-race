export const CONFIG={warning:2,choiceWindow:7,collapseProbability:0.5,tieWindow:0.10};
export const length=p=>p.slice(1).reduce((n,v,i)=>n+Math.hypot(v[0]-p[i][0],v[1]-p[i][1]),0);
const edge=(id,points,extra=0)=>({id,points,extra,length:length(points)});
const common=[ [760,0],[790,0],[850,-90],[1000,-90],[1060,0] ];
const beacon=[ [170,0],[260,-100],[420,-100] ];
const beaconExit=[[620,-100],[700,-100],[760,0]];
const firstLength=100+length(beacon)+200+length(beaconExit)+length(common);
export const SPEED=firstLength/42;
function solve(fn,target,lo=0,hi=230){for(let i=0;i<60;i++){let m=(lo+hi)/2;length(fn(m))<target?lo=m:hi=m;}return fn((lo+hi)/2);}
// Solve the entire external route to make its duration precisely 48 seconds.
const outerPoints=solve(h=>[[170,0],[230,h],[420,h],[620,h],[700,h],[760,0]],firstLength+6*SPEED-100-length(common),0,220);
const outerY=outerPoints[1][1];
const safePoints=solve(h=>[[1060,0],[1140,h],[1320,h],[1490,0]],20*SPEED,0,210);
const sy=safePoints[1][1];
export const ROUTES={
 start:edge('start',[[70,0],[170,0]]),
 beaconIn:edge('beaconIn',beacon),
 beaconRock:edge('beaconRock',[[420,-100],[620,-100]],10),
 beaconOut:edge('beaconOut',beaconExit),
 outerIn:edge('outerIn',outerPoints.slice(0,3)),
 outerRock:edge('outerRock',[[420,outerY],[620,outerY]],2),
 outerOut:edge('outerOut',outerPoints.slice(3)),
 common:edge('common',common),
 safeIn:edge('safeIn',safePoints.slice(0,2)),
 safeRock:edge('safeRock',safePoints.slice(1,3),5),
 safeOut:edge('safeOut',safePoints.slice(2)),
 riskIn:edge('riskIn',[[1060,0],[1140,-35]]),
 riskRock:edge('riskRock',[[1140,-35],[1250,-35]],5),
 source:edge('source',[[1250,-35],[1280,-35]]),
 stable:edge('stable',[[1280,-35],[1490,0]]),
 collapse:edge('collapse',[[1280,-35],[1280,-190],[1450,-190],[1490,0]])
};
export function bypass(e){const [a,b]=e.points;const sign=e.id==='beaconRock'?-1:e.id==='outerRock'?1:e.id==='safeRock'?1:-1;const h=e.extra*SPEED/2;return [a,[a[0],a[1]+sign*h],[b[0],b[1]+sign*h],b];}
export function sample(points,d){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<=l)return {x:a[0]+(b[0]-a[0])*d/l,y:a[1]+(b[1]-a[1])*d/l,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};d-=l;}const p=points.at(-1);return {x:p[0],y:p[1],angle:0};}
export class Race{
 constructor({random=Math.random}={}){this.random=random;this.reset();}
 reset(){this.time=0;this.status='ready';this.paused=false;this.quake=null;this.locked=false;this.aftershock=null;this.winner=null;this.firstArrival=null;this.events=[];this.players=[0,1].map(id=>({id,opening:null,finalChoice:null,final:null,card:true,beacon:false,gate:false,queue:[],edge:null,d:0,position:{x:70,y:0,angle:0},rock:null,detours:[],arrived:null,distance:0}));this.log('任务就绪 · 请选择开局路线');}
 log(text){this.events.unshift({time:this.time,text});this.events=this.events.slice(0,30);}
 chooseOpening(id,route){if(this.status!=='ready'||!['beacon','outer'].includes(route))return false;this.players[id].opening=route;return true;}
 start(){if(this.status!=='ready'||this.players.some(p=>!p.opening))return false;this.status='running';for(const p of this.players){p.queue=['start',...(p.opening==='beacon'?['beaconIn','beaconRock','beaconOut']:['outerIn','outerRock','outerOut']),'common'];this.next(p);}this.log('双车发车 · 撤离行动开始');return true;}
 chooseFinal(id,route){if(this.status!=='running'||this.paused||this.quake===null||this.locked||!['safe','risk'].includes(route))return false;this.players[id].finalChoice=route;if(this.players.every(p=>p.finalChoice))this.lock();return true;}
 lock(){if(this.locked)return;this.locked=true;for(const p of this.players){p.final=p.finalChoice||'safe';p.queue.push(...(p.final==='safe'?['safeIn','safeRock','safeOut']:['riskIn','riskRock','source']));}this.log('末段路线同时公开 · 未提交者默认归航环路');}
 legal(attacker){if(this.status!=='running'||this.paused||!this.players[attacker].card)return null;const p=this.players[1-attacker];let distance=p.edge?p.edge.length-p.d:0;for(const id of p.queue){const e=ROUTES[id];if(e.extra&&distance>SPEED*(CONFIG.warning+0.8))return {id,distance,point:e.points[0],target:p.id};distance+=e.length;}return null;}
 attack(id){const target=this.legal(id);if(!target)return false;this.players[id].card=false;this.players[target.target].rock={edge:target.id,at:this.time,active:false,done:false};this.log(`${id===0?'蓝':'黄'}方投放落石 · 对手前方预警 2 秒`);return true;}
 next(p){const id=p.queue.shift();if(!id){p.edge=null;p.arrived=this.time;if(this.firstArrival===null)this.firstArrival=this.time;this.log(`${p.id===0?'蓝':'黄'}车进入飞船停靠区`);return;}
 let original=ROUTES[id],points=original.points;
 if(p.rock?.edge===id){points=bypass(original);p.detours.push(id);this.log(`${p.id===0?'蓝':'黄'}车进入落石绕行道路`);}
 p.edge={...original,points,length:length(points)};p.d=0;
 
 if(id==='common'&&this.quake===null){this.quake=this.time;this.log('月震触发 · 7 秒秘密选路，车辆继续行驶');}
 
 }
 step(dt){if(this.status!=='running'||this.paused)return; // Fixed small steps keep position-triggered events deterministic.
 let remaining=dt;while(remaining>1e-9&&this.status==='running'){const tick=Math.min(remaining,1/120);remaining-=tick;this.time+=tick;
 if(this.quake!==null&&!this.locked&&this.time-this.quake>=CONFIG.choiceWindow)this.lock();
 for(const p of this.players){if(p.rock&&!p.rock.done&&this.time-p.rock.at>=CONFIG.warning)p.rock.active=true;if(p.arrived!==null)continue;let move=SPEED*tick;
 while(move>0&&p.edge){const travel=Math.min(move,p.edge.length-p.d);p.d+=travel;p.distance+=travel;move-=travel;p.position=sample(p.edge.points,p.d);if(p.opening==='beacon'&&!p.beacon&&Math.hypot(p.position.x-285,p.position.y+100)<18){p.beacon=true;p.gate=true;this.log(`${p.id===0?'蓝':'黄'}车触发信标 · 个人舱门开启`);}if(p.gate&&p.position.x>670)p.gate=false;if(p.d>=p.edge.length-1e-8){if(p.edge.id==='source'){if(this.aftershock===null){this.aftershock=this.random()<CONFIG.collapseProbability?'collapse':'stable';this.log(this.aftershock==='collapse'?'共享余震：前方塌陷 · 启用绕行路':'共享余震：道路稳定 · 捷径保持开放');}p.queue.push(this.aftershock);}if(p.rock?.edge===p.edge.id){p.rock.done=true;p.rock.active=false;}this.next(p);}}
 }
 if(this.firstArrival!==null&&(this.players.every(p=>p.arrived!==null)||this.time-this.firstArrival>CONFIG.tieWindow)){const [a,b]=this.players;this.winner=a.arrived!==null&&b.arrived!==null&&Math.abs(a.arrived-b.arrived)<=CONFIG.tieWindow?'tie':(a.arrived!==null&&(b.arrived===null||a.arrived<b.arrived)?0:1);this.status='finished';this.log(this.winner==='tie'?'双车并列撤离成功':`${this.winner===0?'蓝':'黄'}方率先撤离成功`);}
 }
 }
}
