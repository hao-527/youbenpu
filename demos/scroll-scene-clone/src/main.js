/**
 * main.js — 编排
 *
 * 启动顺序有讲究：
 *   1. scrollRestoration = manual   刷新必须回顶部，否则 sticky 场景从中途开始
 *   2. data-vh 换算              布局定下来之后 ScrollTrigger 才能量对触发点
 *   3. Lenis + ScrollTrigger 同步
 *   4. 锁滚动                    开场动画期间不让用户滚，播完由 hero 解锁
 *   5. 各场景注册
 *   6. ScrollTrigger.refresh()   全部注册完统一刷一次，避免逐个刷造成抖动
 */

import {
  gsap,
  ScrollTrigger,
  lenis,
  prefersReducedMotion,
  setupVh,
  initSmoothScroll,
  watchResize,
  forceScrollTopOnReload,
  lockScroll,
  scrollTo,
  getTop,
} from './lib/scroll.js';
import { TextFx } from './lib/text-fx.js';
import { initReveal } from './lib/reveal.js';
import { bindDriftLayers, bindSlowRotate } from './lib/parallax.js';
import { initHero } from './scenes/hero.js';
import { initReasons } from './scenes/reasons.js';
import { initTimeline } from './scenes/timeline.js';
import { initMenu } from './scenes/menu.js';

const reduced = prefersReducedMotion;

/* ─────────────── 导航栏收起：加阈值 + 状态位防抖 ─────────────── */
function initHeaderState() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  let state = 0;
  const check = (y) => {
    if (y > 120 && state === 0) {
      header.classList.add('is-down');
      state = 1;
    } else if (y <= 120 && state === 1) {
      header.classList.remove('is-down');
      state = 0;
    }
  };

  // lenis 是 live binding：initSmoothScroll() 里赋值后这里读到的就是实例
  if (lenis) lenis.on('scroll', ({ scroll }) => check(scroll));
  else window.addEventListener('scroll', () => check(window.scrollY), { passive: true });
}

/* ─────────────── 锚点：Lenis 接管滚动后必须自己处理 ─────────────── */
function initAnchors() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    // 菜单关闭动画要 0.6s，等它收完再滚，否则遮罩会跟着页面一起动。
    // 这个处理器注册在捕获阶段（见下方 capture: true），所以此刻
    // menu.js 的链接监听还没把 aria-hidden 改回 true，读到的是真实状态。
    const delay = document.querySelector('#overlay-menu')?.getAttribute('aria-hidden') === 'false' ? 620 : 0;
    window.setTimeout(() => {
      if (reduced) target.scrollIntoView({ behavior: 'auto', block: 'start' });
      // force: true —— 菜单打开时 Lenis 处于 stop() 状态，
      // 不加这个参数 scrollTo 会被静默忽略
      else scrollTo(getTop(target), { force: true });
      // 焦点跟过去，键盘用户不会"跳转了但焦点还在原地"
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }, delay);
  }, true);   // 捕获阶段：要在元素自身的 click 监听之前拿到菜单状态
}

async function boot() {
  forceScrollTopOnReload();
  setupVh();

  initSmoothScroll();

  if (!reduced) lockScroll();             // 开场期间禁止滚动

  const textFx = new TextFx({ skipSplit: reduced });

  initMenu({ reduced });
  initHeaderState();
  initAnchors();
  initReveal({ textFx, reduced });

  if (!reduced) {
    bindSlowRotate('.set-img');
    bindDriftLayers('[data-scroll]');
  }

  // 两个场景各有序列帧要初始化，并行等
  await Promise.all([initHero({ reduced }), initTimeline({ reduced })]);
  initReasons({ reduced });

  // 全部注册完统一刷一次
  ScrollTrigger.refresh();

  // 字体/图片加载完布局可能再变，补刷一次
  window.addEventListener('load', () => ScrollTrigger.refresh());

  watchResize();

  // 暴露给调试/自动化用：Lenis 接管滚动后，外部要精确定位只能走它的 API
  window.__scene = { lenis, gsap, ScrollTrigger, reduced };

  document.documentElement.dataset.booted = 'true';
}

boot().catch((err) => {
  // 动画挂了不能让页面不可用：解锁滚动，把入场元素全部显形
  console.error('[scroll-scene-clone] 初始化失败：', err);
  document.querySelectorAll('.alan-fn, .fn1-alan, .fn2-alan').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  document.querySelector('#firstMv')?.classList.add('is-active');
  document.querySelector('.site-header')?.classList.add('is-active');
  lenis?.start();
});
