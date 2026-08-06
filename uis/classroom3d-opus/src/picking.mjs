/**
 * Raycaster 기반 학생 선택 — 호버 시 툴팁, 클릭 시 pane 점프.
 * 레이캐스트는 프레임당 한 번만(포인터 이동마다 하면 낭비) 수행한다.
 */

export function createPicker(THREE, { renderer, camera, classroom, onHover, onPick }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const screen = { x: 0, y: 0 };
  let inside = false;
  let dirty = false;
  let hovered = null;

  const canvas = renderer.domElement;

  const toNdc = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    screen.x = event.clientX;
    screen.y = event.clientY;
  };

  canvas.addEventListener('pointermove', (event) => {
    toNdc(event);
    inside = true;
    dirty = true;
  });
  canvas.addEventListener('pointerleave', () => {
    inside = false;
    dirty = true;
  });
  canvas.addEventListener('click', (event) => {
    toNdc(event);
    const occupant = intersect();
    if (occupant) onPick(occupant);
  });

  const intersect = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(classroom.hitboxes(), false)[0];
    return hit ? classroom.occupantOf(hit.object) : null;
  };

  /** 카메라가 미세하게 움직이므로 포인터가 멈춰 있어도 가끔 다시 검사한다. */
  const update = () => {
    if (!dirty) return;
    dirty = false;
    const occupant = inside ? intersect() : null;
    const changed = occupant?.paneId !== hovered?.paneId;
    hovered = occupant;
    canvas.style.cursor = occupant ? 'pointer' : 'default';
    if (changed || occupant) onHover(occupant, screen);
  };

  const invalidate = () => {
    dirty = true;
  };

  return { update, invalidate, get hovered() { return hovered; } };
}
