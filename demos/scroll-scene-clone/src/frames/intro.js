/**
 * intro.js — 开场画面
 *
 * 对应原站首屏那个 16.4MB 的 autoplay video（播完 fadeOut，
 * 移动端换成 .ts + jsmpeg 软解以绕开 iOS 强制全屏播放器）。
 * 这里用一段自驱动的 canvas 动画代替，零体积、无自动播放限制。
 *
 * 返回 Promise，播完 resolve —— 开场编排挂在它上面，而不是像原站
 * 那样硬编码 setTimeout(1700) / setTimeout(2000)，网络慢时不会脱节。
 */

const TAU = Math.PI * 2;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function playIntro(canvas, { duration = 1900, dprCap = 1.5 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

  const size = () => {
    const r = (canvas.parentElement || canvas).getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  };
  size();
  window.addEventListener('resize', size, { passive: true });

  return new Promise((resolve) => {
    const start = performance.now();

    const draw = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const w = canvas.width;
      const h = canvas.height;
      const unit = Math.min(w, h);
      const cx = w * 0.5;
      const cy = h * 0.46;

      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, w, h);

      // 阶段 1（0~0.42）：一道水平光线从中心撑开
      const lineP = easeOut(Math.min(1, p / 0.42));
      const lineW = unit * 1.1 * lineP;
      if (lineP > 0 && p < 0.72) {
        const g = ctx.createLinearGradient(cx - lineW / 2, 0, cx + lineW / 2, 0);
        g.addColorStop(0, 'rgba(232,72,43,0)');
        g.addColorStop(0.5, `rgba(255,236,190,${1 - Math.max(0, (p - 0.42) / 0.3)})`);
        g.addColorStop(1, 'rgba(232,72,43,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - lineW / 2, cy - unit * 0.0016, lineW, unit * 0.0032);
      }

      // 阶段 2（0.28~1）：光环从中心炸开
      if (p > 0.28) {
        const ringP = easeInOut((p - 0.28) / 0.72);
        const r = unit * 0.06 + unit * 0.42 * ringP;
        ctx.strokeStyle = `rgba(255,176,32,${(1 - ringP) * 0.85})`;
        ctx.lineWidth = Math.max(1, unit * 0.004 * (1 - ringP * 0.7));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();

        const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.9);
        bloom.addColorStop(0, `rgba(255,240,214,${(1 - ringP) * 0.5})`);
        bloom.addColorStop(0.5, `rgba(255,140,40,${(1 - ringP) * 0.2})`);
        bloom.addColorStop(1, 'rgba(232,72,43,0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, TAU);
        ctx.fill();
      }

      // 阶段 3（0.5~1）：品牌字淡入
      if (p > 0.5) {
        const textP = easeOut((p - 0.5) / 0.5);
        ctx.font = `700 ${Math.round(unit * 0.042)}px -apple-system, "Helvetica Neue", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(244,244,242,${textP * 0.92})`;
        ctx.letterSpacing = '0.2em';       // 不支持的浏览器会忽略，无副作用
        ctx.fillText('VOLTA LAB', cx, cy + unit * 0.13);
      }

      if (p < 1) {
        requestAnimationFrame(draw);
      } else {
        window.removeEventListener('resize', size);
        resolve();
      }
    };

    requestAnimationFrame(draw);
  });
}
