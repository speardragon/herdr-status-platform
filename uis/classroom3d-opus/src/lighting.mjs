/**
 * 조명 — 왼쪽 창의 자연광(그림자 담당) + 천장 형광등 + blocked 학생용 스포트라이트 풀.
 * 그림자는 태양 하나만 굽는다(12명 기준 프레임 유지).
 */
import { CEILING_LAMPS, ROOM } from './layout.mjs';

const SPOTLIGHT_POOL = 3;

export function createLighting(THREE, scene) {
  const hemisphere = new THREE.HemisphereLight(0xdceaf8, 0x9c8a68, 0.48);
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(0xfff4e2, 0.15);
  scene.add(ambient);

  // 창(왼쪽 -X) 밖에서 비스듬히 들어오는 오후 햇살.
  const sun = new THREE.DirectionalLight(0xfff1d4, 2.15);
  sun.position.set(-9.5, 6.4, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 34;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.022;
  sun.target.position.set(0.5, 0.7, -5.2);
  scene.add(sun, sun.target);

  // 형광등 — 두 개만 실제 광원으로(부하 절약), 나머지는 emissive 재질이 담당.
  const lamps = [CEILING_LAMPS[0], CEILING_LAMPS[2]].map((z) => {
    const light = new THREE.PointLight(0xfff4e0, 7, 11, 2);
    light.position.set(0, ROOM.height - 0.28, z);
    scene.add(light);
    return light;
  });

  const spotlights = Array.from({ length: SPOTLIGHT_POOL }, () => {
    const spot = new THREE.SpotLight(0xffd9d2, 0, 8, 0.34, 0.62, 1.4);
    spot.castShadow = false;
    spot.visible = false;
    scene.add(spot, spot.target);
    return spot;
  });

  /**
   * blocked 학생 좌표들을 받아 스포트라이트를 재배치한다.
   * 풀 크기를 넘는 학생은 경광 링·후광만으로 표시된다(빛보다 훨씬 값싸다).
   */
  const focusSpotlights = (positions, pulse) => {
    spotlights.forEach((spot, index) => {
      const at = positions[index];
      if (!at) {
        spot.visible = false;
        spot.intensity = 0;
        return;
      }
      spot.visible = true;
      spot.position.set(at.x, ROOM.height - 0.12, at.z + 0.15);
      spot.target.position.set(at.x, 0.75, at.z);
      spot.target.updateMatrixWorld();
      spot.intensity = 26 + pulse * 16;
    });
  };

  return { sun, hemisphere, ambient, lamps, focusSpotlights };
}
