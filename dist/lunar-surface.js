// Accepted lunar surface finish. Only material shaders change; geometry and state stay authoritative.
export function applyRoadFinish(world, { local = false } = {}) {
  world.scene.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name === 'LOCAL / fractured escarpment') {
        material.color.setRGB(0.72, 0.7, 0.67);
        material.roughness = 1;
        material.normalScale?.setScalar(0.65);
      }
    }
  });
  for (const material of new Set(world.roads.map((road) => road.material))) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 localReviewPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nlocalReviewPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      shader.fragmentShader = 'varying vec3 localReviewPosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Smooth transition at the boundary of the reviewed west opening sector.
        vec2 p = localReviewPosition.xz;
        float localWeight = ${local ? 'smoothstep(-69.0,-63.0,p.x)*(1.0-smoothstep(-21.0,-15.0,p.x))*smoothstep(0.0,6.0,p.y)*(1.0-smoothstep(55.0,61.0,p.y))' : '1.0'};
        // Compacted, dust-coated mineral surface rather than black asphalt.
        // Preserve the existing texture variation, silhouette and all route vertices.
        vec3 dustRoad = diffuseColor.rgb * vec3(1.65,1.57,1.45) + vec3(0.012,0.011,0.010);
        diffuseColor.rgb = mix(diffuseColor.rgb, dustRoad, localWeight);`,
      );
    };
    material.customProgramCacheKey = () => `moonfall-road-dust-v2-${local ? 'local' : 'global'}`;
    material.needsUpdate = true;
  }
}
