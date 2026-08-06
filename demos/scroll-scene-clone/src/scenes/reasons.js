/**
 * scenes/reasons.js — SCENE 2 · 分页擦除
 *
 * 3 块面板绝对定位堆叠，z-index 递减。滚动时把最上面那块用
 * pageClip 关键帧 inset(0 100vw 0 0) 横向擦掉，下一块自然露出来。
 * 擦除进度同样由 --go 驱动，JS 每块面板只写一个自定义属性。
 *
 * 所需滚动距离按面板数量算出来写回 .row 高度，加面板不用改 CSS。
 */

import { gsap, ScrollTrigger, scrollTo, getTop } from '../lib/scroll.js';

const STRIDE = 1.2;      // 相邻面板起点间隔（单位：视口高）
const WIPE = 1;          // 单次擦除耗时（单位：视口高）
const LEAD = 0.2;        // 第一块面板开始擦除前的停留
const TAIL = 0.4;        // 最后一块面板停留

export function initReasons({ reduced = false } = {}) {
  const row = document.querySelector('.r1');
  const mid = document.querySelector('#fn2');
  if (!row || !mid) return;

  const panels = Array.from(mid.querySelectorAll('.tab-parent'));
  const tabs = Array.from(row.querySelectorAll('.tab'));
  const n = panels.length;
  if (!n) return;

  /* ── tab 点击：无论降级与否都要能用 ── */
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      if (reduced) {
        panels[i].scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
      scrollTo(getTop(row) + window.innerHeight * (LEAD + STRIDE * i));
    });
  });

  if (reduced) {
    // 降级：面板纵向平铺（CSS 里已改好），tab 只做锚点
    tabs.forEach((t) => t.classList.add('is-on'));
    return;
  }

  /* ── 按面板数量反推需要多少滚动距离 ── */
  const setRowHeight = () => {
    const vh = window.innerHeight;
    gsap.set(row, { height: vh * (1 + LEAD + STRIDE * (n - 1) + WIPE + TAIL) });
  };
  setRowHeight();
  ScrollTrigger.addEventListener('refreshInit', setRowHeight);

  /* ── 逐块擦除 ── */
  panels.forEach((panel, i) => {
    if (i === n - 1) return;               // 最后一块不擦

    const at = () => `top+=${window.innerHeight * (LEAD + STRIDE * i)} top`;
    const dur = () => `+=${window.innerHeight * WIPE}`;

    gsap
      .timeline({ scrollTrigger: { trigger: row, start: at, end: dur, scrub: 0.9 } })
      .to(panel, { '--go': 1, ease: 'none' }, 0);

    // 面板内的元素随擦除一起左移，避免"原地被切掉"的呆板感。
    // 位移量要克制：原站用的是 40*k-200，那是配合它居中偏左的排版；
    // 本页内容左对齐到 gutter，-200 会把文字整块推出屏幕外。
    panel.querySelectorAll('.fn2-child').forEach((child, k) => {
      gsap
        .timeline({ scrollTrigger: { trigger: row, start: at, end: dur, scrub: 0.9 } })
        .fromTo(child, { x: 0 }, { x: -90 + 25 * k, ease: 'none' }, 0);
    });

    // 出场内容要比擦除更早消失（0.5 ≈ 擦到一半时已透明），
    // 否则擦除中途两块面板的文字会同时可读，糊成一片。
    // 淡的是 .tab-parent 的直接子元素，避开内部 .count-fn 自己的 opacity 动画。
    gsap
      .timeline({ scrollTrigger: { trigger: row, start: at, end: dur, scrub: 0.9 } })
      .fromTo(panel.children, { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.5 }, 0)
      .set({}, {}, 1);        // 占位，把时间轴总长撑到 1，与擦除范围对齐
  });

  /* ── tab 高亮联动 ── */
  panels.forEach((panel, i) => {
    const activate = () => {
      tabs.forEach((t, k) => {
        t.classList.toggle('is-on', k === i);
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      // tab 条可横向滚动时把当前项带进视野（原站移动端用 Swiper 做这件事）
      tabs[i]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };

    ScrollTrigger.create({
      trigger: row,
      // 切换点取擦除的 85%：等新面板基本露完再换标签，
      // 取 0.5 会出现"标签已经变了、旧面板还占着半屏"的错位感
      start: () =>
        i === 0
          ? 'top bottom'
          : `top+=${window.innerHeight * (LEAD + STRIDE * (i - 1) + WIPE * 0.85)} top`,
      end: () =>
        i === n - 1
          ? 'bottom bottom'
          : `top+=${window.innerHeight * (LEAD + STRIDE * i + WIPE * 0.85)} top`,
      onEnter: activate,
      onEnterBack: activate,
    });
  });

  /* ── tab 条钉在顶部的可见性 ── */
  ScrollTrigger.create({
    trigger: row,
    start: 'top bottom',
    end: 'bottom top',
    toggleClass: { targets: row.querySelector('.tab-box'), className: 'is-fixed' },
  });
}
