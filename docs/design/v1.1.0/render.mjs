/* global document, innerWidth */
import { chromium } from '../../../packages/client/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { format } from 'prettier';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'mockups');
await mkdir(out, { recursive: true });
const devices = JSON.parse(
  await readFile(
    new URL('../../../packages/server/src/devices.json', import.meta.url),
  ),
);
const concepts = [
  {
    id: 'passepartout',
    name: 'Passepartout',
    note: 'A quiet mat for every crop.',
    colors: ['#F1F0F7', '#FFFFFF', '#292438', '#61586F', '#624696', '#867A98'],
    dark: ['#201E2A', '#2B2838', '#F4F0FF', '#C8BFD9', '#D1B5FF', '#9486AA'],
  },
  {
    id: 'cut-bench',
    name: 'Cut Bench',
    note: 'One source. Precisely fitted.',
    colors: ['#E8EDF2', '#FFFFFF', '#132C44', '#475E72', '#1554B4', '#6D8296'],
    dark: ['#17222D', '#233442', '#EDF6FF', '#BBCCDC', '#9AC4FF', '#7F9AAF'],
  },
  {
    id: 'screen-room',
    name: 'Screen Room',
    note: 'Make a little room for your view.',
    colors: ['#FAF4E5', '#FFFFFF', '#343020', '#675E43', '#785315', '#938568'],
    dark: ['#29271F', '#363328', '#FFF5D8', '#D2C6A2', '#F1C86C', '#A39878'],
  },
];
const image = '../../../images/dusk-ridges.png';
const button = (text, primary = false, extra = '') =>
  `<span class="button ${primary ? 'primary' : ''} ${extra}">${text}</span>`;
const check = (text, selected = true) =>
  `<div class="check"><span class="box">${selected ? '✓' : ''}</span><span>${text}</span></div>`;
const stage = (current) =>
  `<nav aria-label="Workflow">${['Input', 'Processing', 'Download'].map((s, i) => `<span class="stage ${current === s.toLowerCase() ? 'current' : ''}"><b>${i + 1}</b>${s}</span>`).join('')}</nav>`;
const imageTag = (cls = '') =>
  `<img class="${cls}" src="${image}" alt="Dusk Ridges source wallpaper">`;
