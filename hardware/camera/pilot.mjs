import {CameraGameLink} from './race-link.mjs';
import {calibrate,pose,driveTo,transform,homography,bendPoints,bendCommand,bendLength,arcPoints,arcLength,arcToGoal} from './navigation.mjs';
const el=id=>document.getElementById(id);
const requestedRover=new URLSearchParams(location.search).get('rover');
if([...el('rover').options].some(o=>o.value===requestedRover))el('rover').value=requestedRover;
const num=id=>el(id).valueAsNumber;
const note=text=>el('navNote').textContent=text;
const readPoint=prefix=>({x:num(prefix+'x'),y:num(prefix+'y')});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let cal,frame,current,ws,run,stamp=-Infinity;
// The game board and the millimetre navigation field have separate origins.
const cornerNames=['左上','右上','右下','左下'];
const boardWorld=[{x:0,y:0},{x:59.8,y:0},{x:59.8,y:33.6},{x:0,y:33.6}];
let corners=[],board=null,picking=false,boardSize='';
const viewport=document.querySelector('#stage svg');
let boardPose=null,trace=[],peak=0;
const curveStatus=text=>el('curveStatus').textContent=text;
function drawPath(svg,points,color){
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  line.setAttribute('points',points.map(p=>{const q=transform(board.inverse,p);return q.x+','+q.y}).join(' '));
  line.setAttribute('stroke',color);line.setAttribute('stroke-width','2');line.setAttribute('fill','none');svg.append(line);
}
let tagPose=null,origin=null,path=bendPoints;
function rotateXY(x,y,h){
  return {x:x*Math.cos(h)-y*Math.sin(h),y:x*Math.sin(h)+y*Math.cos(h)};
}
function worldPoint(p){
  const d=rotateXY(p.x-6,p.y-8.4,origin.heading);
  return {x:origin.x+d.x,y:origin.y+d.y};
}
function atCurveStart(){
  if(origin)return fresh() && tagPose && distance(tagPose,origin)<=0.5 &&
    Math.abs(Math.atan2(Math.sin(tagPose.heading-origin.heading),Math.cos(tagPose.heading-origin.heading)))<=10*Math.PI/180;
  return fresh() && boardPose && distance(boardPose,bendPoints[0])<=0.5 &&
    Math.abs(Math.atan2(Math.sin(boardPose.heading),Math.cos(boardPose.heading)))<=10*Math.PI/180;
}
el('curveStart').onclick=()=>startCurve(false);
el('curveHere').onclick=()=>startCurve(true);
el('arcHere').onclick=()=>startCurve(true,true);
el('goalArc').onclick=()=>startCurve(true,true,{x:num('goalX'),y:num('goalY')});
function startCurve(relative,arc=false,goal=null){
  if(run)return curveStatus('已有控制任务，请先停车');
  if(el('rover').value!=='192.168.31.157')return curveStatus('请选择第二台蓝车');
  if(!board || !(relative?tagPose:boardPose) || !fresh())return curveStatus('请标定棋盘、填写车体偏移，并保持 ID 0 清晰');
  origin=relative?{...tagPose}:null;
  let route=null;
  if(goal){
    const d=rotateXY(goal.x-origin.x,goal.y-origin.y,-origin.heading);
    try{route=arcToGoal(d.x,d.y)}catch(e){return curveStatus(e.message)}
  }
  path=route?route.points.map(worldPoint):origin?(arc?arcPoints:bendPoints).map(worldPoint):bendPoints;
  const fmt=p=>'('+p.x.toFixed(2)+', '+p.y.toFixed(2)+')';
  el('curveCoords').textContent=fmt(path[0])+' → '+fmt(path.at(-1))+' cm';
  if(path.some(p=>p.x<4 || p.y<4 || p.x>55.8 || p.y>29.6))return curveStatus('轨迹靠近边界，请移到场地内侧');
  if(!atCurveStart())return curveStatus('请将车体中心摆到起点 ±5 mm，车头朝右 ±10°');
  trace=[];peak=0;el('curveStats').textContent='';
  const active=run={curve:true,arc,route,start:performance.now(),last:performance.now(),progressAt:performance.now(),progress:0};
  const socket=ws=new WebSocket('ws://127.0.0.1:4183/control?ip=192.168.31.157');
  curveStatus('检查车辆连接');
  socket.onmessage=e=>{
    if(run!==active)return;
    if(!JSON.parse(e.data).ready || !atCurveStart())return halt('车辆未就绪或起点变化，已停止');
    active.ready=true;active.last=active.progressAt=performance.now();curveStatus('跟踪中');
  };
  socket.onclose=()=>{if(run===active)halt('车辆连接断开')};
};
export function arcReadings(){
  return {path,trace,origin,latest:fresh()?tagPose:null,stamp};
}
el('curveStop').onclick=()=>{if(run?.curve)halt('手动停止')};
function followCurve(p){
  if(!run?.curve || !run.ready)return;
  let local=p;
  if(origin){
    const d=rotateXY(p.x-origin.x,p.y-origin.y,-origin.heading);
    local={x:6+d.x,y:8.4+d.y,heading:p.heading-origin.heading};
  }
  const cmd=bendCommand(local,run.arc,run.docking,run.positionStep,run.route),now=performance.now();
  run.last=stamp;peak=Math.max(peak,cmd.error);trace.push({...p,phase:cmd.phase??'跟踪中'});
  el('curveStats').textContent='进度 '+cmd.progress.toFixed(1)+' / '+(run.route?.length??(run.arc?arcLength:bendLength)).toFixed(1)+' cm · 当前偏差 '+(10*cmd.error).toFixed(1)+' mm · 最大偏差 '+(10*peak).toFixed(1)+' mm · 距终点 '+(10*cmd.remaining).toFixed(1)+' mm · 终点朝向差 '+Math.abs(cmd.yaw*180/Math.PI).toFixed(1)+'°';
  if(p.x<3.5 || p.y<3.5 || p.x>56.3 || p.y>30.1)return halt('靠近棋盘边缘，已停车');
  if(cmd.docking){
    if(!run.docking){
      ws.send(JSON.stringify({direction:'stop'}));run.observeDockAfter=now+320;
      run.docking=true;run.dockRound=1;run.dockStart=now;run.progressAt=now;run.dockReference=p;
    }
    if(stamp<run.retryAfter){curveStatus('等待停稳后复测');return}
    if(stamp<run.observeDockAfter){return}
    run.positionStep=cmd.positionStep;
    curveStatus('第'+run.dockRound+'轮 · '+cmd.phase);
    const ref=run.dockReference;
    if(distance(ref,p)>0.12 || Math.abs(Math.sin(p.heading-ref.heading))>0.05){
      run.progressAt=now;run.dockReference=p;
    }
  }else if(!run.arc && cmd.error>0.8)return halt('偏离轨迹超过 8 mm，已停车');
  if(cmd.arrived){
    ws.send(JSON.stringify({direction:'stop'}));
    run.wheels={left:0,right:0,time:now};run.settle??=now;
    if(now-run.settle>450)halt('轨迹测试完成，已停车');
    return;
  }
  run.settle=null;
  if(cmd.progress>run.progress+0.1){run.progress=cmd.progress;run.progressAt=now}
  if(now-run.progressAt>5000 || (run.docking && now-run.dockStart>10000)){
    if(run.dockRound!==1)return halt(run.docking?'两轮末端修正结束，未到位，已停车':'轨迹进度停滞，已停车');
    ws.send(JSON.stringify({direction:'stop'}));
    run.positionStep=false;run.retryAfter=now+550;run.dockRound=2;run.progressAt=run.dockStart=run.retryAfter;
    run.wheels={left:0,right:0,time:now};run.dockReference=p;
    curveStatus('等待停稳后复测');return;
  }
  let left=cmd.left,right=cmd.right;
  if(cmd.docking){
    const active=run;
    ws.send(JSON.stringify({left,right,time:Math.round(Date.now()-(now-stamp))}));
    run.observeDockAfter=now+cmd.pulseMs+260;
    run.pulseTimer=setTimeout(()=>{
      if(run===active && ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({direction:'stop'}));
    },cmd.pulseMs);
    return;
  }
  if(run.arc && !run.docking && run.progress<0.12){
    const boost=Math.min(18,Math.max(0,(now-run.progressAt-450)/60));
    left=Math.round(left+boost);right=Math.round(right+boost);
  }
  if(run.arc && run.wheels){
    const limit=Math.min(12,140*(now-run.wheels.time)/1000);
    const approach=(v,prev)=>Math.round(prev+Math.max(-limit,Math.min(limit,v-prev)));
    left=approach(left,run.wheels.left);right=approach(right,run.wheels.right);
  }
  run.wheels={left,right,time:now};
  ws.send(JSON.stringify({left,right,time:Math.round(Date.now()-(now-stamp))}));
}
let raceSocket=null,raceLink=null,raceRoutes=[];
const gamePort=new URLSearchParams(location.search).get('gamePort');
if(gamePort && Number.isInteger(+gamePort) && +gamePort>0 && +gamePort<=65535)el('racePort').value=gamePort;
function disconnectRace(){
  raceSocket?.close();raceSocket=null;raceLink=null;raceRoutes=[];
  el('raceConnect').textContent='连接游戏';el('raceState').textContent='已断开';
}
el('raceConnect').onclick=()=>{
  if(raceSocket){disconnectRace();return}
  if(!board){el('raceState').textContent='请先标定棋盘';return}
  const port=num('racePort');
  if(!Number.isInteger(port)||port<1||port>65535){el('raceState').textContent='请填写有效端口';return}
  const socket=new WebSocket('ws://127.0.0.1:'+port+'/hardware');raceSocket=socket;
  el('raceConnect').textContent='断开游戏';el('raceState').textContent='连接中';
  const link=new CameraGameLink(m=>{if(socket.readyState===1)socket.send(JSON.stringify(m))},
    routes=>{raceRoutes=routes;el('raceState').textContent=routes.length?'已接收路线 · 上报实测车体位姿':'已连接 · 等待游戏配置地图'},
    'camera-'+crypto.randomUUID());
  raceLink=link;
  socket.onmessage=e=>{if(socket===raceSocket)link.receive(JSON.parse(e.data))};
  socket.onclose=()=>{if(socket===raceSocket){disconnectRace();el('raceState').textContent='连接关闭，请核对外部硬件模式及接口占用'}};
};
function publishRaceFrame(items){
  if(!raceLink)return;
  const measurements={};
  if(board && fresh()){
    if(boardPose)measurements['rover-blue']=boardPose;
    const f=num('goldF')/10,r=num('goldR')/10,yaw=num('goldYaw');
    if([f,r,yaw].every(Number.isFinite)){
      try{
        const p=pose(items,{...board,zero:-yaw*Math.PI/180},1),c=Math.cos(p.heading),s=Math.sin(p.heading);
        measurements['rover-gold']={x:p.x+f*c-r*s,y:p.y+f*s+r*c,heading:p.heading};
      }catch{} // Missing or ambiguous tag is reported invalid.
    }
  }
  raceLink.publish(stamp,measurements);
}
function guide(){
  el('boardUndo').disabled=!picking || !corners.length;
  el('boardGuide').textContent=picking?'请点棋盘'+cornerNames[corners.length]+'角':board?(board.inferred?'四码居中推算 · 白框为屏幕有效区':'棋盘已标定 · 左上为原点，X 向右，Y 向下'):'等待点选四角';
  el('stage').style.cursor=picking?'crosshair':'';
}
function resetBoard(){
  if(raceSocket)disconnectRace();
  if(run?.curve)halt('标定已重置，已停止');
  origin=null;tagPose=null;path=bendPoints;el('curveCoords').textContent='';boardPose=null;trace=[];el('curveStats').textContent='';
  corners=[];board=null;picking=false;boardSize='';guide();
  el('boardPose').textContent='等待棋盘标定';
}
for(const id of ['offsetF','offsetR']){
  const input=el(id),key='blueBody:'+id;
  input.value=localStorage.getItem(key)??'';
  input.oninput=()=>{if(run?.curve)halt('偏移已更改，已停止');boardPose=null;localStorage.setItem(key,input.value)};
}
el('boardFromTags').onclick=()=>{
  if(run)return note('请先停车再标定');
  try{
    if(!frame || !fresh())throw Error('等待实时相机画面');
    const w=num('fieldX'),h=num('fieldY');
    const field=calibrate(frame,w,h,0);
    const dx=(w-598)/2,dy=(h-336)/2;
    const pixels=boardWorld.map(p=>transform(field.inverse,{x:10*p.x+dx,y:10*p.y+dy}));
    const anchors=new Map(frame.filter(m=>/^ID [4567] · 36h11$/.test(m.label)).map(m=>[m.label,m.points[0]]));
    resetBoard();corners=pixels;boardSize=viewport.getAttribute('viewBox');
    board={matrix:homography(pixels,boardWorld),inverse:homography(boardWorld,pixels),pixels:[],zero:0,anchors,inferred:true};
    guide();
  }catch(e){el('boardGuide').textContent=e.message}
};
el('boardCal').onclick=()=>{
  if(!fresh()){el('boardGuide').textContent='请先打开实时相机';return}
  resetBoard();picking=true;boardSize=viewport.getAttribute('viewBox');guide();
};
el('boardUndo').onclick=()=>{corners.pop();guide()};
el('stage').addEventListener('click',event=>{
  if(!picking || !fresh())return;
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(viewport.getScreenCTM().inverse());
  const box=viewport.viewBox.baseVal;
  if(p.x<0 || p.y<0 || p.x>box.width || p.y>box.height)return;
  corners.push({x:p.x,y:p.y});
  if(corners.length===4){
    try{
      for(let i=0;i<4;i++){
        const [a,b,c]=[0,1,2].map(j=>corners[(i+j)%4]);
        if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<20)throw Error();
      }
      board={matrix:homography(corners,boardWorld),inverse:homography(boardWorld,corners),pixels:[],zero:0};
      // Store visible fixed tags so camera movement invalidates this calibration.
      board.anchors=new Map((frame??[]).filter(m=>/^ID [4567] · 36h11$/.test(m.label)).map(m=>[m.label,m.points[0]]));
      picking=false;
    }catch{resetBoard();el('boardGuide').textContent='四角顺序或位置异常，请重新点选';return}
  }
  guide();
});
function updateBoard(items,overlay){
  boardPose=null;tagPose=null;
  if(!board && !picking)return;
  if(boardSize!==viewport.getAttribute('viewBox')){resetBoard();return}
  if(board && items.some(m=>{
    const ref=board.anchors.get(m.label);
    return ref && Math.hypot(m.points[0][0]-ref[0],m.points[0][1]-ref[1])>12;
  })){resetBoard();el('boardGuide').textContent='相机或场地已移动，请重新点选四角';return}
  for(const p of corners){
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y);dot.setAttribute('r',4);dot.setAttribute('fill','#ffd77d');overlay.append(dot);
  }
  if(!board)return;
  drawPath(overlay,[...boardWorld,boardWorld[0]],'#ecf1f4');
  for(const route of raceRoutes)drawPath(overlay,route.waypoints_cm.map(p=>({x:p.x_cm,y:p.y_cm})),route.robot_id==='rover-blue'?'#56adff':'#f7c647');
  if(!raceRoutes.length)drawPath(overlay,path,'#ffd77d');
  if(trace.length)drawPath(overlay,trace,'#43dfe7');
  const out=el('boardPose');
  if(!fresh()){out.textContent='等待实时定位';return}
  const saved=localStorage.getItem('headingOffset:192.168.31.157');
  board.zero=-(saved===null?92:Number(saved))*Math.PI/180;
  let p;
  try{p=pose(items,board)}catch{out.textContent='等待唯一的蓝车 ID 0';return}
  tagPose=p;if(origin)followCurve(tagPose);
  const f=num('offsetF')/10,r=num('offsetR')/10;
  if(!Number.isFinite(f)||!Number.isFinite(r)){out.textContent='标签中心 X '+p.x.toFixed(2)+' cm · Y '+p.y.toFixed(2)+' cm；填写两项偏移后显示车体中心';return}
  const cos=Math.cos(p.heading),sin=Math.sin(p.heading);
  const x=p.x+f*cos-r*sin,y=p.y+f*sin+r*cos;
  boardPose={x,y,heading:p.heading};if(!origin)followCurve(boardPose);
  out.textContent='车体中心 X '+x.toFixed(2)+' cm · Y '+y.toFixed(2)+' cm · 车头 '+(((p.heading*180/Math.PI+540)%360)-180).toFixed(1)+'°';
}
function halt(reason){
  if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({direction:'stop'}));
  if(run?.curve)curveStatus(reason||'已停止');
  clearTimeout(run?.pulseTimer);
  const old=ws;ws=null;run=null;
  if(old && old.readyState<WebSocket.CLOSING)old.close();
  if(reason)note(reason);
}
let measureOrigin=null;
function unavailable(message){
  el('pose').textContent=message;
  el('measure').disabled=true;
  el('displacement').textContent='';
}
el('measure').onclick=()=>{
  if(current && fresh())measureOrigin={...current};
};
function reset(){
  resetBoard();halt('等待标定');cal=frame=current=null;stamp=-Infinity;
  measureOrigin=null;unavailable('等待场地标定');
}
function fresh(){return performance.now()-stamp<150}
function inside(p){
  return p.x>=40 && p.y>=40 && p.x<=cal.width-40 && p.y<=cal.height-40;
}
function paint(overlay,a,b,color,width){
  const p=transform(cal.inverse,a),q=transform(cal.inverse,b);
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  for(const [k,v] of Object.entries({x1:p.x,y1:p.y,x2:q.x,y2:q.y,stroke:color,'stroke-width':width}))line.setAttribute(k,v);
  overlay.append(line);
}
function update(items,time,overlay){
  frame=items;stamp=time;updateBoard(items,overlay);publishRaceFrame(items);
  if(run?.curve || !cal)return;
  try{current=pose(items,cal)}catch(e){
    current=null;unavailable(e.message);
    if(run && (e.message.includes('移动') || items.filter(m=>m.label==='ID 0 · 36h11').length>1))halt(e.message);
    return;
  }
  const p=current;
  const deg=Math.atan2(Math.sin(p.heading),Math.cos(p.heading))*180/Math.PI;
  if(fresh()){
    el('measure').disabled=false;
    el('pose').textContent='X '+p.x.toFixed(1)+' mm · Y '+p.y.toFixed(1)+' mm · 车头 '+deg.toFixed(1)+'°';
    if(measureOrigin)el('displacement').textContent='直线位移 '+distance(p,measureOrigin).toFixed(1)+' mm';
  }else unavailable('等待实时定位');
  const a=run?.a??readPoint('a'),b=run?.b??readPoint('b');
  if(inside(a)&&inside(b))paint(overlay,a,b,'#ffca60',4);
  paint(overlay,p,{x:p.x+28*Math.cos(p.heading),y:p.y+28*Math.sin(p.heading)},'#55e4ff',6);
  if(!run?.ready || ws?.readyState!==WebSocket.OPEN || !fresh())return;
  if(!inside(p))return halt('越过测试区域，已停车');
  const now=performance.now();
  run.last=now;
  if(run.moving || time < run.observeAfter)return;
  // Increase only the next pulse when stiction ate the last one.
  if(run.previous){
    const change=distance(run.previous,p);
    const yaw=Math.abs(Math.atan2(Math.sin(p.heading-run.previous.heading),Math.cos(p.heading-run.previous.heading)));
    run.extra=change<1.8 && yaw<0.035 ? Math.min(60,(run.extra||0)+15) : 0;
  }
  const cmd=driveTo(p,a,b,run.extra||0,el('rover').value==='192.168.31.157'?7:0,run.phase==='末端对齐');
  if(cmd.arrived){
    if(!run.settle)run.settle=time;
    if(time-run.settle>=450)halt('到达 · 位置误差 '+distance(p,b).toFixed(1)+' mm · 朝向误差 '+Math.abs(cmd.finalError*180/Math.PI).toFixed(1)+'°');
    return;
  }
  run.settle=0;
  const remaining=distance(p,b);
  if(run.phase!==cmd.phase || !run.reference || distance(run.reference,p)>2 ||
      Math.abs(Math.sin(p.heading-run.reference.heading))>0.05){
    run.progress=now;run.phase=cmd.phase;run.reference={...p};
  }
  if(now-run.progress>5000)return halt('实测位置和朝向没有变化，已停车');
  const pulseMs=cmd.pulseMs;
  note(cmd.phase+' · 距终点 '+remaining.toFixed(0)+' mm · 终点朝向误差 '+Math.abs(cmd.finalError*180/Math.PI).toFixed(0)+'°');
  const active=run;
  ws.send(JSON.stringify({...cmd,time:Math.round(Date.now()-(now-time))}));
  active.previous={...p};active.moving=true;
  active.pulseTimer=setTimeout(()=>{
    if(run!==active)return;
    if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({direction:'stop'}));
    active.moving=false;
    active.observeAfter=performance.now()+450;
  },pulseMs);

}
function mountOffset(){
  const ip=el('rover').value;
  const stored=localStorage.getItem('headingOffset:'+ip);
  if(stored!==null && Number.isFinite(Number(stored)))return Number(stored);
  return ip==='192.168.31.157'?92:null;
}
el('zeroHeading').onclick=()=>{
  halt();
  if(!cal || !fresh() || !current || !el('rover').value)return note('先选择实车并标定场地');
  const raw=pose(frame,{...cal,zero:0}).heading;
  cal.zero=raw;
  localStorage.setItem('headingOffset:'+el('rover').value,String(-raw*180/Math.PI));
  current=pose(frame,cal);
  note('车头已按场地向右校准为 0°');
};
el('cal').onclick=()=>{
  halt();measureOrigin=null;unavailable('等待场地标定');
  try{
    if(!frame || !fresh())throw Error('请打开 USB 相机并保持标签清晰');
    cal=calibrate(frame,num('fieldX'),num('fieldY'),mountOffset());current=pose(frame,cal);
    note('标定完成，可取当前起点');
  }catch(e){cal=current=null;note(e.message)}
};
el('here').onclick=()=>{
  if(!cal||!current||!fresh())return note('等待有效实测位置');
  el('ax').value=Math.round(current.x);el('ay').value=Math.round(current.y);
};
el('goNav').onclick=()=>{
  if(run)return;
  if(!cal || !current || !fresh())return note('需要标定和新鲜的单车实测位置');
  const ip=el('rover').value,a=readPoint('a'),b=readPoint('b');
  if(!ip)return note('请选择与当前车顶 ID 0 对应的小车');
  if(!inside(a)||!inside(b))return note('起终点需位于四码矩形内，距边至少 40 mm');
  if(distance(current,a)>15)return note('小车距起点超过 15 mm');
  if(distance(a,b)<=10)return note('起终点间距需超过 10 mm');
  const now=performance.now();
  run={a,b,last:now,progress:now,start:now,moving:false,observeAfter:0};
  const socket=new WebSocket('ws://127.0.0.1:4183/control?ip='+ip);ws=socket;
  note('正在检查所选小车是否在线、静止');
  socket.onmessage=e=>{
    if(ws!==socket)return;
    if(!JSON.parse(e.data).ready)return halt('所选小车离线或正在运动');
    if(!fresh()||!current||distance(current,a)>15)return halt('起点或定位已变化');
    run.last=run.progress=performance.now();run.ready=true;note('沿黄色线行驶中');
  };
  socket.onclose=()=>{if(ws===socket)halt('遥控连接断开，已停止任务')};
};
el('haltNav').onclick=()=>halt('已停车');
el('rover').oninput=reset;
for(const id of ['ax','ay','bx','by'])el(id).oninput=()=>halt('目标已更改');
for(const id of ['fieldX','fieldY'])el(id).oninput=reset;
window.addEventListener('blur',()=>{if(run)halt('窗口失焦，已停车')});
document.addEventListener('visibilitychange',()=>{if(document.hidden && run)halt('页面隐藏，已停车')});
setInterval(()=>{
  if(run?.curve && run.ready && performance.now()-run.last>150)halt('定位中断，已停车');
  if(board && !fresh())el('boardPose').textContent='等待实时定位';
  if(cal && current && !fresh() && !el('measure').disabled)unavailable('等待实时定位');
  if(run && ((run.ready && performance.now()-run.last>(run.moving?180:1500)) || performance.now()-run.start>55000))halt('定位或任务超时，已停车');
},35);
export const pilot={reset,update,calibrated:()=>Boolean(cal)};
