function solve(matrix, values) {
  const n = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) < 1e-9) {
      throw new Error("四个固定 Tag 无法形成有效坐标平面");
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= n; index += 1) {
      augmented[column][index] /= divisor;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= n; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[n]);
}

export function homography(source, target) {
  const matrix = [];
  const values = [];
  source.forEach((point, index) => {
    const world = target[index];
    matrix.push([
      point.x, point.y, 1, 0, 0, 0,
      -world.x * point.x, -world.x * point.y,
    ]);
    values.push(world.x);
    matrix.push([
      0, 0, 0, point.x, point.y, 1,
      -world.y * point.x, -world.y * point.y,
    ]);
    values.push(world.y);
  });
  return [...solve(matrix, values), 1];
}

export function transform(matrix, point) {
  const divisor = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / divisor,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / divisor,
  };
}

const anchorIDs = [4, 5, 7, 6];
const mean = points => ({
  x: points.reduce((s,p)=>s+p[0],0)/points.length,
  y: points.reduce((s,p)=>s+p[1],0)/points.length,
});
const one = (items,id) => {
  const matches = items.filter(item => item.label === 'ID '+id+' · 36h11');
  if(matches.length !== 1) throw Error('需要唯一的 ID '+id);
  return matches[0].points;
};
export function calibrate(items,width,height,headingOffsetDeg=null) {
  if (![width,height].every(v=>Number.isFinite(v)&&v>0)) throw Error('请填写实测中心距');
  const pixels=anchorIDs.map(id=>mean(one(items,id)));
  const world=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
  const matrix=homography(pixels,world);
  const inverse=homography(world,pixels);
  const calibration={matrix,inverse,pixels,width,height,zero:0};
  calibration.zero=headingOffsetDeg===null ? pose(items,calibration).heading : -headingOffsetDeg*Math.PI/180;
  return calibration;
}
export function pose(items,c) {
  const points=one(items,0);
  for(let i=0;i<c.pixels.length;i++){
    const anchor=items.find(m=>m.label==='ID '+anchorIDs[i]+' · 36h11');
    if(!anchor)continue;
    const p=mean(anchor.points);
    if(Math.hypot(p.x-c.pixels[i].x,p.y-c.pixels[i].y)>12)throw Error('场地或相机移动，请重新标定');
  }
  const center=transform(c.matrix,mean(points));
  const edge=transform(c.matrix,mean(points.slice(0,2)));
  return {...center,heading:Math.atan2(edge.y-center.y,edge.x-center.x)-c.zero};
}
export const positionTolerance=5;
export const headingTolerance=5*Math.PI/180;
const wrap=r=>Math.atan2(Math.sin(r),Math.cos(r));
export function driveTo(p,a,b,extraPulse=0,pivotOffset=0,wasAligning=false){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  const remaining=Math.hypot(b.x-p.x,b.y-p.y);
  const finalError=wrap(Math.atan2(dy,dx)-p.heading);
  // Turning moves an off-axis tag. Aim the wheel axle at the point from
  // which the tag will coincide with the goal after the final turn.
  const targetHeading=Math.atan2(dy,dx);
  const axle={x:p.x+pivotOffset*Math.cos(p.heading),y:p.y+pivotOffset*Math.sin(p.heading)};
  const axleGoal={x:b.x+pivotOffset*Math.cos(targetHeading),y:b.y+pivotOffset*Math.sin(targetHeading)};
  const axleError=Math.hypot(axleGoal.x-axle.x,axleGoal.y-axle.y);
  const align=(remaining<=positionTolerance || axleError<4.5 ||
    (wasAligning && remaining<22)) && Math.abs(finalError)>headingTolerance;
  if(remaining<=positionTolerance && Math.abs(finalError)<=headingTolerance)
    return {left:0,right:0,arrived:true,finalError};
  const along=((p.x-a.x)*dx+(p.y-a.y)*dy)/length;
  const t=Math.min(1,Math.max(0,along+27)/length);
  const bearing=Math.atan2(a.y+dy*t+pivotOffset*Math.sin(targetHeading)-axle.y,
                           a.x+dx*t+pivotOffset*Math.cos(targetHeading)-axle.x);
  let error=align?finalError:wrap(bearing-p.heading);
  let sign=1;
  if(!align && remaining<25 && Math.abs(error)>Math.PI/2){
    error=wrap(error+Math.PI);sign=-1;
  }
  const degrees=Math.abs(error)*180/Math.PI;
  if(align || degrees>13){
    const turn=Math.sign(error)*(degrees<13?50:53);
    const pulseMs=Math.round(Math.max(48,Math.min(180,30+degrees*2.6))+extraPulse);
    return {left:turn,right:-turn,pulseMs,finalError,phase:align?'末端对齐':'转向'};
  }
  const speed=remaining<20?53:55;
  const steer=Math.round(26*error);
  const pulseMs=Math.round(Math.max(70,Math.min(155,55+remaining*2.2))+extraPulse);
  return {left:sign*speed+steer,right:sign*speed-steer,pulseMs,finalError,phase:'直行'};
}

