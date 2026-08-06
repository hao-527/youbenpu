# Scroll Scene Clone

滚动叙事页面的动效架构参考实现。复刻的是 [nanfu.global](https://nanfu.global/) 那套手法，
不是它的内容 —— 页面里的品牌 **VOLTA LAB** 是虚构的，所有数字、年份、产品指标都是为演示编造的，
没有任何真实依据。素材也没有拷贝：序列帧是程序化生成的，不含任何原站资源。

技术栈刻意贴近原站以便对照：`gsap@3.11.4`（同版本）、`lenis`（原站用 0.2.28，这里用维护中的 1.x）。
没有 Three.js、Lottie、jQuery、Swiper。

```bash
npm install
npm run dev      # http://localhost:5273
npm run build    # → dist/  (约 153KB JS / 57KB gzip，17KB CSS)
```

---

## 复刻了哪些手法，分别在哪个文件

| 手法 | 位置 | 一句话 |
|------|------|--------|
| **负 `animation-delay` 擦洗 CSS 关键帧** | `styles/scenes.css` + 各 scene | 全站最值得学的一招，见下节 |
| CSS `sticky` 钉屏（不用 GSAP `pin`） | `styles/scenes.css` `.row`/`.inner` | 避开 pin-spacer 插入和重排 |
| Canvas 序列帧 scrub | `lib/frame-sequence.js` | 双数据源：真实图片 / 程序化绘制 |
| `data-vh` 换算真实 px | `lib/scroll.js` | 绕开移动端 `100vh` 抖动 |
| Lenis + ScrollTrigger 同步 | `lib/scroll.js` | 三个必须做对的点都写在文件头注释里 |
| 分层视差 `data-speed="x,y"` | `lib/parallax.js` | 同一 trigger、不同位移量 |
| 逐字拆分 + `stagger` | `lib/text-fx.js` | 自己实现的 charming，不用付费 SplitText |
| `attr()` 双层文字 + `clip-path` 揭示 | `styles/scenes.css` `clipReveal` | 底层淡灰 + `::after` 擦入 |
| `ScrollTrigger.batch` 批量入场 | `lib/reveal.js` | 含关键的 `refreshInit` 归零回调 |
| `toggleClass` 交给 CSS 级联 | `lib/reveal.js` + `.alan-parent-up` | 复杂列表不用 JS 补间 |
| 横向轨道 + 序列帧双通道同步 | `scenes/timeline.js` | 两者绑同一条 ScrollTrigger |
| SVG `<rect>` 全屏菜单 | `scenes/menu.js` | 看着像形变，其实只是 `translateY` |
| 数字滚动 | `lib/count-up.js` | GSAP 驱动，少一个依赖 |

### 核心：`--go` 擦洗

```css
.clip {
  animation-name: heroClip;
  animation-duration: 1s;
  animation-play-state: paused;              /* 永远暂停 */
  animation-delay: calc(var(--go) * -1s);    /* 负延迟 = 手动定位到进度 */
}
@keyframes heroClip {
  0%  { clip-path: inset(0); }
  to  { clip-path: inset(1.5rem 55vw 0.9rem 1.2rem round 0.6rem); }
}
```

动画处于 `paused`，浏览器渲染的就是 `delay` 指向的那一"帧"。GSAP 只需把 `--go` 从 0 补到 1：

```js
gsap.timeline({ scrollTrigger: { trigger, start, end, scrub: 0.9 } })
    .to(clipEl, { '--go': 1, ease: 'none' });
```

好处：JS 每帧只写一个自定义属性，`clip-path` 插值交给浏览器；效果全部声明在 CSS 里，
PC / 移动端换关键帧就行（本项目 `heroClip` 就有横竖屏两套）。

站内复用三处：`heroClip`（全屏→左侧卡片）、`pageClip`（横向擦除切页）、`clipReveal`（逐字揭示）。

---

## 换成真实序列帧

`FrameSequence` 的两条数据源接口一致，改构造参数即可：

```js
// demo 用的程序化绘制
new FrameSequence({ el, count: 120, render: makePowerRingRenderer({ count: 120 }) });

// 换成真实素材（原站就是这条路）
new FrameSequence({ el, count: 120, src: (i) => `/frames/hero/${String(i).padStart(5, '0')}.webp` });
```

程序化绘制是为了不带二进制素材，也避免预渲染爆内存：全屏 canvas 在 2x 屏上约 2880×1800，
单帧 RGBA ≈ 20MB，120 帧就是 2.4GB。原站的做法是加载 120 张约 46KB 的 WebP（合计约 5.5MB）。

---

## 相对原站做了哪些不同的选择

| 项 | 原站 | 这里 | 原因 |
|----|------|------|------|
| 根字号 | `font-size: 5.20833vw` | `min(calc(0.2rem + 4.9vw), 122px)` | 纯 vw 会完全忽略用户的浏览器字号设置（WCAG 1.4.4） |
| 小号字号 | 严格等比 | `max(0.16rem, 13px)` 加下限 | 等比缩放在 1440 屏上会把 16px 正文压到 11.8px |
| 序列帧预加载 | `Promise.all` 一次性并发 120 个请求 | 先取首帧出画，其余分批（并发 12） | 首屏不被 120 个请求挤占带宽 |
| 开场编排 | 硬编码 `setTimeout(1700)` / `(2000)` | 挂在 intro 动画的 Promise 上 | 网络慢时不会和资源加载脱节 |
| `ScrollTrigger` 取值 | 设置时算好 vh 写死 | 函数式取值 + `invalidateOnRefresh` | resize / refresh 后触发点自动重算 |
| 横向轨道所需滚动距离 | 按 `part` 数量算 `vh*(n+0.5)` | 按实际横向行程算 | 原式在窄高屏上横移会变得极慢 |
| 驱动循环 | Lenis 和 GSAP 两个独立 rAF | `gsap.ticker` 单循环 + `lagSmoothing(0)` | 顺序确定，少一次调度 |
| `prefers-reduced-motion` | 无 | 完整降级 | 见下节 |
| 菜单无障碍 | 只有防重复点击的 lock | `aria-expanded`/`aria-hidden`、Escape、焦点进出、Tab 循环 | — |
| 依赖 | 含 jQuery 3.6.3（只用了几个 API） | 无 | 省约 30KB gzip |

### reduced-motion 降级做了什么

实测（`prefers-reduced-motion: reduce`）：Lenis 不启动走原生滚动；文档高度从约 14000px 缩到 7765px
（去掉人为的滚动填充）；`sticky` 全部降为 `relative`；横向轨道改块级纵向堆叠；分页面板改纵向平铺；
文字不拆分（屏幕阅读器正常朗读整句）；数字直接显示终值；序列帧冻结/隐藏；所有入场元素 `opacity: 1`。

---

## 已知取舍

- **首屏仍有一段"只有画面在收缩"的空档**（约 0.08vh）。要彻底消除得让两段文字的进出窗口重叠，
  但那样两屏文案会同时可见。原站的空档更长（约 1vh）。
- **`.row` 高度由 JS 写死 px**，禁用 JS 时退回 CSS 里的 `vh` 兜底值，动画没有但内容完整可读。
- **程序化序列帧每帧实时绘制**，比解码预加载好的 WebP 更吃 CPU（换成 `src` 模式即可对齐原站的性能特征）。
- **横向轨道在移动端仍是横向的**。原站移动端换成了 Swiper 手动滑动，这里保留滚动驱动 —— 
  窄屏下 `.part` 宽度已收到 74~92vw 来补偿。

## 目录

```
src/
├── main.js                 编排：启动顺序、锚点、导航栏状态、失败兜底
├── lib/
│   ├── scroll.js           Lenis + ScrollTrigger 同步、data-vh、resize
│   ├── frame-sequence.js   序列帧（图片 / 程序化双数据源）
│   ├── text-fx.js          逐字拆分 + fx1~fx3
│   ├── reveal.js           batch 入场、toggleClass 级联、数字滚动
│   ├── parallax.js         data-speed 分层、漂移、慢速自转
│   └── count-up.js
├── frames/                 程序化帧渲染器（能量环 120 帧 / 电池 150 帧 / 开场）
├── scenes/                 hero · reasons · timeline · menu
└── styles/
    ├── base.css            reset、根字号缩放、设计令牌、字号刻度
    └── scenes.css          各场景布局 + 全部关键帧 + reduced-motion 兜底
```
