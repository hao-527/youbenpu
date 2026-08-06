/**
 * reveal.js — 通用入场
 *
 * 三种粒度，按成本从低到高：
 *
 *  A. .alan-go        →  ScrollTrigger 只加一个 class，级联全靠 CSS
 *                        transition-delay。最省，复杂列表首选。
 *  B. .alan-fn        →  ScrollTrigger.batch 合并同时入场的元素，
 *                        一次调用处理一批，内部自动 stagger。
 *  C. .count-fn       →  数字滚动，需要 JS 每帧改文本，只在必要处用。
 *
 * batch 的关键细节是 refreshInit 回调：刷新前必须把 y 归零，
 * 否则 ScrollTrigger 会按「位移之后」的位置计算触发点，越刷新越偏。
 */

import { gsap, ScrollTrigger, winsize } from './scroll.js';
import { TextFx } from './text-fx.js';
import { countUp } from './count-up.js';

export function initReveal({ textFx, reduced = false } = {}) {
  if (reduced) {
    // 降级：不接滚动，内容直接可见（CSS 里也有一层 !important 兜底）
    gsap.set('.alan-fn', { opacity: 1, y: 0 });
    document.querySelectorAll('.alan-go').forEach((el) => el.classList.add('go'));
    document.querySelectorAll('.fix-box').forEach((el) => el.classList.add('go'));
    return;
  }

  /* ── A · toggleClass 级联 ── */
  document.querySelectorAll('.alan-go').forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: `top-=${0.9 * winsize.vh} top`,
      end: `+=${3 * winsize.vh}`,
      toggleActions: 'restart pause resume none',
      toggleClass: 'go',
    });
  });

  /* ── B · batch 入场 ── */
  gsap.set('.alan-fn', { y: 50, opacity: 0 });

  ScrollTrigger.batch('.alan-fn', {
    start: '80px bottom',
    end: 'top top',
    onEnter: (els) => {
      els.forEach((el) => {
        if (TextFx.targetsIn(el).length) textFx?.animate(el, 'in', 'fx1');
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 1.5,
          delay: el.dataset.delay || 0,
          ease: 'power3.out',
          overwrite: true,
        });
      });
      return false;
    },
    onLeaveBack: (els) =>
      gsap.to(els, { opacity: 0, y: 50, duration: 0.5, overwrite: true }),
  });

  // ★ 必须：刷新前把位移归零，否则触发点会随每次 refresh 累积偏移
  ScrollTrigger.addEventListener('refreshInit', () => {
    gsap.set('.alan-fn', { y: 0 });
  });

  /* ── C · 数字滚动 ── */
  document.querySelectorAll('.count-fn').forEach((el) => {
    const target = el.querySelector('.count');
    if (!target) return;

    // 目标值从 DOM 文本读取 —— 无 JS 时数字本身就是正确的（渐进增强）
    const endVal = parseFloat(target.textContent.replace(/,/g, ''));
    if (Number.isNaN(endVal)) return;
    const decimals = Number(target.dataset.decimals ?? NaN);

    let tween = null;
    gsap.set(el, { y: 30, rotate: 4, opacity: 0 });

    ScrollTrigger.create({
      trigger: el,
      start: '80px bottom',
      end: 'top top',
      onEnter: () => {
        tween?.kill();
        tween = countUp(target, endVal, {
          duration: 2,
          decimals: Number.isNaN(decimals) ? undefined : decimals,
        });
        gsap.to(el, { y: 0, rotate: 0, opacity: 1, ease: 'power1.out', duration: 1.2 });
      },
      onLeaveBack: () => {
        tween?.kill();
        gsap.to(el, { y: 30, opacity: 0, duration: 0.4 });
      },
    });
  });

  /* ── 悬浮按钮 ── */
  const fixBox = document.querySelector('.fix-box');
  if (fixBox) {
    ScrollTrigger.create({
      trigger: document.body,
      start: `top+=${0.8 * winsize.vh} top`,
      end: 'max',
      toggleActions: 'play none none reverse',
      toggleClass: { targets: fixBox, className: 'go' },
    });
  }
}