function options() {
  return `<aside class="settings"><section><h2>Output devices</h2>${devices.map((d, i) => check(d.name, i < 2)).join('')}</section>
  <section><h2>Crop method</h2><div class="methods"><span class="choice selected">✓ Smart (AI)</span><span class="choice">Smart (entropy)</span></div><div class="anchor-row"><div class="anchors"><span>⌜</span><span>⌝</span><span>⊙</span><span>⌞</span><span>⌟</span></div><small>Spatial anchors<br>Four corners<br>and center</small></div></section>
  <section><h2>OLEDify</h2>${check('Turn near-black colors into true black')}<p class="threshold">Threshold <strong>32</strong></p><div class="slider"><i></i></div><small>All RGB channels at or below 32 become black.</small></section></aside>`;
}
function crops() {
  return `<div class="crop-pair">${devices
    .slice(0, 2)
    .map(
      (d, i) =>
        `<article class="crop-card"><div class="crop-title"><h2>${d.name}</h2><small>${d.width} × ${d.height}</small></div><div class="crop-image">${imageTag()}<div class="scrim ${i ? 'tablet' : 'phone'}"><span>Drag to position</span></div></div><p class="small">Drag, touch, or use arrow keys. Shift moves 10px.</p>${button('Reset position')}</article>`,
    )
    .join('')}</div>`;
}
function downloads() {
  return `<div class="download-pair">${devices
    .slice(0, 2)
    .map(
      (d, i) =>
        `<article class="download-card"><div class="image-mat"><div class="device ${i ? 'tablet' : 'phone'}"><img src="../../../images/export-${d.id}.png" alt="${d.name} illustrative wallpaper preview"></div></div><h2>${d.name}</h2><p class="small">${d.width} × ${d.height}</p><p class="filename">dusk-ridges-${d.id}.png</p>${button('Download PNG')}</article>`,
    )
    .join('')}</div>`;
}
function input(c) {
  return `<div class="intro"><h1>One wallpaper.<br>Every device.</h1><p>Choose a view. Frame it for your screens.</p></div><div class="input-grid"><div class="upload"><div class="upload-symbol" aria-hidden="true">⊞</div><h2>Drop or paste your wallpaper here</h2><p>Or choose one image</p>${button('Choose File', true)}<p class="small">JPEG, PNG, or WebP<br>Processed locally on your server</p><div class="disclosure">AI naming and subject detection are enabled. After upload, an image representation is automatically sent to the configured AI service.</div></div><figure class="example">${imageTag()}<div class="example-crops"><span></span><span></span></div><figcaption>Example: Dusk Ridges<br>One source, a view for every screen</figcaption></figure></div><p class="closing">${c.note}</p>`;
}
function processing() {
  return `<div class="task-heading"><h1>A view for every screen.</h1><p>Dusk Ridges <span class="source-meta">4800 × 3200</span></p></div><div class="workbench">${options()}<section class="images"><div class="reference">${imageTag()}<div><h2>Source wallpaper</h2><small>Original colors stay unchanged.<br>Position each crop independently.</small></div></div>${crops()}<div class="next">${button('Next: Download', true)}</div></section></div>`;
}
function download() {
  return `<div class="task-heading"><h1>Ready for your screens.</h1><p>Two wallpapers, fitted and ready.</p></div><div class="delivery"><div class="name"><div>Wallpaper name <span class="ai">✧ AI suggested</span></div><div class="text-field">dusk-ridges</div><small>Edit the name before downloading.</small></div><div class="zip">${check('Organize into device folders')}${button('Download all: dusk-ridges.zip', true)}</div></div>${downloads()}<div class="back">${button('Back to Processing')}</div>`;
}
function states() {
  return `<div class="task-heading"><h1>Clear at every step.</h1><p>Representative state details, not a fourth workflow screen.</p></div><div class="state-grid">
  <section><h2>Keyboard focus</h2>${button('Reset position', false, 'focused')}<p>3px visible ring and a surface gap. Crop handles retain white/black edges.</p></section>
  <section><h2>Disabled</h2>${button('Next: Download', false, 'disabled')}<p>Select at least one device to continue.</p><small>Unavailable actions remain readable.</small></section>
  <section><h2>Pending work</h2><div class="notice"><b>◌ OLEDify processing…</b><p>Updating previews and downloads.</p></div><p>Keep controls visible. Downloads wait for current output.</p></section>
  <section><h2>Actionable error</h2><div class="notice error"><b>AI subject detection failed.</b><p>Using entropy crops. You can still position each crop.</p>${button('Retry AI detection')}</div></section>
  <section><h2>Upscaling warning</h2><div class="notice"><b>△ This crop will be upscaled.</b><p>Detail may look softer. Choose a larger source or adjust the crop.</p></div><small>Shown on the affected device, without blocking export.</small></section>
  <section><h2>AI disabled</h2><span class="choice selected">✓ Smart (entropy)</span><p>Keep all five anchors. Omit AI choices, disclosure, and status.</p></section>
  <section><h2>AI pending</h2><div class="notice"><b>◌ Finding a subject…</b><p>Using entropy crops while AI works. You can frame crops now.</p></div><p>AI is suggesting a wallpaper name. You can edit and download now.</p></section>
  <section><h2>Selected control</h2><span class="choice selected">✓ Smart (AI)</span><p>A checkmark and stronger boundary accompany color. Touch targets are at least 44px.</p></section></div>`;
}
const css = `
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 'Avenir Next',sans-serif}h1,h2,p,figure{margin:0}h1{font:36px/1.15 Georgia,serif;letter-spacing:-.025em}h2{font-size:17px;line-height:1.35;font-weight:650}p{margin-top:12px}small,.small,figcaption{font-size:14px;color:var(--muted);line-height:1.5}.artifact{background:var(--ink);color:var(--bg);padding:9px 24px;font:13px/1.4 sans-serif;text-align:center}header{padding:25px 4%;display:flex;gap:24px;align-items:center;border-bottom:1px solid var(--line)}.brand{font-weight:750;font-size:22px;letter-spacing:-1px;margin-right:auto}nav{display:flex;gap:18px;align-items:center}.stage{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)}.stage b{width:28px;height:28px;border:1px solid var(--line);display:grid;place-items:center;border-radius:50%;font-size:13px}.current{color:var(--ink);font-weight:700}.current b{background:var(--accent);color:var(--on);border-color:var(--accent)}main{max-width:1280px;margin:auto;padding:38px 40px 52px}.button{min-height:44px;padding:10px 17px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:14px;font-weight:650;border-radius:5px;text-align:center;overflow-wrap:anywhere;max-width:100%}.primary{background:var(--accent);color:var(--on);border-color:var(--accent)}.intro h1{font-size:56px}.intro p,.task-heading p{color:var(--muted)}.input-grid{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:34px;align-items:center}.upload{background:var(--paper);padding:34px;border:1px dashed var(--line);text-align:center}.upload-symbol{font-size:42px;color:var(--accent);margin-bottom:8px}.upload .button{margin:18px 0 6px}.disclosure{text-align:left;border-top:1px solid var(--line);margin-top:24px;padding-top:16px;color:var(--muted);font-size:14px}.example{padding:36px;background:var(--paper);position:relative}.example img{width:100%;display:block}.example-crops{position:absolute;inset:36px 36px 90px;display:flex;justify-content:center;align-items:center;gap:15px}.example-crops span{height:85%;width:25%;border:2px solid white;box-shadow:0 0 0 1px black}.example-crops span+span{width:43%;height:65%}figcaption{margin-top:16px}.closing{margin-top:24px;color:var(--muted)}.workbench{display:grid;grid-template-columns:310px minmax(0,1fr);gap:32px;margin-top:28px}.settings{background:var(--paper);padding:22px;border-radius:5px}.settings section+section{border-top:1px solid var(--line);margin-top:20px;padding-top:20px}.check{display:flex;gap:10px;align-items:center;min-height:44px;font-size:14px}.box{width:19px;height:19px;flex-shrink:0;border:1px solid var(--line);display:grid;place-items:center;line-height:1;font-size:13px;font-weight:800}.box:not(:empty){background:var(--accent);color:var(--on);border-color:var(--accent)}.methods{display:flex;flex-direction:column;gap:8px;margin-top:14px}.choice{border:1px solid var(--line);padding:10px 12px;min-height:44px;display:inline-flex;align-items:center;font-size:14px;border-radius:4px}.selected{border:2px solid var(--accent);font-weight:700;color:var(--accent)}.anchor-row{display:flex;align-items:center;gap:18px;margin-top:16px}.anchors{display:grid;grid-template:repeat(3,44px)/repeat(3,44px);background:var(--bg);border:1px solid var(--line)}.anchors span{display:grid;place-items:center;font-size:26px}.anchors span:nth-child(2){grid-area:1/3}.anchors span:nth-child(3){grid-area:2/2}.anchors span:nth-child(4){grid-area:3/1}.anchors span:nth-child(5){grid-area:3/3}.threshold{display:flex;justify-content:space-between;font-size:14px}.slider{height:6px;background:var(--bg);border:1px solid var(--line);margin:20px 0}.slider i{display:block;width:18px;height:18px;border-radius:50%;background:var(--accent);position:relative;left:12%;top:-7px}.reference{display:flex;gap:20px;align-items:center;padding:18px;background:var(--paper);margin-bottom:24px}.reference img{width:145px;height:97px;object-fit:contain}.reference h2{margin-bottom:6px}.crop-pair,.download-pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}.crop-card{min-width:0;padding:18px;background:var(--paper)}.crop-title{min-height:73px}.crop-image{position:relative;overflow:hidden}.crop-image img{width:100%;display:block}.scrim{position:absolute;top:0;height:100%;border:2px solid white;outline:1px solid black;box-shadow:0 0 0 800px #0009}.scrim.phone{width:30.7%;left:41%}.scrim.tablet{width:66.67%;left:22%}.scrim span{position:absolute;top:6px;left:4px;font:11px/1.4 sans-serif;padding:3px;background:#000;color:white;white-space:nowrap}.crop-card .button{margin-top:14px}.next{margin-top:24px;display:flex;justify-content:flex-end}.source-meta{margin-left:12px}.delivery{display:flex;gap:40px;align-items:center;justify-content:space-between;margin:26px 0 30px;padding:24px;background:var(--paper)}.name{width:47%}.text-field{border:1px solid var(--line);background:var(--bg);padding:12px;margin:8px 0;font-size:18px}.ai{font-size:13px;color:var(--accent);margin-left:8px}.zip .button{margin-top:10px}.download-card{min-width:0}.image-mat{height:350px;display:grid;place-items:center;background:var(--paper);padding:26px;margin-bottom:18px}.device img{height:100%;width:100%;display:block;object-fit:cover}.device{height:290px;max-width:100%}.device.phone{aspect-ratio:1320/2868}.device.tablet{aspect-ratio:1;width:min(100%,290px);height:auto;min-width:0}.filename{font-size:14px;overflow-wrap:anywhere;margin:10px 0 18px;color:var(--muted)}.back{margin-top:28px}.focused{outline:3px solid var(--accent);outline-offset:4px;margin:8px}.disabled{color:var(--muted);background:var(--bg);border-style:dashed}.notice{padding:18px;border-left:4px solid var(--accent);background:var(--bg)}.notice p{margin:8px 0 12px}.error{border:2px solid var(--accent)}.state-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}.state-grid section{background:var(--paper);padding:24px}.state-grid h2{margin-bottom:20px}.state-grid p{color:var(--muted)}footer{padding:18px 4%;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
.cut-bench{font-family:Verdana,sans-serif;font-size:15px}.cut-bench h1{font-family:'DIN Condensed',Impact,sans-serif;font-size:46px;letter-spacing:0}.cut-bench .intro h1{font-size:66px}.cut-bench header{height:90px}.cut-bench nav{position:absolute;top:145px;left:28px;display:grid;gap:28px;width:165px}.cut-bench main{margin-left:190px;max-width:none;padding:30px 32px;border-left:5px solid var(--accent);min-height:calc(100vh - 120px)}.cut-bench .button,.cut-bench .choice,.cut-bench .settings{border-radius:0}.cut-bench .stage b{border-radius:0}.cut-bench .workbench{gap:18px;grid-template-columns:290px minmax(0,1fr)}.cut-bench .settings{padding:18px;border:1px solid var(--line)}.cut-bench .crop-pair{gap:14px}.cut-bench .crop-card{border-top:4px solid var(--accent);padding:14px}.cut-bench .reference{padding:10px}.cut-bench .reference img{width:110px;height:73px}.cut-bench .input-grid{gap:26px}.cut-bench .example{padding:22px}.cut-bench .example-crops{inset:22px 22px 90px}.cut-bench .delivery{border-left:5px solid var(--accent)}.cut-bench .image-mat{border-bottom:4px solid var(--accent)}
.screen-room{font-family:'Trebuchet MS',sans-serif}.screen-room h1{font-family:Optima,'Trebuchet MS',sans-serif;font-size:38px;letter-spacing:-.015em}.screen-room .intro{text-align:center}.screen-room .intro h1{font-size:54px}.screen-room .input-grid{max-width:1000px;margin:32px auto;gap:40px}.screen-room .upload{border:1px solid var(--line);border-radius:24px}.screen-room .example{order:-1;background:transparent}.screen-room .example>img{border:8px solid var(--ink);border-radius:30px}.screen-room .example-crops{display:none}.screen-room .closing{text-align:center}.screen-room .button{border-radius:28px;padding-inline:22px}.screen-room .settings{border-radius:20px;padding:24px}.screen-room .workbench{grid-template-columns:minmax(0,1fr) 320px}.screen-room .settings{grid-column:2;grid-row:1}.screen-room .images{grid-column:1;grid-row:1}.screen-room .crop-card{border-radius:16px}.screen-room .reference{background:transparent;padding:0}.screen-room .delivery{border-radius:20px}.screen-room .image-mat{background:transparent;height:380px}.screen-room .device{border:8px solid var(--ink);border-radius:28px;overflow:hidden;height:310px;box-shadow:0 14px 0 -8px var(--line)}.screen-room .device.tablet{border-radius:20px;height:auto;width:min(100%,310px)}.screen-room .download-card{text-align:center}.screen-room .state-grid section{border-radius:18px}
@media(max-width:800px){header{flex-wrap:wrap;padding:18px 20px;gap:16px}.brand{font-size:21px}header>.button{min-height:40px;padding:8px 12px}nav{order:3;width:100%;justify-content:space-between;gap:6px}.stage{font-size:12px;gap:5px}.stage b{width:25px;height:25px}main{padding:28px 20px 36px}.intro h1{font-size:42px}h1{font-size:30px}.input-grid,.workbench,.crop-pair,.download-pair,.state-grid{grid-template-columns:1fr;gap:24px}.input-grid{margin-top:24px}.upload{padding:25px 20px}.example{padding:24px}.example-crops{inset:24px 24px 90px}.settings{padding:20px}.crop-title{min-height:65px}.reference{gap:14px;padding:14px}.reference img{width:100px;height:70px}.reference small{font-size:12px}.reference h2{font-size:15px}.crop-card{padding:18px}.next .button{width:100%}.delivery{display:block;padding:20px}.name{width:100%}.zip{margin-top:20px}.zip .button{width:100%}.source-meta{display:block;margin-left:0}.image-mat{height:330px}.state-grid section{padding:20px}.cut-bench header{height:auto}.cut-bench nav{position:static;width:100%;display:flex;gap:5px}.cut-bench main{margin-left:0;padding:26px 16px;border-left-width:4px;min-height:0}.cut-bench .workbench{grid-template-columns:1fr}.cut-bench .intro h1{font-size:55px}.cut-bench h1{font-size:38px}.cut-bench .crop-pair{gap:24px}.screen-room h1{font-size:32px}.screen-room .intro h1{font-size:43px}.screen-room .input-grid{gap:20px}.screen-room .example{order:0;padding:16px}.screen-room .workbench{grid-template-columns:1fr}.screen-room .settings,.screen-room .images{grid-column:auto;grid-row:auto}.screen-room .settings{padding:20px}.screen-room .image-mat{height:360px}.screen-room .delivery{padding:20px}.artifact{padding:9px 12px;font-size:11px}.anchor-row{gap:14px}.state-grid{gap:20px}}
`;
function html(c, screen, appearance, viewport) {
  const colors = appearance === 'dark' ? c.dark : c.colors;
  const vars = ['bg', 'paper', 'ink', 'muted', 'accent', 'line']
    .map((s, i) => `--${s}:${colors[i]}`)
    .join(';');
  const title = `${c.name} / ${screen[0].toUpperCase() + screen.slice(1)} / ${viewport} / ${appearance}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body class="${c.id}" style="${vars};--on:${appearance === 'dark' ? colors[0] : '#FFFFFF'}"><div class="artifact">Static design mockup · ${title}</div><header><strong class="brand">shin-wallslice</strong>${stage(screen)}${screen === 'input' ? '' : button('Start over')}</header><main>${screen === 'input' ? input(c) : screen === 'processing' ? processing() : screen === 'download' ? download() : states()}</main><footer>Design proposal · ${c.name} · Images are illustrative · No interactive controls</footer></body></html>`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const records = [];
try {
  for (const c of concepts) {
    for (const screen of ['input', 'processing', 'download', 'states']) {
      for (const appearance of ['light', 'dark']) {
        for (const [viewport, width] of screen === 'states'
          ? [['desktop', 1440]]
          : [
              ['desktop', 1440],
              ['mobile', 390],
            ]) {
          const name = `${c.id}-${screen}-${viewport}-${appearance}`;
          await writeFile(
            path.join(out, `${name}.html`),
            html(c, screen, appearance, `${viewport} ${width}px`),
          );
          await page.setViewportSize({
            width,
            height: screen === 'states' ? 1100 : 1000,
          });
          await page.goto(
            new URL(`mockups/${name}.html`, import.meta.url).href,
          );
          await page.evaluate(() => document.fonts.ready);
          const failures = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            missing: [...document.images]
              .filter((i) => !i.complete || i.naturalWidth === 0)
              .map((i) => i.src),
          }));
          if (failures.overflow || failures.missing.length)
            throw new Error(`${name}: ${JSON.stringify(failures)}`);
          if (
            screen === 'processing' &&
            !(await page.getByText('Next: Download', { exact: true }).count())
          )
            throw new Error('Missing processing action');
          if (
            screen === 'download' &&
            (await page.getByText('Download PNG', { exact: true }).count()) !==
              2
          )
            throw new Error('Missing PNG actions');
          await page.screenshot({
            path: path.join(out, `${name}.png`),
            fullPage: true,
          });
          if (viewport === 'mobile') {
            await page.setViewportSize({ width: 320, height: 900 });
            if (
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              )
            )
              throw new Error(`${name} overflows at 320px`);
          }
          records.push({
            concept: c.id,
            screen,
            appearance,
            viewport,
            file: name,
          });
        }
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  path.join(root, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>shin-wallslice v1.1.0 design comparison</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f4f5f7;color:#202534}main{max-width:1300px;padding:36px 24px;margin:auto}h1{font-size:36px;line-height:1.2}h2{margin-top:50px}a{color:#174b9e}nav{display:flex;gap:24px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:20px}.view{display:block;border:1px solid #8c939f;padding:12px;background:white;text-decoration:none}.view img{width:100%;height:260px;object-fit:contain;object-position:top;background:#e4e7ec}.view span{display:block;margin-top:12px;font-weight:600}.note{max-width:80ch}a:focus-visible{outline:3px solid #174b9e;outline-offset:4px}</style></head><body><main><p>shin-wallslice / v1.1.0 / Design review</p><h1>One workflow. Three visual identities.</h1><p class="note">36 static screen mockups and six state sheets. These are design artifacts, not an interactive prototype or the running application. Click any image for its readable full-size PNG. Mobile images include the full scrolling page.</p><p><a href="README.md">Read the audit, palettes, type, layout plans, tradeoffs, and recommendation</a></p><p><a href="implemented/index.html">View the implemented Passepartout and visual comparisons</a></p><nav>${concepts.map((c) => `<a href="#${c.id}">${c.name}</a>`).join('')}</nav><p class="note">Shared fixture: Dusk Ridges, iPhone 18 Pro Max + M5 iPad Pro 11-inch, Smart (AI), OLEDify 32, name dusk-ridges, device folders enabled. Selected: Passepartout, with reduced interface copy. Cut Bench and Screen Room are superseded proposals.</p>${concepts
    .map(
      (c) =>
        `<section id="${c.id}"><h2>${c.name}</h2><p>${c.note}</p>${[
          'input',
          'processing',
          'download',
          'states',
        ]
          .map(
            (s) =>
              `<h3>${s[0].toUpperCase() + s.slice(1)}</h3><div class="grid">${records
                .filter((r) => r.concept === c.id && r.screen === s)
                .map(
                  (r) =>
                    `<a class="view" href="mockups/${r.file}.png"><img loading="lazy" src="mockups/${r.file}.png" alt="${c.name} ${r.screen} ${r.viewport} ${r.appearance} mockup"><span>${r.screen} / ${r.viewport} / ${r.appearance}</span></a>`,
                )
                .join('')}</div>`,
          )
          .join('')}</section>`,
    )
    .join('')}</main></body></html>`,
);
await writeFile(
  path.join(root, 'verification.json'),
  JSON.stringify(
    {
      primaryMockups: records.filter((r) => r.screen !== 'states').length,
      stateSheets: records.filter((r) => r.screen === 'states').length,
      viewports: [1440, 390],
      overflowStressWidth: 320,
      checks: [
        'all image assets loaded',
        'no horizontal overflow',
        'processing and download actions present',
      ],
      artifacts: records,
    },
    null,
    2,
  ) + '\n',
);
for (const file of (await readdir(out)).filter((f) => f.endsWith('.html'))) {
  await rm(path.join(out, file));
}
const indexPath = path.join(root, 'index.html');
await writeFile(
  indexPath,
  await format(await readFile(indexPath, 'utf8'), { parser: 'html' }),
);
console.log(
  `Rendered ${records.length} static design artifacts. All asset and overflow checks passed.`,
);
