/**
 * battery.js — 时间轴上的 150 帧电池程序化渲染
 *
 * 这一节演示「双通道绑同一条滚动进度」：
 *   通道 1（GSAP transform）electric 沿横轴移动
 *   通道 2（帧号）        电量随进度充满
 * 两者共用一条 ScrollTrigger 时间轴，所以永远同步。
 */

const TAU = Math.PI * 2;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * @param {object} [o]
 * @param {number} [o.count=150]
 * @returns {(ctx:CanvasRenderingContext2D, i:number, w:number, h:number)=>void}
 */
export function makeBatteryRenderer({ count = 150 } = {}) {
  return function renderBattery(ctx, i, w, h) {
    const t = count > 1 ? i / (count - 1) : 0;
    ctx.clearRect(0, 0, w, h);

    // 机身几何
    const bodyH = h * 0.6;
    const bodyY = (h - bodyH) / 2;
    const bodyX = w * 0.035;
    const nubW = w * 0.022;
    const bodyW = w * 0.905 - nubW;
    const radius = bodyH * 0.26;

    /* ── 背后光晕：电量越足越亮 ── */
    const glow = ctx.createRadialGradient(
      bodyX + bodyW * 0.5, h * 0.5, 0,
      bodyX + bodyW * 0.5, h * 0.5, w * 0.5
    );
    glow.addColorStop(0, `rgba(255,150,40,${0.1 + t * 0.2})`);
    glow.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    /* ── 正极端子 ── */
    const nubH = bodyH * 0.42;
    ctx.fillStyle = '#9a9aa4';
    roundRect(ctx, bodyX + bodyW - 1, (h - nubH) / 2, nubW + 1, nubH, nubH * 0.3);
    ctx.fill();

    /* ── 外壳：竖向金属渐变 ── */
    const shell = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
    shell.addColorStop(0, '#3a3a44');
    shell.addColorStop(0.16, '#6e6e7c');
    shell.addColorStop(0.5, '#2a2a32');
    shell.addColorStop(0.86, '#4a4a56');
    shell.addColorStop(1, '#1e1e25');
    ctx.fillStyle = shell;
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, radius);
    ctx.fill();

    /* ── 内腔 ── */
    const pad = bodyH * 0.115;
    const cavX = bodyX + pad;
    const cavY = bodyY + pad;
    const cavW = bodyW - pad * 2;
    const cavH = bodyH - pad * 2;
    ctx.fillStyle = '#111117';
    roundRect(ctx, cavX, cavY, cavW, cavH, radius * 0.6);
    ctx.fill();

    /* ── 电量填充：ease-out 让前段涨得快一些 ── */
    const fillT = 1 - Math.pow(1 - t, 1.7);
    const fillW = cavW * fillT;

    if (fillW > 1) {
      ctx.save();
      roundRect(ctx, cavX, cavY, cavW, cavH, radius * 0.6);
      ctx.clip();

      const juice = ctx.createLinearGradient(cavX, 0, cavX + cavW, 0);
      juice.addColorStop(0, '#e8482b');
      juice.addColorStop(0.55, '#ff8a1f');
      juice.addColorStop(1, '#ffc44d');
      ctx.fillStyle = juice;
      ctx.fillRect(cavX, cavY, fillW, cavH);

      // 内部竖向刻度，制造"电芯卷绕"的密度感
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = Math.max(1, w * 0.0012);
      const tick = cavH * 0.42;
      ctx.beginPath();
      for (let x = cavX + tick; x < cavX + fillW; x += tick) {
        ctx.moveTo(x, cavY);
        ctx.lineTo(x, cavY + cavH);
      }
      ctx.stroke();

      // 电流波前
      const edge = cavX + fillW;
      const pulse = 0.55 + Math.sin(t * TAU * 6) * 0.45;
      const front = ctx.createLinearGradient(edge - cavH * 0.5, 0, edge, 0);
      front.addColorStop(0, 'rgba(255,255,255,0)');
      front.addColorStop(1, `rgba(255,248,225,${0.5 + pulse * 0.45})`);
      ctx.fillStyle = front;
      ctx.fillRect(edge - cavH * 0.5, cavY, cavH * 0.5, cavH);

      // 顶部高光
      const sheen = ctx.createLinearGradient(0, cavY, 0, cavY + cavH * 0.42);
      sheen.addColorStop(0, 'rgba(255,255,255,0.3)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(cavX, cavY, fillW, cavH * 0.42);

      ctx.restore();
    }

    /* ── 左端环形阴极剖面：随进度自转 ── */
    const ringCx = cavX + cavH * 0.5;
    const ringCy = h * 0.5;
    const ringR = cavH * 0.3;
    ctx.save();
    ctx.translate(ringCx, ringCy);
    ctx.rotate(t * TAU * 2.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, w * 0.0014);
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * ringR * 0.42, Math.sin(a) * ringR * 0.42);
      ctx.lineTo(Math.cos(a) * ringR, Math.sin(a) * ringR);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, ringR * 0.42, 0, TAU);
    ctx.stroke();
    ctx.restore();

    /* ── 外壳描边 ── */
    ctx.strokeStyle = 'rgba(244,244,242,0.22)';
    ctx.lineWidth = Math.max(1, w * 0.0012);
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, radius);
    ctx.stroke();

    /* ── 读数 ── */
    const fs = Math.round(h * 0.15);
    ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(244,244,242,0.8)';
    ctx.fillText(`${Math.round(fillT * 100)}%`, bodyX, bodyY - h * 0.1);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244,244,242,0.34)';
    ctx.font = `600 ${Math.round(h * 0.11)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(`FRAME ${String(i).padStart(3, '0')} / ${count - 1}`, bodyX + bodyW, bodyY + bodyH + h * 0.12);
  };
}
