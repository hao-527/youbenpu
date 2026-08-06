/**
 * count-up.js — 数字滚动
 *
 * 原站用的是 countup.js 2.8.0。这里用 GSAP 补间一个代理对象实现，
 * 少一个依赖，而且和页面其它动画共用同一个 ticker（时序更可控）。
 */

import gsap from 'gsap';

function format(value, decimals, grouping) {
  const fixed = value.toFixed(decimals);
  if (!grouping) return fixed;
  const [int, dec] = fixed.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${withSep}.${dec}` : withSep;
}

/**
 * @param {Element} el
 * @param {number}  endVal
 * @param {object}  [o]
 * @param {number}  [o.duration=2]
 * @param {number}  [o.decimals]     不给则按 endVal 自身小数位推断
 * @param {boolean} [o.grouping=true]
 * @param {number}  [o.startVal=0]
 */
export function countUp(el, endVal, o = {}) {
  const {
    duration = 2,
    grouping = true,
    startVal = 0,
    decimals = (String(endVal).split('.')[1] || '').length,
  } = o;

  const proxy = { v: startVal };
  el.textContent = format(startVal, decimals, grouping);

  return gsap.to(proxy, {
    v: endVal,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = format(proxy.v, decimals, grouping);
    },
    onComplete: () => {
      // 收尾对齐到精确值，避免浮点误差留下 239.99998
      el.textContent = format(endVal, decimals, grouping);
    },
  });
}
