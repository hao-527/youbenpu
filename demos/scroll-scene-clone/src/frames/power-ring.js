/**
 * power-ring.js — 首屏 120 帧「能量环」程序化渲染
 *
 * 为什么不预渲染成位图数组：
 *   全屏 canvas 在 2x 屏上约 2880×1800，单帧 RGBA ≈ 20MB，
 *   120 帧直接 2.4GB。原站是加载 120 张 46KB 的 WebP（约 5.5MB），
 *   本 demo 不带二进制素材，所以改成按帧号确定性绘制。
 *
 * 性能要点：不随帧号变化的图层（背景渐变、暗角）缓存到离屏 canvas，
 * 每帧只重绘会动的部分。否则全屏 createRadialGradient 每帧跑两次很贵。
 */

const TAU = Math.PI * 2;
const SEGMENTS = 168;

/** 固定抖动表：让环看起来不那么机械，但必须是确定性的（同一帧号画出同一张图） */
const JITTER = Array.from({ length: SEGMENTS }, (_, k) => {
  const s = Math.sin(k * 12.9898) * 43758.5453;
  return s - Math.floor(s);                  // 伪随机 0~1，无状态
});

function createSurface(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function mixColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

const ACCENT = [232, 72, 43];
const GOLD = [255, 176, 32];

/**
 * @param {object} [o]
 * @param {number} [o.count=120]
 * @returns {(ctx:CanvasRenderingContext2D, i:number, w:number, h:number)=>void}
 */
export function makePowerRingRenderer({ count = 120 } = {}) {
  let bg = null;
  let bgKey = '';

  /** 静态背景层：径向底色 + 网格 + 暗角，只在尺寸变化时重建 */
  function getBackground(w, h) {
    const key = `${w}x${h}`;
    if (bgKey === key && bg) return bg;

    const surf = createSurface(w, h);
    const c = surf.getContext('2d');
    const unit = Math.min(w, h);

    const base = c.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, unit * 0.95);
    base.addColorStop(0, '#191320');
    base.addColorStop(0.55, '#0d0c11');
    base.addColorStop(1, '#07070a');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);

    // 细网格，给画面一点工业感
    c.strokeStyle = 'rgba(244,244,242,0.028)';
    c.lineWidth = Math.max(1, unit * 0.0008);
    const step = unit * 0.062;
    c.beginPath();
    for (let x = step; x < w; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = step; y < h; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();

    // 暗角
    const vig = c.createRadialGradient(w * 0.5, h * 0.5, unit * 0.32, w * 0.5, h * 0.5, unit * 0.92);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.72)');
    c.fillStyle = vig;
    c.fillRect(0, 0, w, h);

    bg = surf;
    bgKey = key;
    return bg;
  }

  return function renderPowerRing(ctx, i, w, h) {
    const t = count > 1 ? i / (count - 1) : 0;      // 归一化进度 0→1
    const unit = Math.min(w, h);

    /* ── 环心随进度左移 ──
       heroClip 关键帧会把画面收缩成左侧卡片（右侧 inset 55vw），
       如果环心一直待在视口中心，收缩后就会被卡片右边缘切掉。
       序列帧和 --go 由同一条滚动进度驱动，所以这里直接按帧号左移，
       落点对齐收缩后卡片的中心。竖屏是收成顶部卡片，只需微调。 */
    const portrait = h > w;
    const cx = portrait ? w * 0.5 : w * (0.5 - t * 0.245);
    const cy = portrait ? h * (0.46 - t * 0.2) : h * 0.46;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(getBackground(w, h), 0, 0);

    // 镜头推进：克制一点，收缩后的卡片才装得下整个环
    const zoom = 1 + t * 0.1;
    const spin = t * TAU * 0.42;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    const R = unit * 0.245;
    const segW = Math.max(1, unit * 0.0034);

    /* ── 环形阴极：168 根径向段，长度和亮度受一列行波调制 ── */
    ctx.lineCap = 'round';
    ctx.lineWidth = segW;
    for (let k = 0; k < SEGMENTS; k += 1) {
      const a = (k / SEGMENTS) * TAU + spin;
      // 三条不同频率的波叠加，避免图案过于规整
      const wave =
        Math.sin((k / SEGMENTS) * TAU * 3 - t * TAU * 2) * 0.55 +
        Math.sin((k / SEGMENTS) * TAU * 7 + t * TAU * 1.3) * 0.28 +
        (JITTER[k] - 0.5) * 0.34;

      const inner = R * (0.74 + wave * 0.06);
      const outer = R * (1.03 + wave * 0.155);
      const energy = Math.min(1, Math.max(0, (wave + 1) / 2));

      ctx.strokeStyle = mixColor(ACCENT, GOLD, energy);
      ctx.globalAlpha = 0.2 + energy * 0.78;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* ── 扫描高光弧：随进度绕一圈 ──
       用逐段递增的 alpha 画出拖尾，比横跨整个包围盒的 linearGradient
       干净得多（那样在暗背景上会糊成一片橄榄绿）。 */
    const sweep = t * TAU * 1.5;
    const trail = TAU * 0.17;
    const steps = 22;
    ctx.lineWidth = segW * 2.2;
    ctx.lineCap = 'butt';
    for (let s = 0; s < steps; s += 1) {
      const f = s / steps;
      const a0 = sweep + trail * f;
      const a1 = sweep + trail * ((s + 1) / steps) + 0.004;
      ctx.strokeStyle = `rgba(255,242,214,${Math.pow(f, 2.2) * 0.95})`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.09, a0, a1);
      ctx.stroke();
    }
    ctx.lineCap = 'round';

    /* ── 中心核：脉冲发光 ── */
    const pulse = 0.5 + Math.sin(t * TAU * 3) * 0.5;
    const coreR = R * (0.52 + pulse * 0.1);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, `rgba(255,240,214,${0.62 + pulse * 0.3})`);
    core.addColorStop(0.34, 'rgba(255,150,40,0.42)');
    core.addColorStop(0.7, 'rgba(232,72,43,0.14)');
    core.addColorStop(1, 'rgba(232,72,43,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.fill();

    /* ── 两圈虚线环，反向自转 ── */
    ctx.setLineDash([unit * 0.006, unit * 0.016]);
    ctx.lineWidth = Math.max(1, unit * 0.0012);

    ctx.strokeStyle = 'rgba(244,244,242,0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.34, -spin * 1.6, -spin * 1.6 + TAU);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244,244,242,0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.72, spin * 1.1, spin * 1.1 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    /* ── 轨道上的粒子 ── */
    for (let k = 0; k < 7; k += 1) {
      const orbit = R * (1.34 + (k % 3) * 0.19);
      const a = spin * (1.5 + k * 0.42) + (k / 7) * TAU;
      const r = unit * (0.0026 + (k % 2) * 0.0016);
      ctx.fillStyle = k % 2 ? 'rgba(255,176,32,0.95)' : 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * orbit, Math.sin(a) * orbit, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    /* ── 帧号水印：方便直观确认「滚动 → 帧号」映射生效 ──
       放左下、避开右下角的脚注文字 ── */
    ctx.font = `600 ${Math.round(unit * 0.016)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = 'rgba(244,244,242,0.3)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // x 取 0.12unit：既在全屏状态下不贴边，也落在收缩后卡片的内侧
    ctx.fillText(
      `FRAME ${String(i).padStart(3, '0')} / ${count - 1}`,
      unit * 0.12,
      h - unit * 0.13
    );
  };
}
