/**
 * scroll.js — Lenis 惯性滚动 + GSAP ScrollTrigger 同步 + data-vh 视口高度换算
 *
 * 三个必须做对的地方：
 *
 * 1. lenis.on('scroll', ScrollTrigger.update)
 *    Lenis 每帧插值出一个新的 scroll 位置，ScrollTrigger 默认监听原生
 *    scroll 事件，两者节奏不一致就会「动画比画面慢半拍」。必须手动同步。
 *
 * 2. 用 gsap.ticker 驱动 lenis.raf，而不是另起一个 requestAnimationFrame。
 *    原站是两个独立 rAF 循环，能跑但多一次调度。单循环顺序确定：
 *    先推进 Lenis → 再更新 ScrollTrigger → 再跑补间。
 *    配合 lagSmoothing(0)，标签页切回来时不会突然跳一大段。
 *
 * 3. data-vh 换算成 px 而不是用 100vh。
 *    移动端地址栏伸缩会改变 100vh，导致 sticky 场景在滚动中途抖动。
 *    换成 px 后只在真正的尺寸变化（横竖屏切换 / 窗口缩放）时重算。
 */

import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 视口尺寸 + 竖屏判断（原站叫 shu） */
export const winsize = {
  vw: window.innerWidth,
  vh: window.innerHeight,
  get isPortrait() {
    return window.matchMedia('(orientation: portrait)').matches;
  },
  get isMobile() {
    return window.innerWidth <= 900;
  },
};

function measure() {
  winsize.vw = window.innerWidth;
  winsize.vh = window.innerHeight;
}

/** 元素相对文档顶部的距离 */
export function getTop(el) {
  let node = el;
  let top = 0;
  while (node) {
    top += node.offsetTop || 0;
    node = node.offsetParent;
  }
  return top;
}

/* ─────────────────────── data-vh ─────────────────────── */

let vhElements = [];

function applyVh() {
  vhElements.forEach((el) => {
    gsap.set(el, { height: winsize.vh * parseFloat(el.dataset.vh) });
  });
}

export function setupVh() {
  vhElements = Array.from(document.querySelectorAll('[data-vh]'));
  if (prefersReducedMotion) return;        // 降级模式让 CSS 自己排版
  measure();
  applyVh();
}

/* ─────────────────────── Lenis ─────────────────────── */

export let lenis = null;

export function initSmoothScroll() {
  if (prefersReducedMotion) return null;   // 尊重系统设置，直接用原生滚动

  lenis = new Lenis({
    duration: 1.3,                         // 与原站一致
    smoothWheel: true,
    // 触屏保持原生滚动手感，强行接管会打架
    syncTouch: false,
  });

  // ① 位置同步
  lenis.on('scroll', ScrollTrigger.update);

  // ② 单循环驱动
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export function scrollTo(target, opts = {}) {
  if (lenis) {
    // 调用方可以传 force: true 让 stop() 状态下也能滚（例如菜单关闭时跳锚点）
    lenis.scrollTo(target, { duration: 1.2, ...opts });
  } else {
    const y = typeof target === 'number' ? target : getTop(target);
    window.scrollTo({ top: y, behavior: 'auto' });
  }
}

export const lockScroll = () => lenis?.stop();
export const unlockScroll = () => lenis?.start();

/* ─────────────────── resize：只在真正需要时重排 ─────────────────── */

export function watchResize(onRelayout) {
  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  let raf = 0;

  window.addEventListener(
    'resize',
    () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 宽度没变、高度变化又小于 20% —— 基本就是移动端地址栏伸缩，忽略
      const addressBarOnly = w === lastW && Math.abs(h - lastH) / lastH < 0.2;
      lastW = w;
      lastH = h;
      if (addressBarOnly) return;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measure();
        applyVh();
        onRelayout?.();
        ScrollTrigger.refresh();
      });
    },
    { passive: true }
  );
}

/** 刷新前回到顶部，否则 sticky 场景会从中途开始，开场编排全乱 */
export function forceScrollTopOnReload() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
}

export { gsap, ScrollTrigger };
