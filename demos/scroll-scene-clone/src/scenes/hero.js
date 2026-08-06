/**
 * scenes/hero.js — SCENE 1 · 首屏
 *
 * 叠了四层，全部挂在同一个 sticky 舞台上：
 *   ①  .media       开场动画，播完淡出
 *   ②  #fn1.clip    120 帧序列帧 + --go 擦洗 heroClip（全屏 → 左侧圆角卡片）
 *   ③  #firstMv     第一屏文案，按 data-speed 分层飞出
 *   ④  .part        第二屏文案，反向飞入
 *
 * ②③④ 共用同一条 ScrollTrigger 进度，所以画面收缩、文字飞出、
 * 新文字飞入三件事严格同步。
 */

import { gsap, ScrollTrigger, winsize, unlockScroll } from '../lib/scroll.js';
import { FrameSequence } from '../lib/frame-sequence.js';
import { bindSpeedLayers } from '../lib/parallax.js';
import { makePowerRingRenderer } from '../frames/power-ring.js';
import { playIntro } from '../frames/intro.js';

const HERO_FRAMES = 120;

export async function initHero({ reduced = false } = {}) {
  const banner = document.querySelector('.banner');
  const clip = document.querySelector('#fn1');
  const heroCv = document.querySelector('.hero-cv');
  const introCv = document.querySelector('.intro-cv');
  const media = document.querySelector('.banner .media');
  const group = document.querySelector('#firstMv');
  const header = document.querySelector('.site-header');
  if (!banner || !clip || !heroCv) return null;

  /* ── 序列帧 ── */
  const seq = new FrameSequence({
    el: heroCv,
    count: HERO_FRAMES,
    // 换成真实素材只需把 render 换成 src：
    //   src: (i) => `/frames/hero/${String(i).padStart(5, '0')}.webp`
    render: makePowerRingRenderer({ count: HERO_FRAMES }),
    dprCap: 1.5,                     // 全屏 canvas，1.5 已足够且省一半填充率
  });
  await seq.preload();
  heroCv.classList.add('is-active');

  /* ── 开场编排：挂在 intro 的 Promise 上，不用硬编码 setTimeout ── */
  const revealUI = () => {
    header?.classList.add('is-active');
    group?.classList.add('is-active');
    unlockScroll();
  };

  if (reduced) {
    media?.remove();                 // 降级模式直接跳过开场
    revealUI();
  } else {
    playIntro(introCv, { duration: 1900 }).then(() => {
      gsap.to(media, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => media?.remove(),
      });
      revealUI();
    });
  }

  if (reduced) return seq;           // 降级模式不绑任何滚动动画

  /* ── 主时间轴：帧号 + --go 同步 scrub ── */
  const proxy = { value: 0 };
  gsap
    .timeline({
      scrollTrigger: {
        trigger: banner,
        start: 'top top',
        end: () => `+=${window.innerHeight}`,
        scrub: 0.9,
      },
      onUpdate: () => seq.update(proxy.value),
    })
    .addLabel('start', 0)
    .fromTo(proxy, { value: 0 }, { value: HERO_FRAMES - 1, ease: 'none' }, 'start')
    // 一整段 clip-path 关键帧，JS 侧只写这一个自定义属性
    .to(clip, { '--go': 1, ease: 'none' }, 'start')
    // 万一用户在开场没播完时就滚动，把开场层一起收掉
    .to(media, { opacity: 0, duration: 0.1 }, 'start');

  /* ── 分层视差 ──
     两段窗口首尾接近相接：第一屏在 0~0.42vh 飞出，第二屏 0.5~1.1vh 飞入，
     中间只留一小段"只有画面在收缩"的空档，不至于出现长时间空屏。
     .banner 总高 2.4vh、sticky 1vh ⇒ 钉住 1.4vh，动画 1.1vh 结束，
     余 0.3vh 让画面停一下再进下一场。 */
  bindSpeedLayers(document.querySelectorAll('.fn1-alan'), {
    trigger: banner,
    start: 'top top',
    end: () => `+=${0.42 * window.innerHeight}`,
    direction: 'out',
  });

  bindSpeedLayers(document.querySelectorAll('.fn2-alan'), {
    trigger: banner,
    start: () => `top+=${0.5 * window.innerHeight} top`,
    end: () => `+=${0.6 * window.innerHeight}`,
    direction: 'in',
  });

  return seq;
}

export { ScrollTrigger, winsize };
