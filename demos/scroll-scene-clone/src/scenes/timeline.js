/**
 * scenes/timeline.js — SCENE 4 · 横向时间轴
 *
 * 三件事绑在同一条 ScrollTrigger 上，所以永远同步：
 *   ① .process 整体 translateX（grid auto-flow column 排出来的横向轨道）
 *   ② 电池 canvas 沿轴移动，抵消轨道位移后略微右飘
 *   ③ 电池的 150 帧随进度充满
 * 外加标题逐字 clip 揭示（--go 擦洗 clipReveal 关键帧）。
 *
 * 与原站的差异：原站的 .r5 高度按 part 数量算（vh * (n + 0.5)），
 * 在窄高屏上横向移动会变得极慢。这里改成按「实际横向行程」算高度，
 * 让 1px 滚动 ≈ 1px 横移，各种屏幕比例下手感一致。
 */

import { gsap, ScrollTrigger } from '../lib/scroll.js';
import { FrameSequence } from '../lib/frame-sequence.js';
import { makeBatteryRenderer } from '../frames/battery.js';

const BATTERY_FRAMES = 150;
const SCROLL_RATIO = 0.95;      // 滚动距离 / 横向行程
const LEAD = 0.5;               // 钉住后、开始横移前的停留（单位：视口高）
                                // 这段时间留给标题逐字揭示，否则字还没揭完就滑出去了

export async function initTimeline({ reduced = false } = {}) {
  const row = document.querySelector('.r5');
  const process = document.querySelector('.r5 .process');
  const frame = document.querySelector('.r5 .frame');
  const batteryCv = document.querySelector('.battery-cv');
  if (!row || !process) return null;

  /* ── 标题逐字揭示所需的 --go 宿主 ── */
  const letters = Array.from(process.querySelectorAll('[data-go]'));

  if (reduced) {
    // 降级：CSS 已把轨道改成纵向堆叠，这里只需让文字直接可见
    letters.forEach((el) => gsap.set(el, { '--go': 1 }));
    return null;
  }

  /* ── 电池序列帧 ── */
  let battery = null;
  if (batteryCv) {
    battery = new FrameSequence({
      el: batteryCv,
      count: BATTERY_FRAMES,
      render: makeBatteryRenderer({ count: BATTERY_FRAMES }),
      dprCap: 2,                 // 画布很小，2x 无压力
    });
    await battery.preload();
  }

  /* ── 量出轨道总宽 ──
     先让 grid 撑到 max-content 再读 scrollWidth，避免被父容器
     100vw 压缩后量到错误值。 */
  const measure = () => {
    gsap.set(process, { width: 'max-content' });
    const total = process.scrollWidth;
    gsap.set(process, { width: total });
    return total;
  };

  let totalW = measure();
  const travel = () => Math.max(0, totalW - window.innerWidth);

  /* ── 按横向行程反推需要多少滚动距离（再加上 LEAD 停留） ── */
  const layout = () => {
    totalW = measure();
    gsap.set(row, {
      height: window.innerHeight * (1 + LEAD) + travel() * SCROLL_RATIO,
    });
  };
  layout();
  ScrollTrigger.addEventListener('refreshInit', layout);

  const range = {
    trigger: row,
    start: () => `top+=${LEAD * window.innerHeight} top`,
    end: 'bottom bottom',
    scrub: 0.8,
    invalidateOnRefresh: true,     // 让下面的函数式取值在 refresh 时重算
  };

  /* ── ① 轨道横移 ── */
  gsap
    .timeline({ scrollTrigger: { ...range } })
    .fromTo(process, { x: 0 }, { x: () => -travel(), ease: 'none' }, 0);

  /* ── ②③ 电池：沿轴移动 + 帧号 scrub ── */
  if (battery && frame) {
    const proxy = { value: 0 };
    gsap
      .timeline({
        scrollTrigger: { ...range },
        onUpdate: () => battery.update(proxy.value),
      })
      // x 精确等于轨道位移量 ⇒ 两者抵消，电池稳定停在视口中央，
      // 时间轴从它身后流过。比"让它自己也漂"更好读，也更好算：
      // 屏幕位置恒等于 CSS 里的 left: calc(50vw - 2.5rem)。
      .fromTo(frame, { x: 0 }, { x: () => travel(), ease: 'none', duration: 1 }, 0)
      .fromTo(frame, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: 'none' }, 0)
      .fromTo(proxy, { value: 0 }, { value: BATTERY_FRAMES - 1, duration: 1, ease: 'none' }, 0);
  }

  /* ── ④ 标题逐字 clip 揭示 ──
     scrub 的时间轴里，position 参数等价于滚动偏移，
     所以直接用位置参数就能做出错开的擦入。 */
  if (letters.length) {
    // 窗口安排在"钉住之后、横移开始之前"这段 LEAD 里：
    // 起点略早于钉屏（top 60%）让它在滑入过程中就开始，
    // 终点落在 LEAD*0.9 处，确保揭示走完时轨道还没开始动。
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: row,
        start: 'top 60%',
        end: () => `top+=${LEAD * 0.9 * window.innerHeight} top`,
        scrub: 0.9,
      },
    });
    const step = 0.45 / Math.max(1, letters.length - 1);
    letters.forEach((el, i) => {
      tl.to(el, { '--go': 1, ease: 'none', duration: 0.55 }, i * step);
    });
  }

  /* ── 滚动提示 ── */
  // 只在 LEAD 停留期间提示，轨道一动就收起来
  const hint = document.querySelector('#r5Scr');
  if (hint) {
    ScrollTrigger.create({
      trigger: row,
      start: 'top center',
      end: () => `top+=${LEAD * window.innerHeight} top`,
      toggleClass: { targets: hint, className: 'is-on' },
    });
  }

  return battery;
}
