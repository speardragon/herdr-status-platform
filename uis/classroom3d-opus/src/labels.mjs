/**
 * 머리 위 빌보드 라벨 — 이름/kind + 지금 하는 일(title)을 CanvasTexture 스프라이트로 띄운다.
 * 텍스처는 내용이 바뀔 때만 다시 그린다(매 프레임 canvas 갱신은 GPU 업로드 비용이 크다).
 */
import { kindOf, statusOf } from './palette.mjs';
import { ellipsize } from './util.mjs';
import { canvasTexture } from './textures.mjs';

const WIDTH = 512;
const HEIGHT = 158;
/** 앞줄에서 과하게 커지지 않는 기본 크기. 거리 보정은 setScale이 맡는다. */
const SPRITE_SCALE = { x: 0.78, y: 0.24 };

const roundRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

export function createLabel(THREE, parent) {
  const surface = canvasTexture(THREE, WIDTH, HEIGHT);
  const material = new THREE.SpriteMaterial({
    map: surface.texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SPRITE_SCALE.x, SPRITE_SCALE.y, 1);
  sprite.renderOrder = 6;
  sprite.visible = false;
  parent.add(sprite);

  let signature = '';

  const draw = ({ name, paneId, kind, status, title }) => {
    const { ctx } = surface;
    const accent = statusOf(status).css;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(13,16,21,0.82)';
    roundRect(ctx, 6, 6, WIDTH - 12, HEIGHT - 12, 22);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = accent;
    roundRect(ctx, 18, 22, 9, HEIGHT - 44, 5);
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2f6fb';
    ctx.font = '700 40px system-ui, "Apple SD Gothic Neo", sans-serif';
    ctx.fillText(ellipsize(name ?? paneId, 13), 44, 48);

    const kindLabel = `${kind} · ${paneId}`;
    ctx.font = '600 26px ui-monospace, monospace';
    ctx.fillStyle = kindOf(kind).css;
    const nameWidth = ctx.measureText(kindLabel).width;
    ctx.fillText(kindLabel, WIDTH - 30 - nameWidth, 46);

    ctx.font = '500 30px system-ui, "Apple SD Gothic Neo", sans-serif';
    ctx.fillStyle = '#c6d0dc';
    ctx.fillText(ellipsize(title || statusOf(status).label, 24), 44, 104);
    surface.texture.needsUpdate = true;
  };

  /** 내용이 바뀌었을 때만 다시 그린다. */
  const set = (occupant) => {
    if (!occupant) {
      sprite.visible = false;
      signature = '';
      return;
    }
    const next = `${occupant.name}|${occupant.paneId}|${occupant.kind}|${occupant.status}|${occupant.title}`;
    sprite.visible = true;
    if (next === signature) return;
    signature = next;
    draw(occupant);
  };

  /**
   * 거리 보정 + 전이 강조.
   * 뒷줄까지 글씨가 읽히도록 거리에 따라 살짝 키운다(완전 보정하면 원근이 죽는다).
   */
  const setScale = (distance, emphasis) => {
    const compensation = Math.min(0.72 + distance * 0.055, 1.12);
    const scale = compensation * (1 + emphasis * 0.14);
    sprite.scale.set(SPRITE_SCALE.x * scale, SPRITE_SCALE.y * scale, 1);
    material.color.setScalar(1 + emphasis * 0.9);
  };

  return { sprite, set, setScale };
}
