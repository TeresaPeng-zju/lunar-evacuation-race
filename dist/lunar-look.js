// Presentation only: material families retain their imported PBR maps. No vertex,
// transform, route, anchor, physics or floor-display data is changed here.
export function applyLunarLook(world) {
  const { scene, sun, renderer, ao, bloom } = world;
  renderer.toneMappingExposure = 1.12;
  scene.background.setHex(0x202735);
  scene.fog.color.setHex(0x464b5b);
  scene.fog.density = 0.00065;
  scene.environmentIntensity = 0.78;
  scene.traverse((o) => {
    if (o.isHemisphereLight) {
      o.color.setHex(0xc7d4f0);
      o.groundColor.setHex(0x635c58);
      o.intensity = 0.85;
    }
  });
  sun.color.setHex(0xffdfbb);
  sun.intensity = 3.4;
  sun.position.set(-55, 72, -80);
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00045;
  sun.shadow.normalBias = 0.12;
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  ao.blendIntensity = 0.48;
  ao.updateGtaoMaterial({ radius: 0.8, thickness: 1.2, distanceFallOff: 1, samples: 8 });
  bloom.strength = 0.16;
  bloom.radius = 0.35;
  bloom.threshold = 1.8;

  const materials = new Set();
  scene.traverse((o) => {
    if (o.isMesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const m of materials) {
    if (!m.isMeshStandardMaterial || m.userData.lunarLook) continue;
    m.userData.lunarLook = true;
    const n = m.name;
    if (n.startsWith('STATION /')) {
      // Keep authored PBR and secondary-UV occlusion. GTAO supplies screen-space contacts.
      m.aoMapIntensity = 0.45;
    } else if (n.startsWith('Lunar regolith')) {
      m.color.setRGB(1.32, 1.21, 1.14);
      m.metalness = 0;
      m.roughness = 1;
      m.normalScale.setScalar(0.62);
      m.aoMapIntensity = 0.55;
    } else if (n === 'Compacted lunar transport surface') {
      m.color.setRGB(0.4, 0.43, 0.48);
      m.metalness = 0;
      m.roughness = 0.95;
      m.normalScale.setScalar(0.35);
      m.aoMapIntensity = 0.4;
      // Suppress coplanar intersection speckles without changing a single vertex.
      m.polygonOffset = true;
      m.polygonOffsetFactor = 0;
      m.polygonOffsetUnits = -2;
    } else if (n === 'Weathered titanium') {
      m.color.setRGB(1.9, 1.78, 1.6);
      m.metalness = 0.48;
      m.roughness = 0.61;
      m.normalScale.setScalar(0.22);
    } else if (n === 'Graphite steel' || n === 'Carbon graphite') {
      m.color.setRGB(0.15, 0.17, 0.2);
      m.metalness = 0.45;
      m.roughness = 0.72;
    } else if (n === 'CLAY / aged framework') {
      m.color.setRGB(0.27, 0.29, 0.32);
      m.metalness = 0.5;
      m.roughness = 0.67;
    } else if (n === 'Basalt regolith') {
      m.color.setRGB(0.29, 0.28, 0.27);
      m.metalness = 0;
      m.roughness = 0.98;
    } else if (n === 'Fractured basalt') {
      m.color.setRGB(1.18, 1.1, 1.02);
      m.metalness = 0;
      m.normalScale.setScalar(0.55);
    } else if (n === 'Faded ceramic paint' || n === 'Ceramic shell') {
      m.color.setRGB(0.57, 0.54, 0.49);
      m.metalness = 0.16;
      m.roughness = 0.69;
    } else if (n === 'Relic ion violet') {
      m.color.setHex(0x89bacb);
      m.emissive.setHex(0x71b5d1);
      m.emissiveIntensity = 1.8;
    } else if (/Navigation amber|Thermal copper/.test(n)) {
      if (m.emissiveIntensity > 1) {
        m.emissive.setHex(0xffb95e);
        m.emissiveIntensity = 3.2;
      }
    }
    m.needsUpdate = true;
  }
  world.look = 'unified';
}
