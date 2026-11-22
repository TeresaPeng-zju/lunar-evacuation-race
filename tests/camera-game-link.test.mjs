import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraGameLink } from '../hardware/camera/race-link.mjs';
import { Sandbox } from '../sandbox/engine.mjs';

test('camera receives selected routes and publishes only measured board poses across a reset', () => {
  const queue = [];
  let routes;
  const game = new Sandbox({mode:'hardware',send:m=>queue.push(()=>camera.receive(m))});
  const camera = new CameraGameLink(m=>queue.push(()=>game.receive(m)),r=>routes=r,'bench-test',()=>game.now);
  const flush=()=>{while(queue.length)queue.shift()()};
  for(let round=0;round<2;round++){
    game.connect();flush();
    game.configure();flush();
    game.chooseOpening('rover-blue','outer');flush();
    assert.equal(routes.find(r=>r.robot_id==='rover-blue').key,'s1_outer');
    camera.publish(game.now,{'rover-blue':{x:19,y:14,heading:-Math.PI/2}});flush();
    const [blue,gold]=game.state().robots;
    assert.deepEqual([blue.pose.x_cm,blue.pose.y_cm,blue.pose.heading_deg],[19,14,-90]);
    assert.equal(blue.pose.valid,true);assert.equal(gold.pose.valid,false);
    assert.equal(blue.stopped_confirmed,false);
    assert.throws(()=>game.start(),/相机实测/);
    game.tick(180);flush();
    assert.equal(game.state().robots[0].pose.valid,false);
    game.reset();
  }
});
