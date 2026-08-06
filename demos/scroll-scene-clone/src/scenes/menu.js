/**
 * scenes/menu.js — 全屏菜单遮罩
 *
 * 看着像遮罩形变，其实只是一个铺满的 SVG <rect> 从 translateY(-100%)
 * 推到 0，靠陡峭的贝塞尔 cubic-bezier(.43,.195,.02,1) 制造"甩入"感。
 * 菜单项再用 GSAP 按索引错开落差入场。
 *
 * 原站在这里只做了 lock 防重复点击。这份实现补上了无障碍要求：
 * aria-expanded / aria-hidden、Escape 关闭、焦点进出、Tab 焦点循环。
 */

import { gsap, lockScroll, unlockScroll } from '../lib/scroll.js';

const OVERLAY_MS = 480;      // rect 滑到位所需时间（CSS transition 是 1s，取其中段即可开始出字）

export function initMenu({ reduced = false } = {}) {
  const toggle = document.querySelector('#menu-toggle');
  const menu = document.querySelector('#overlay-menu');
  if (!toggle || !menu) return;

  const overlay = menu.querySelector('.shape-overlays');
  const links = Array.from(menu.querySelectorAll('.overlay-nav-list'));

  let isOpen = false;
  let busy = false;

  const setState = (open) => {
    isOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
  };

  function open() {
    if (busy || isOpen) return;
    busy = true;
    setState(true);
    lockScroll();

    gsap.timeline({
      onStart: () => {
        overlay?.classList.add('is-opened');
        window.setTimeout(() => {
          links.forEach((el, i) => {
            gsap.fromTo(
              el,
              { opacity: 0, y: -(100 - 20 * i) },
              {
                opacity: 1,
                y: 0,
                duration: reduced ? 0.01 : 1,
                ease: 'power2.out',
                onComplete: i === links.length - 1 ? () => { busy = false; } : undefined,
              }
            );
          });
          links[0]?.focus();
        }, reduced ? 0 : OVERLAY_MS);
      },
    }).to(menu, { autoAlpha: 1, duration: 0.1 });
  }

  function close({ restoreFocus = true } = {}) {
    if (busy || !isOpen) return;
    busy = true;
    setState(false);
    overlay?.classList.remove('is-opened');

    links.forEach((el, i) => {
      gsap.to(el, {
        opacity: 0,
        y: -30,
        duration: reduced ? 0.01 : 0.5,
        ease: 'power1.out',
        onComplete:
          i === links.length - 1
            ? () => {
                gsap.to(menu, {
                  autoAlpha: 0,
                  duration: 0.1,
                  onComplete: () => {
                    busy = false;
                    unlockScroll();
                    if (restoreFocus) toggle.focus();
                  },
                });
              }
            : undefined,
      });
    });
  }

  toggle.addEventListener('click', () => (isOpen ? close() : open()));

  // 点菜单项：先关菜单，交给全局锚点处理器去滚动
  links.forEach((link) => {
    link.addEventListener('click', () => close({ restoreFocus: false }));
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    // 焦点循环：菜单打开时 Tab 不应该跑到背后的页面上去
    if (e.key === 'Tab') {
      const focusables = [toggle, ...links];
      const idx = focusables.indexOf(document.activeElement);
      if (idx === -1) {
        e.preventDefault();
        focusables[0].focus();
        return;
      }
      const next = e.shiftKey ? idx - 1 : idx + 1;
      if (next < 0 || next >= focusables.length) {
        e.preventDefault();
        focusables[e.shiftKey ? focusables.length - 1 : 0].focus();
      }
    }
  });

  setState(false);
}
