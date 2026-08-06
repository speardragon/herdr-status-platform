/**
 * 지오메트리 빌드 헬퍼 — 박스/판 추가와 재질 생성을 한 줄로.
 * BoxGeometry는 단위 큐브 하나를 공유하고 scale로 치수를 만든다(지오메트리 수를 상수로 유지).
 */

let unitBox = null;
let unitPlane = null;

const geometries = (THREE) => {
  unitBox = unitBox ?? new THREE.BoxGeometry(1, 1, 1);
  unitPlane = unitPlane ?? new THREE.PlaneGeometry(1, 1);
  return { unitBox, unitPlane };
};

export function standard(THREE, color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.04,
    map: options.map ?? null,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    side: options.side ?? THREE.FrontSide,
    flatShading: options.flatShading ?? false,
  });
}

/** 단위 큐브 기반 박스. size=[w,h,d], at=[x,y,z]. */
export function box(THREE, parent, material, size, at, name = '') {
  const mesh = new THREE.Mesh(geometries(THREE).unitBox, material);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(at[0], at[1], at[2]);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/** 단위 평면 기반 판. rotation은 [x,y,z] 라디안. */
export function plane(THREE, parent, material, size, at, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometries(THREE).unitPlane, material);
  mesh.scale.set(size[0], size[1], 1);
  mesh.position.set(at[0], at[1], at[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/** 하위 메시들의 그림자 플래그를 한 번에 설정. */
export function setShadow(root, { cast = false, receive = false } = {}) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = cast;
    object.receiveShadow = receive;
  });
  return root;
}
