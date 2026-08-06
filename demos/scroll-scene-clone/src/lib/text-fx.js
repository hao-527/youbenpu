/**
 * text-fx.js — 逐字拆分 + GSAP stagger 入场
 *
 * 原站没用付费的 SplitText，自己写了个几十行的拆字器（源码里叫 charming）。
 * 这里保留同样的思路，修掉原实现的两个问题：
 *
 * 1. 无障碍：把文字拆成一串 <span> 后，屏幕阅读器会「逐字母」朗读。
 *    修法是容器挂 aria-label 保留原文，拆出来的 span 全部 aria-hidden。
 *
 * 2. 空格丢失：inline-block 的 span 里放普通空格会被折叠掉，
 *    需要换成不换行空格。
 *
 * 另外原站有个 bug：判断条件写的是
 *   el.querySelectorAll('[data-text]').length > 0
 * 而 data-text 恰好挂在元素自己身上，querySelectorAll 只查后代，
 * 所以 fx 动画对这些元素从来没触发过。这里改成同时匹配自身。
 */

import gsap from 'gsap';

export const EFFECTS = {
  // scaleY 1.2→1 配 rotate 8→0，字有种被「甩」到位的重量感
  fx1: {
    in:  { duration: 1,   stagger: 0.03, opacity: [0, 1], scaleY: [1.2, 1], y: [40, 0],  rotate: [8, 0] },
    out: { duration: 1,   stagger: 0.03, opacity: [1, 0], scaleY: [1, 1],   y: [0, -40], rotate: [0, 0] },
  },
  fx2: {
    in:  { duration: 1,   stagger: 0.04, opacity: [0, 1], scaleY: [1.2, 1], y: [-30, 0], rotate: [0, 0] },
    out: { duration: 0.8, stagger: 0.03, opacity: [1, 0], scaleY: [1, 1],   y: [0, 30],  rotate: [0, 0] },
  },
  fx3: {
    in:  { duration: 0.7, stagger: 0.03, opacity: [0, 1], scaleY: [1, 1],   y: [15, 0],  rotate: [0, 0] },
    out: { duration: 0.5, stagger: 0.03, opacity: [1, 0], scaleY: [1, 1],   y: [0, -10], rotate: [0, 0] },
  },
};

export class TextFx {
  /**
   * @param {object} o
   * @param {string} [o.selector='[data-text]']
   * @param {boolean} [o.skipSplit=false]  reduced-motion 下不拆字
   */
  constructor({ selector = '[data-text]', skipSplit = false } = {}) {
    this.selector = selector;
    this.elements = Array.from(document.querySelectorAll(selector));
    if (skipSplit) {
      // 不拆字，但 data-text 的内容仍要落到 DOM 里
      this.elements.forEach((el) => {
        if (!el.textContent.trim()) el.textContent = el.dataset.text || '';
      });
      this.splitted = false;
      return;
    }
    this.elements.forEach((el) => this.split(el, 'letter', el.dataset.split ?? ''));
    this.splitted = true;
  }

  /**
   * 把 data-text 按 delimiter 拆成一串 span
   * delimiter ''  → 逐字母    delimiter ' ' → 逐单词
   * 内容里的 '/' 当换行符处理（沿用原站约定）
   */
  split(el, cls, delimiter) {
    const source = el.dataset.text ?? el.textContent;
    if (!source) return;

    el.setAttribute('aria-label', source.replace(/\//g, ' '));
    el.textContent = '';

    const parts = source.split(delimiter);
    const frag = document.createDocumentFragment();
    let line = 0;

    parts.forEach((part) => {
      if (part === '/') {
        frag.appendChild(document.createElement('br'));
        line += 1;
        return;
      }
      const span = document.createElement('span');
      span.className = `${cls} wordLine${line}`;
      span.setAttribute('aria-hidden', 'true');
      // 空格必须换成 NBSP，否则 inline-block 里会被折叠
      span.textContent = part === ' ' ? '\u00A0' : part;
      frag.appendChild(span);
    });

    el.appendChild(frag);
  }

  /** 取出容器内所有需要动的目标（含容器自身） */
  static targetsIn(root) {
    const list = [];
    if (root.matches?.('[data-text]')) list.push(root);
    list.push(...root.querySelectorAll('[data-text]'));
    return list;
  }

  /**
   * @param {Element} root      容器（自身或后代带 data-text）
   * @param {'in'|'out'} dir
   * @param {string|object} fx  'fx1' 或自定义配置
   * @param {Function} [onComplete]
   */
  animate(root, dir = 'in', fx = 'fx1', onComplete) {
    if (!this.splitted) {
      onComplete?.();
      return;
    }
    const conf = typeof fx === 'string' ? EFFECTS[fx] : fx;
    if (!conf) return;
    const s = conf[dir];

    TextFx.targetsIn(root).forEach((el) => {
      const letters = el.querySelectorAll('.letter');
      if (!letters.length) return;
      gsap
        .timeline({ onComplete })
        .set(letters, {
          opacity: s.opacity[0],
          scaleY: s.scaleY[0],
          rotate: s.rotate[0],
          y: s.y[0],
        })
        .to(
          letters,
          {
            opacity: s.opacity[1],
            scaleY: s.scaleY[1],
            rotate: s.rotate[1],
            y: s.y[1],
            duration: s.duration,
            stagger: s.stagger,
          },
          '+=0.2'
        );
    });
  }
}
