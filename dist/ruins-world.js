import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ROUTES, sample } from './engine.js';
import { mapPoint, heading, elevation, routeActive, smooth } from './ruins-map.js';
import { anchor, roadState } from './display/map.js';
const colors = [0x77c6e0, 0xe8b969],
  names = ['blue', 'gold'];
const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
export class LunarWorld {
  constructor(canvas, options = {}) {
    this.physical = options.physical === true;
    this.canvas = canvas;
    this.loaded = false;
    this.mode = 'game';
    this.roads = [];
    this.rovers = [];
    this.labels = [];
    this.lastTime = 0;
    this.frames = [];
    this.cards = new Map();
    this.effects = [{}, {}];
    this.faults = [];
    this.errors = [];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13191f);
    this.scene.fog = new THREE.FogExp2(0x171d24, 0.0013);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.OrthographicCamera(-95, 95, 65, -65, 0.1, 700);
    this.camera.position.set(70, 150, 160);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minZoom = 0.75;
    this.controls.maxZoom = 2.5;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.target.set(0, 3, 0);
    this.controls.addEventListener('start', () => {
      this.mode = 'free';
      this.modeUI();
    });
    // Broad neutral lunar reflection field, not the interior of an indoor studio.
    const data = new Float32Array(64 * 32 * 4);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 64; x++) {
        const v = 0.1 + 0.55 * Math.pow(y / 31, 0.7),
          i = (y * 64 + x) * 4;
        data[i] = v * 0.87;
        data[i + 1] = v * 0.94;
        data[i + 2] = v;
        data[i + 3] = 1;
      }
    const hdr = new THREE.DataTexture(data, 64, 32, THREE.RGBAFormat, THREE.FloatType);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdr.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromEquirectangular(hdr).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
    hdr.dispose();
    this.scene.add(new THREE.HemisphereLight(0xc4d4e5, 0x393738, 0.6));
    const sun = new THREE.DirectionalLight(0xfff5e9, 3);
    sun.position.set(-65, 95, 50);
    sun.target.position.set(0, 0, -15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -90,
      right: 90,
      top: 100,
      bottom: -100,
      near: 0.1,
      far: 300,
    });
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.22;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.ao = new GTAOPass(
      this.scene,
      this.camera,
      1,
      1,
      undefined,
      { radius: 1.4, thickness: 2, distanceFallOff: 1, scale: 1, samples: 8 },
      { radius: 4, rings: 2, samples: 8 },
    );
    this.ao.blendIntensity = 0.35;
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.4, 1.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.hud = new THREE.Scene();
    this.hudCamera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
    this.hudCamera.position.z = 10;
    const texture = new THREE.TextureLoader().load('assets/card-reference.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    this.cardTextures = [161, 1005].map((x) => {
      const t = texture.clone();
      t.repeat.set(518 / 1752, 777 / 1024);
      t.offset.set(x / 1752, 76 / 1024);
      t.needsUpdate = true;
      return t;
    });
    this.status = document.createElement('div');
    this.status.className = 'world-status';
    this.status.textContent = '正在装载月球遗址 · 地形与设施';
    canvas.parentElement.append(this.status);
    this.loader = new GLTFLoader();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.ready = this.load().catch((e) => {
      this.errors.push(e.message);
      this.status.textContent = '场景加载失败，请刷新重试：' + e.message;
      this.status.classList.add('error');
      throw e;
    });
  }
  prepare(root) {
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms)
          for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap'])
            if (m[key])
              m[key].anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
    });
    return root;
  }
  normalize(root, size) {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root),
      dim = b.getSize(new THREE.Vector3()),
      center = b.getCenter(new THREE.Vector3());
    const s = size / Math.max(dim.x, dim.z);
    const anchor = new THREE.Group();
    root.position.sub(new THREE.Vector3(center.x, b.min.y, center.z));
    anchor.add(root);
    anchor.scale.setScalar(s);
    return anchor;
  }
  async load() {
    const [staticGLB, dynamic, blue, gold, meteor, map] = await Promise.all([
      ...[
        this.physical ? 'dual-screen/static-scene' : 'ruins-game/static-scene',
        'ruins-game/interactive',
        'models/science-rover-blue',
        'models/science-rover-gold',
        'models/meteorite',
      ].map((n) => this.loader.loadAsync('assets/' + n + '.glb')),
      fetch('assets/ruins-game/map.json').then((r) => {
        if (!r.ok) throw Error('地图配置不可用');
        return r.json();
      }),
    ]);
    this.map = map;
    if (this.physical) {
      const response = await fetch('assets/dual-screen/map.json');
      if (!response.ok) throw Error('双屏道路配置不可用');
      this.displayMap = await response.json();
    }
    this.scene.add(this.prepare(staticGLB.scene));
    this.scene.add(this.prepare(dynamic.scene));
    dynamic.scene.traverse((o) => {
      if (o.isMesh && o.userData.logical_edge_id) {
        o.material = o.material.clone();
        o.material.roughness = 0.95;
        this.roads.push(o);
      }
      if (o.name.startsWith('FAULT_') && o.isMesh) {
        o.material = o.material.clone();
        o.visible = false;
        this.faults.push(o);
      }
    });
    if (this.roads.length !== 40) throw Error('交互赛道不完整：' + this.roads.length + '/40');
    this.highlight = new THREE.Group();
    this.scene.add(this.highlight);
    if (!this.physical)
      for (const lane of map.lanes)
        for (const edge of lane.edges) {
          const mesh = this.ribbon(
            edge.points_xy,
            0.12,
            0.095,
            new THREE.MeshBasicMaterial({
              color: colors[lane.player === 'blue' ? 0 : 1],
              transparent: true,
              opacity: 0.75,
              depthWrite: false,
            }),
          );
          this.highlight.add(mesh);
          mesh.userData = { edge };
        }
    this.gates = [0, 1].map((i) => {
      const o = dynamic.scene.getObjectByName('DOOR_' + i);
      if (!o) throw Error('缺少个人舱门 ' + i);
      return { node: o, base: o.position.clone() };
    });
    if (this.physical) this.configurePhysical(dynamic.scene);
    for (let id = 0; id < 2; id++) {
      const rover = this.normalize(this.prepare(id ? gold.scene : blue.scene), 1.9);
      this.scene.add(rover);
      this.rovers.push(rover);
      const wheels = [];
      rover.traverse((o) => {
        if (o.name.startsWith('wheel_')) wheels.push({ node: o, base: o.quaternion.clone() });
      });
      this.effects[id].wheels = wheels;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.1, 36),
        new THREE.MeshBasicMaterial({
          color: colors[id],
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.effects[id].locator = ring;
      const beaconPos = this.physical
        ? this.displayMap.anchors[id].beacon
        : map.assets.find((a) => a.id === (id ? 'BEACON_GOLD' : 'BEACON_BLUE')).xy;
      const beacon = this.ring(2, 2.13, colors[id]);
      beacon.position.set(beaconPos[0], elevation(...beaconPos) + 0.15, -beaconPos[1]);
      beacon.visible = false;
      this.effects[id].beacon = beacon;
      const beaconLight = new THREE.PointLight(colors[id], 0, 9, 2);
      beaconLight.position.copy(beacon.position).y += 3;
      this.scene.add(beaconLight);
      this.effects[id].beaconLight = beaconLight;
      const warning = this.ring(1.7, 1.88, 0xff845f);
      warning.visible = false;
      this.effects[id].warning = warning;
      const rock = this.normalize(this.prepare(meteor.scene.clone(true)), 2.3);
      rock.visible = false;
      this.scene.add(rock);
      this.effects[id].rock = rock;
      const finish = this.ring(3.0, 3.17, colors[id]);
      finish.position.copy(
        vec(mapPoint(this.physical ? anchor(3, 51, 0, id) : [1490, 0], id, 0.17)),
      );
      this.effects[id].finish = finish;
      const gateLight = new THREE.PointLight(0xffbd76, 12, 5, 2);
      gateLight.position.copy(this.gates[id].base).y += 1.4;
      this.scene.add(gateLight);
      this.addLabel(
        id ? '黄方' : '蓝方',
        () => this.rovers[id].position.clone().add(new THREE.Vector3(0, 2.2, 0)),
        'rover-tag ' + (id ? 'gold' : 'blue'),
      );
      this.addLabel('撤离舱 ' + (id ? 'B' : 'A'), vec(mapPoint([1490, 0], id, 2)), 'dock-tag');
    }
    if (!this.physical)
      for (const [text, p, id] of [
        ['信标回廊', [370, -155], 0],
        ['废弃栈道', [370, 224], 0],
        ['归航环路', [1200, 195], 1],
        ['碎隙捷径', [1215, -95], 1],
      ])
        this.addLabel(text, vec(mapPoint(p, id, 0.3)), 'route-tag');
    this.faultLight = new THREE.PointLight(0x5eafff, 0, 36, 1.6);
    this.faultLight.position.set(0, 1, -6);
    this.scene.add(this.faultLight);
    this.dust = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 1 }),
      100,
    );
    this.dust.count = 0;
    this.dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.loaded = true;
    this.status.remove();
    this.setView(this.physical ? 'overview' : 'game');
  }
  configurePhysical(dynamic) {
    const material = this.roads[0].material.clone();
    material.color.setHex(0x8b9195);
    for (const o of this.roads) o.visible = false;
    this.roads = [];
    for (const edge of this.displayMap.roads) {
      const surface = this.ribbon(edge.points_xy, 2.6, 0.045, material);
      const uv = [];
      const pos = surface.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / 4, -pos.getZ(i) / 4);
      surface.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      surface.receiveShadow = true;
      surface.userData = { edge };
      this.scene.add(surface);
      this.roads.push(surface);
      const line = this.ribbon(
        edge.points_xy,
        0.1,
        0.1,
        new THREE.MeshBasicMaterial({
          color: colors[edge.player_id],
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        }),
      );
      line.userData = { edge };
      this.highlight.add(line);
    }
    // Batch identical visibility groups; geometry and state-driven membership stay unchanged.
    this.roadEdgeCount = this.roads.length;
    const mergeGroups = (meshes, parent, groupKey) => {
      const groups = new Map();
      for (const o of meshes) {
        const key = groupKey(o.userData.edge);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(o);
      }
      return [...groups.values()].map((items) => {
        const mesh = new THREE.Mesh(
          mergeGeometries(items.map((o) => o.geometry)),
          items[0].material,
        );
        mesh.userData = items[0].userData;
        mesh.receiveShadow = items[0].receiveShadow;
        for (const o of items) {
          parent.remove(o);
          o.geometry.dispose();
        }
        parent.add(mesh);
        return mesh;
      });
    };
    this.roads = mergeGroups(
      this.roads,
      this.scene,
      (e) =>
        `${e.player_id}/${e.routes.every((k) => k.startsWith('s3_collapse')) ? 'collapse' : e.routes.every((k) => k.startsWith('s3_stable')) ? 'stable' : 'always'}`,
    );
    mergeGroups(
      [...this.highlight.children],
      this.highlight,
      (e) => `${e.player_id}/${[...e.routes].sort().join(',')}`,
    );
    for (let id = 0; id < 2; id++) {
      const a = this.displayMap.anchors[id];
      const beacon = dynamic.getObjectByName(id ? 'BEACON_GOLD' : 'BEACON_BLUE');
      if (!beacon) throw Error('缺少信标模型');
      beacon.position.set(a.beacon[0] + (id ? 2.6 : -2.6), a.beacon[2], -a.beacon[1]);
      this.gates[id].base.set(a.gate[0], a.gate[2] + 1.32, -a.gate[1]);
      for (const [text, p] of [
        ['信标回廊', anchor(1, 19, -3, id)],
        ['废弃栈道', anchor(1, 18, 3, id)],
        ['月震衔接', anchor(2, 34, 0, id)],
        ['末段分岔', anchor(3, 38, 0, id)],
      ])
        this.addLabel(text, vec(mapPoint(p, id, 1.5)), 'route-tag');
    }
  }
  ring(a, b, color) {
    const o = new THREE.Mesh(
      new THREE.RingGeometry(a, b, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    o.rotation.x = -Math.PI / 2;
    this.scene.add(o);
    return o;
  }
  ribbon(points, width, offset, material) {
    const p = [];
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1],
        b = points[j],
        n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let i = 0; i < n; i++)
        p.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
    }
    p.push(points.at(-1));
    const v = [],
      ix = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)],
        b = p[Math.min(p.length - 1, i + 1)],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        l = Math.hypot(dx, dy);
      for (const sign of [-1, 1])
        v.push(
          p[i][0] - (((dy / l) * width) / 2) * sign,
          elevation(...p[i]) + offset,
          -p[i][1] - (((dx / l) * width) / 2) * sign,
        );
      if (i < p.length - 1) ix.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
  addLabel(text, point, cls) {
    const el = document.createElement('span');
    el.className = 'world-label ' + cls;
    el.textContent = text;
    this.canvas.parentElement.append(el);
    this.labels.push({ el, point });
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.width = r.width;
    this.height = r.height;
    const pixelRatio = Math.min(devicePixelRatio, 1.5, Math.sqrt(1800000 / (r.width * r.height)));
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(r.width, r.height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(r.width, r.height);
    this.ao.setSize(Math.ceil(r.width * pixelRatio * 0.5), Math.ceil(r.height * pixelRatio * 0.5));
    this.hudCamera.left = (-3 * r.width) / r.height;
    this.hudCamera.right = -this.hudCamera.left;
    this.hudCamera.updateProjectionMatrix();
    this.setView(this.mode === 'free' ? 'game' : this.mode);
  }
  modeUI() {
    document
      .querySelectorAll('[data-view]')
      .forEach((b) => b.classList.toggle('active', b.dataset.view === this.mode));
  }
  setView(mode) {
    this.mode = mode;
    const a = (this.width || 1600) / (this.height || 900);
    this.camera.zoom = 1;
    const target = new THREE.Vector3(
      0,
      3,
      mode === 'overview' ? (this.physical ? 0 : -13) : mode === 'game' ? 20 : 0,
    );
    this.controls.target.copy(target);
    this.camera.up.set(0, 1, 0);
    if (mode === 'top') {
      this.camera.position.copy(target).add(new THREE.Vector3(0, 240, 0.01));
      this.camera.up.set(0, 0, -1);
    } else
      this.camera.position
        .copy(target)
        .add(
          mode === 'overview' ? new THREE.Vector3(105, 150, 180) : new THREE.Vector3(28, 175, 145),
        );
    this.camera.lookAt(target);
    const half = mode === 'overview' ? (this.physical ? 54 : 72) : mode === 'top' ? 67 : 42;
    this.camera.left = -Math.max(half * a, 62);
    this.camera.right = -this.camera.left;
    this.camera.top = this.camera.right / a;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.ao.gtaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.ao.gtaoMaterial.needsUpdate = true;
    this.modeUI();
  }
  resetEffects() {
    this.lastTime = 0;
    this.frames = [];
    for (const e of this.effects) {
      e.beaconAt = null;
      e.arrivedAt = null;
    }
    this.clearCards();
  }
  clearCards() {
    for (const card of this.cards.values()) {
      this.hud.remove(card);
      card.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
    this.cards.clear();
  }
  preview() {}
  previewQuake() {} // Legacy controls are hidden; production FX come only from Race state.
  makeCard(key) {
    const group = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.8),
        new THREE.MeshBasicMaterial({ map: this.cardTextures[i], side: THREE.FrontSide }),
      );
      mesh.rotation.y = i * Math.PI;
      mesh.position.z = i ? -0.004 : 0.004;
      group.add(mesh);
    }
    this.hud.add(group);
    this.cards.set(key, group);
    return group;
  }
  updateCards(shots) {
    const active = new Set();
    for (const shot of shots) {
      const t = shot.age;
      if (t < 0 || t >= 2) continue;
      active.add(shot.key);
      const card = this.cards.get(shot.key) || this.makeCard(shot.key),
        rise = smooth(t / 0.25),
        flip = smooth((t - 0.25) / 0.5),
        fly = smooth((t - 1) / 1);
      const p = shot.target.clone().project(this.camera);
      card.position.set(
        THREE.MathUtils.lerp(shot.attacker ? 2 : -2, p.x * this.hudCamera.right, fly),
        THREE.MathUtils.lerp(-3 * (1 - rise), p.y * 3, fly),
        1,
      );
      card.rotation.set(0, Math.PI * (1 - flip) + fly * 5, fly * 0.45);
      card.scale.setScalar((0.5 + rise * 0.5) * (1 - fly * 0.95));
    }
    for (const [key, card] of this.cards)
      if (!active.has(key)) {
        this.hud.remove(card);
        card.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            o.material.dispose();
          }
        });
        this.cards.delete(key);
      }
  }
  update(race) {
    const wall = performance.now();
    if (this.lastWall && wall - this.lastWall < 250) this.frames.push(wall - this.lastWall);
    this.lastWall = wall;
    if (this.frames.length > 300) this.frames.shift();
    if (!this.loaded) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const dt = Math.max(0, Math.min(0.1, race.time - this.lastTime));
    this.lastTime = race.time;
    const qAge = race.quake === null ? -1 : race.time - race.quake;
    const q = qAge < 0 ? 0 : smooth(qAge / 1.2);
    for (let i = 0; i < this.faults.length; i++) {
      const o = this.faults[i];
      o.visible = qAge >= i * 0.035;
      o.material.emissiveIntensity = q * (1.2 + 0.2 * Math.sin(race.time * 3 + i));
    }
    this.faultLight.intensity = q * (45 + 5 * Math.sin(race.time * 4));
    for (const o of this.roads) {
      if (this.physical) {
        const e = o.userData.edge;
        o.visible = roadState(e, race.players[e.player_id], race).visible;
        continue;
      }
      const d = o.userData,
        p = race.players[d.player_id],
        on = routeActive(p, d.route_key, d.route_kind, race);
      o.material.color.setRGB(
        ...(on ? (d.player_id ? [0.83, 0.76, 0.59] : [0.61, 0.77, 0.83]) : [0.56, 0.59, 0.62]),
      );
      o.material.emissive.set(on ? colors[d.player_id] : 0x000000);
      o.material.emissiveIntensity = on ? 0.075 : 0;
      o.visible =
        !(d.route_key === 'stable' && race.aftershock === 'collapse') &&
        !(d.route_kind === 'collapse_detour' && race.aftershock !== 'collapse');
    }
    for (const o of this.highlight.children) {
      const e = o.userData.edge,
        p = race.players[this.physical ? e.player_id : e.id.startsWith('blue') ? 0 : 1];
      if (this.physical) {
        const state = roadState(e, race.players[e.player_id], race);
        o.visible = state.visible && state.on;
      } else o.visible = routeActive(p, e.key, e.kind, race);
    }
    const shots = [];
    let n = 0;
    const dummy = new THREE.Object3D();
    for (const p of race.players) {
      const id = p.id,
        e = this.effects[id],
        rover = this.rovers[id];
      rover.position.copy(vec(mapPoint([p.position.x, p.position.y], id)));
      const yaw = heading(p.position.angle, id);
      rover.rotation.y = yaw;
      for (const w of e.wheels) {
        w.node.quaternion.copy(w.base);
        w.node.rotateZ((-p.distance * 0.075) / 0.22);
      }
      e.locator.position.copy(rover.position);
      e.locator.position.y += 0.035;
      e.locator.material.opacity = race.status === 'ready' ? 0.4 : 0.7;
      if (p.beacon && e.beaconAt == null) e.beaconAt = race.time;
      e.beacon.visible = p.beacon;
      e.beacon.scale.setScalar(p.beacon ? 1 + 0.2 * Math.sin((race.time - e.beaconAt) * 3) : 1);
      e.beaconLight.intensity = p.beacon ? 28 : 0;
      this.gates[id].node.position.copy(this.gates[id].base);
      this.gates[id].node.position.y += p.gate ? 2.9 : 0;
      e.finish.material.opacity = p.arrived !== null ? 1 : 0.3;
      e.finish.scale.setScalar(p.arrived !== null ? 1.12 : 1);
      e.warning.visible = false;
      e.rock.visible = false;
      if (p.rock) {
        const r = p.rock.target ? null : ROUTES[p.rock.edge];
        const s = r ? sample(r.points, r.length / 2) : null;
        const target = vec(mapPoint(p.rock.target || [s.x, s.y], id, 0.1)),
          age = race.time - p.rock.at;
        shots.push({ key: id + ':' + p.rock.at, target, age, attacker: 1 - id });
        if (!p.rock.done) {
          e.warning.visible = age < 2;
          e.warning.position.copy(target);
          e.warning.material.opacity = 0.4 + 0.5 * Math.sin(age * 15) ** 2;
          e.rock.visible = age >= 1.35;
          e.rock.position.copy(target);
          e.rock.position.y += age < 2 ? (1 - smooth((age - 1.35) / 0.65)) * 11 : 0;
          e.rock.rotation.set(0.2, age < 2 ? age * 3 : 6, 0.7);
        }
        const t = age - 2;
        if (t >= 0 && t < 1.6)
          for (let k = 0; k < 40; k++) {
            const a = k * 2.4,
              v = 1.7 + (k % 7) * 0.2;
            dummy.position
              .copy(target)
              .add(
                new THREE.Vector3(
                  Math.cos(a) * v * t,
                  Math.max(0.1, 2 * t - 1.6 * t * t),
                  Math.sin(a) * v * t,
                ),
              );
            dummy.scale.setScalar((1 - t / 1.6) * (0.6 + (k % 3) * 0.2));
            dummy.updateMatrix();
            this.dust.setMatrixAt(n++, dummy.matrix);
          }
      }
    }
    this.dust.count = n;
    this.dust.instanceMatrix.needsUpdate = true;
    if (this.mode === 'game') {
      const desired = THREE.MathUtils.clamp(
        (this.rovers[0].position.z + this.rovers[1].position.z) / 2 - 8,
        -35,
        22,
      );
      const shift = (desired - this.controls.target.z) * 0.065;
      this.controls.target.z += shift;
      this.camera.position.z += shift;
    }
    this.controls.update();
    const shake = qAge >= 0 && qAge < 1.3 ? Math.sin(qAge * 48) * 0.15 * (1 - qAge / 1.3) : 0;
    this.camera.position.y += shake;
    this.renderer.info.reset();
    this.composer.render();
    this.stats = {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
    this.updateCards(shots);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.hud, this.hudCamera);
    this.renderer.autoClear = true;
    this.camera.position.y -= shake;
    for (const label of this.labels) {
      const pos = (typeof label.point === 'function' ? label.point() : label.point)
        .clone()
        .project(this.camera);
      label.el.hidden = Math.abs(pos.x) > 0.98 || Math.abs(pos.y) > 0.94 || pos.z > 1;
      label.el.style.left = (pos.x + 1) * 0.5 * this.width + 'px';
      label.el.style.top = (1 - pos.y) * 0.5 * this.height + 'px';
    }
    this.canvas.dataset.phase = race.status;
    this.canvas.dataset.aftershock = race.aftershock || 'pending';
  }
  diagnostics() {
    const f = [...this.frames].sort((a, b) => a - b),
      median = f[Math.floor(f.length / 2)];
    return {
      ready: this.loaded,
      mode: this.mode,
      renderer: 'Blender GLB + Three.js',
      source: this.physical ? 'authoritative-hardware-state' : 'virtual-race',
      drawCalls: this.stats?.calls,
      triangles: this.stats?.triangles,
      pixelRatio: this.renderer.getPixelRatio(),
      viewport: [this.width, this.height],
      renderSize: [this.canvas.width, this.canvas.height],
      medianFps: median ? 1000 / median : null,
      p95FrameMs: f[Math.floor(f.length * 0.95)] || null,
      roadEdges: this.roadEdgeCount || this.roads.length,
      roverPositions: this.rovers.map((o) => o.position.toArray()),
      doors: this.gates?.map((g) => g.node.position.y - g.base.y),
      rocks: this.effects.map((e) => ({
        visible: !!e.rock?.visible,
        warning: !!e.warning?.visible,
        position: e.rock?.position.toArray(),
      })),
      faultVisible: this.faults.filter((o) => o.visible).length,
      errors: this.errors,
    };
  }
}
