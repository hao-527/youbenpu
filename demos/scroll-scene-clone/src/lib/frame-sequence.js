/**
 * frame-sequence.js — Canvas 序列帧
 *
 * 复刻原站 `class wr` / `class Qr` 的行为，两条数据源都实现了：
 *
 *   1. src:    (i) => url    真实图片序列。原站就是这条路
 *                            （bannerFm/00000.jpg.webp，120 帧，单帧约 46KB）。
 *   2. render: (ctx,i,w,h)   程序化按帧号绘制。本 demo 走这条，
 *                            因为预渲染 120 帧 RGBA 位图会吃掉几百 MB 内存
 *                            （960×540×4B×120 ≈ 250MB），而且省掉二进制资源。
 *
 * 两条路径对外接口一致：update(frameIndex)。换成真实素材只要改构造参数。
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class FrameSequence {
  /**
   * @param {object}   o
   * @param {Element}  o.el           canvas 元素
   * @param {number}   o.count        总帧数
   * @param {Function} [o.src]        (i) => url，走图片序列
   * @param {Function} [o.render]     (ctx, i, w, h) => void，走程序化绘制
   * @param {number}   [o.dprCap=2]   devicePixelRatio 封顶，防 3x 屏爆显存
   * @param {number}   [o.concurrency=12] 图片预加载并发数
   */
  constructor({ el, count, src = null, render = null, dprCap = 2, concurrency = 12 }) {
    if (!el) throw new Error('[FrameSequence] 缺少 canvas 元素');
    if (!src && !render) throw new Error('[FrameSequence] 必须提供 src 或 render');

    this.canvas = el;
    this.ctx = el.getContext('2d');
    this.count = Number(count) || Number(el.dataset.count) || 1;
    this.src = src;
    this.render = render;
    this.concurrency = concurrency;

    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.images = new Array(this.count);
    this.num = 0;
    this.ready = false;

    this._onResize = this._onResize.bind(this);
    this._resizeRaf = 0;

    this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  /* ── 尺寸：按父容器 CSS 尺寸 × dpr，高清屏不糊 ── */
  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const r = parent.getBoundingClientRect();
    // 容器还没布局出来时给个兜底，避免 canvas 宽高为 0
    const w = Math.max(1, Math.round(r.width * this.dpr));
    const h = Math.max(1, Math.round(r.height * this.dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.draw(this.num);
  }

  _onResize() {
    // resize 事件很密，合并到下一帧
    cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => this.resize());
  }

  /* ── 预加载 ──
     原站是 Promise.all 一次性并发全部帧。这里改成先拿首帧立刻出画，
     其余分批加载，避免首屏抢占带宽把关键请求挤掉。 */
  async preload(onFirstFrame) {
    if (!this.src) {                       // 程序化路径无需加载
      this.ready = true;
      this.draw(0);
      onFirstFrame?.();
      return;
    }

    this.images[0] = await this._loadOne(0);
    this.draw(0);
    onFirstFrame?.();

    const rest = [];
    for (let i = 1; i < this.count; i += 1) rest.push(i);

    // 固定大小的工作池，控制并发
    const worker = async () => {
      while (rest.length) {
        const i = rest.shift();
        this.images[i] = await this._loadOne(i);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, rest.length) }, worker)
    );
    this.ready = true;
  }

  _loadOne(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      // 单帧失败也 resolve，不让一张 404 卡死整个序列
      const done = () => resolve(img.naturalWidth ? img : null);
      img.onload = () => (img.decode ? img.decode().then(done, done) : done());
      img.onerror = () => resolve(null);
      img.src = this.src(i);
    });
  }

  /* ── 外部按滚动进度喂帧号 ── */
  update(i) {
    const n = clamp(Math.round(i), 0, this.count - 1);
    if (n === this.num && this._painted) return;   // 同一帧不重绘
    this.num = n;
    this.draw(n);
  }

  draw(i) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    if (this.render) {
      this.render(ctx, clamp(i, 0, this.count - 1), w, h, this.dpr);
      this._painted = true;
      return;
    }

    const img = this.images[clamp(i, 0, this.count - 1)];
    if (!img) return;
    ctx.clearRect(0, 0, w, h);
    const { sx, sy, sw, sh } = FrameSequence.cover(w, h, img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    this._painted = true;
  }

  /** 手写的 object-fit: cover —— 原站也是自己算的 */
  static cover(cw, ch, iw, ih) {
    const canvasRatio = cw / ch;
    const imgRatio = iw / ih;
    if (imgRatio <= canvasRatio) {
      const sw = iw;
      const sh = sw / canvasRatio;
      return { sx: 0, sy: (ih - sh) / 2, sw, sh };
    }
    const sh = ih;
    const sw = sh * canvasRatio;
    return { sx: (iw - sw) / 2, sy: 0, sw, sh };
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this._resizeRaf);
    this.images.length = 0;
  }
}