// Blue s1_beacon, first line + fillet + next straight, in board centimetres.
export const bendLength=6+Math.PI/2;
export function bendPoint(s){
  s=Math.max(0,Math.min(bendLength,s));
  if(s<=5)return {x:6+s,y:8.4};
  if(s>=5+Math.PI/2)return {x:12,y:6.4+bendLength-s};
  const angle=s-5;
  return {x:11+Math.sin(angle),y:7.4+Math.cos(angle)};
}
export const bendPoints=Array.from({length:Math.ceil(bendLength*10)+1},(_,i)=>bendPoint(i/10));
export const arcLength=6*Math.PI/3;
export function arcPoint(s){
  const a=Math.min(arcLength,Math.max(0,s))/6;
  return {x:6+6*Math.sin(a),y:8.4+6*(1-Math.cos(a))};
}
export const arcPoints=Array.from({length:Math.ceil(arcLength*10)+1},(_,i)=>arcPoint(i/10));
// Endpoint in centimetres relative to the starting pose (forward, right).
export function arcToGoal(dx,dy){
  const chord=Math.hypot(dx,dy);
  if(!Number.isFinite(chord)||dx<=0||chord<1||chord>65)throw Error('请给出前方棋盘内的终点');
  const sweep=2*Math.atan2(dy,dx),curvature=2*dy/(chord*chord);
  const length=curvature?sweep/curvature:chord;
  function point(s){
    const a=Math.min(length,Math.max(0,s));
    return curvature?{x:6+Math.sin(curvature*a)/curvature,y:8.4+2*Math.sin(curvature*a/2)**2/curvature}:{x:6+a,y:8.4};
  }
  const points=Array.from({length:Math.ceil(length*10)+1},(_,i)=>point(i/10));
  return {points,point,length,sweep,curvature};
}
export function bendCommand(p,arc=false,docking=false,positionStep=false,route=null){
  const points=route?.points??(arc?arcPoints:bendPoints),length=route?.length??(arc?arcLength:bendLength),point=route?.point??(arc?arcPoint:bendPoint);
  let best=Infinity,progress=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
    const error=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    if(error<best){best=error;progress=(i-1)/10+t*(Math.min(i/10,length)-(i-1)/10)}
  }
  const target=point(progress+0.7),end=point(length);
  const remaining=Math.hypot(end.x-p.x,end.y-p.y);
  const yaw=wrap((route?.sweep??(arc?Math.PI/3:-Math.PI/2))-p.heading);
  if(arc && (docking || length-progress<=0.12)){
    const angleOK=Math.abs(yaw)<=5*Math.PI/180;
    const positionOK=remaining<=1; // cm, measured at the tag centre
    const translateTowardGoal=!positionOK && (positionStep || angleOK);
    let angle=yaw,sign=1;
    if(translateTowardGoal){
      angle=wrap(Math.atan2(end.y-p.y,end.x-p.x)-p.heading);
      if(Math.abs(angle)>Math.PI/2){angle=wrap(angle+Math.PI);sign=-1}
    }
    const straight=translateTowardGoal && Math.abs(angle)<=10*Math.PI/180;
    const power=straight?52:50;
    const left=power*(straight?sign:Math.sign(angle));
    return {progress,error:best,remaining,yaw,docking:true,positionStep:translateTowardGoal,
      phase:straight?'短直线补位置':translateTowardGoal?'对准补偿方向':'校正目标车头',
      left,right:straight?left:-left,
      pulseMs:straight?Math.min(90,42+12*remaining):Math.min(125,38+62*Math.abs(angle)),
      arrived:positionOK && angleOK};

  }
  if(arc){
    // Steer toward the arc tangent throughout the approach, including the last centimetre.
    const curvature=route?.curvature??1/6;
    const tangent=progress*curvature;
    const foot=point(progress);
    const lateral=-(p.x-foot.x)*Math.sin(tangent)+(p.y-foot.y)*Math.cos(tangent);
    const aim=tangent-Math.atan2(lateral,1.8);
    const terminal=remaining<0.45;
    const speed=terminal?0:Math.min(37,23+7*remaining);
    const turn=terminal?Math.sign(yaw)*Math.min(36,15+45*Math.abs(yaw)):
      Math.max(-30,Math.min(30,1.38*curvature*speed+26*wrap(aim-p.heading)));
    return {progress,error:best,remaining,yaw,left:Math.round(speed+turn),right:Math.round(speed-turn),
      arrived:terminal && Math.abs(yaw)<=4*Math.PI/180};
  }
  const angle=remaining<=0.45?yaw:wrap(Math.atan2(target.y-p.y,target.x-p.x)-p.heading);
  const pivot=Math.abs(angle)>0.8 || remaining<=0.45;
  const speed=pivot?0:(length-progress<1.5?44:50);
  const steer=pivot?Math.sign(angle)*50:Math.round(32*Math.sin(angle)+(arc?14:0));
  return {progress,error:best,remaining,yaw,left:speed+steer,right:speed-steer,
    arrived:remaining<=0.45 && Math.abs(yaw)<=5*Math.PI/180};
}
