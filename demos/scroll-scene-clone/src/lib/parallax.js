/**
 * parallax.js — 分层视差
 *
 * 每个元素用 data-speed="x,y" 声明自己的位移量（px），同一批元素
 * 共用一个 trigger 但各走各的时间轴，于是同时移动、速度不同 → 视差。
 *
 * 移动端把位移量减半：屏幕小，同样的 px 位移观感上要剧烈得多。
 */

import { gsap, ScrollTrigger, winsize } from './scroll.js';

function readSpeed(el) {
  const [x = 0, y = 0] = (el.dataset.speed || '0,0').split(',').map(Number);
  const k = winsize.isMobile ? 0.5 : 1;
  return { x: (Number.isFinite(x) ? x : 0) * k, y: (Number.isFinite(y) ? y : 0) * k };
}

/**
 * @param {NodeList|Array} els
 * @param {object} o
 * @param {Element} o.trigger
 * @param {string}  o.start        ScrollTrigger start 语法
 * @param {string}  o.end
 * @param {'in'|'out'} [o.direction='out']  out = 飞出去，in = 飞进来
 * @param {number}  [o.scrub=0.9]
 */
export function bindSpeedLayers(els, { trigger, start, end, direction = 'out', scrub = 0.9 }) {
  Array.from(els).forEach((el) => {
    const { x, y } = readSpeed(el);
    const from = direction === 'out' ? { x: 0, y: 0, opacity: 1 } : { x, y, opacity: 0 };
    const to   = direction === 'out' ? { x, y, opacity: 0 } : { x: 0, y: 0, opacity: 1 };

    gsap
      .timeline({ scrollTrigger: { trigger, start, end, scrub } })
      .fromTo(el, from, { ...to, ease: 'none' });
  });
}

/**
 * 通用漂移：[data-scroll="x,y"] 在「进入视口 → 离开视口」的全程里
 * 从 -x,-y 漂到 +x,+y，中点正好对齐视口中央。
 */
export function bindDriftLayers(selector = '[data-scroll]') {
  document.querySelectorAll(selector).forEach((el) => {
    const raw = (el.dataset.scroll || '').split(',').map(Number);
    const k = winsize.isMobile ? 0.5 : 1;
    const x = (Number.isFinite(raw[0]) ? raw[0] : 0) * k;
    const y = (Number.isFinite(raw[1]) ? raw[1] : 0) * k;
    if (!x && !y) return;                   // 没声明位移量就跳过

    gsap
      .timeline({
        scrollTrigger: {
          trigger: el,
          start: `top-=${winsize.vh} top`,
          end: `+=${el.getBoundingClientRect().height + winsize.vh}`,
          scrub: 0.9,
        },
      })
      .fromTo(el, { x: -x, y: -y }, { x, y, ease: 'none' });
  });
}

/** 缓慢自转的装饰环 —— 原站的 .setImg */
export function bindSlowRotate(selector = '.set-img') {
  document.querySelectorAll(selector).forEach((el) => {
    gsap
      .timeline({
        scrollTrigger: {
          trigger: el,
          start: `top-=${winsize.vh} top`,
          end: `+=${10 * winsize.vh}`,
          scrub: 0.9,
        },
      })
      .to(el, { rotate: 180, ease: 'none' });
  });
}

export { ScrollTrigger };
