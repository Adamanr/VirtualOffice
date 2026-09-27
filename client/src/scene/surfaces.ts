import * as THREE from 'three'

/**
 * PBR surfaces of the building (Poly Haven CC0 textures, see shared/tools/office):
 * carpet, parquet, kitchen tiles, painted plaster walls and the suspended
 * ceiling. Textures are mapped in world space, so an instanced unit box
 * stretched into a 12 m wall gets plaster at its real scale, not smeared.
 */
export type Surface = 'carpet' | 'wood' | 'tiles' | 'wall' | 'ceiling'

/** Metres per texture repeat. */
const TILE: Record<Surface, number> = { carpet: 2, wood: 2.4, tiles: 1.2, wall: 3, ceiling: 2.4 }

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()

function texture(surface: Surface, kind: 'diffuse' | 'nor_gl' | 'rough') {
  const key = `${surface}_${kind}`
  let t = cache.get(key)
  if (!t) {
    t = loader.load(`/office/tex/${key}.webp`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (kind === 'diffuse') t.colorSpace = THREE.SRGBColorSpace
    cache.set(key, t)
  }
  return t
}

/**
 * Makes a material take its texture coordinates from the world position,
 * projected along the dominant axis of the normal (a cheap triplanar): works
 * for instanced boxes of any size and for big floor planes alike.
 */
export function applyWorldUv<T extends THREE.Material>(material: T, tile: number): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldTile = { value: tile }
    shader.vertexShader = 'uniform float uWorldTile;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        vec4 wp = vec4(position, 1.0);
        vec3 wn = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          wn = mat3(instanceMatrix) * wn;
        #endif
        wp = modelMatrix * wp;
        vec3 an = abs(normalize(mat3(modelMatrix) * wn));
        vec2 wuv = (an.x > an.y && an.x > an.z) ? wp.zy : (an.y > an.z ? wp.xz : wp.xy);
        wuv /= uWorldTile;
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif
      }`,
    )
  }
  material.customProgramCacheKey = () => `worlduv-${tile}`
  return material
}

const materials = new Map<string, THREE.MeshStandardMaterial>()

/** A shared PBR material for a surface, optionally tinted (zone floor colours, wall paint). */
export function surfaceMaterial(surface: Surface, tint = '#ffffff', extra: THREE.MeshStandardMaterialParameters = {}) {
  const key = `${surface}:${tint}:${JSON.stringify(extra)}`
  let m = materials.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: texture(surface, 'diffuse'),
      normalMap: texture(surface, 'nor_gl'),
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: texture(surface, 'rough'),
      roughness: 1,
      metalness: 0,
      color: tint,
      ...extra,
    })
    applyWorldUv(m, TILE[surface])
    materials.set(key, m)
  }
  return m
}
