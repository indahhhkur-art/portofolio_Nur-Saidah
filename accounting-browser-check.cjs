const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

async function main() {
  const root = join(process.env.LOCALAPPDATA, 'Temp', 'opencode');
  mkdirSync(root, { recursive: true });
  const artifacts = mkdtempSync(join(root, 'accounting-print-'));
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(artifacts, 'profile')}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
      let output = '';
      chrome.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      chrome.once('error', reject);
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextID = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timeout);
      message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
    };
    function call(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextID;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 45000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => call(method, params, sessionId);
    const evaluate = async expression => {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: pathToFileURL(process.env.PORTFOLIO_SOURCE || join(__dirname, 'index.html')).href });
    await evaluate(`(async () => {
      if (document.readyState !== 'complete') await new Promise(r => addEventListener('load', r, {once:true}));
      await document.fonts.ready; return true;
    })()`);
    const styleChecks = [];
    for (const width of [375, 768, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      styleChecks.push(await evaluate(`(async () => {
        document.getElementById('tab-invoice').click();document.getElementById('load-tool-demo').click();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
        const selectors=['body','#main-header','#home h1','#home p','#about h2','#skills .smooth-card',
          '#experience-grid','#experience h3','#balance-comparison .tool-workspace','.tool-tabs',
          '#tab-invoice','#invoice-form .tool-editor','#invoice-form .tool-actions','#invoice-rows input',
          '#invoice-preview','#invoice-preview .tool-table','#print-invoice'];
        return {width:innerWidth,styles:selectors.map(selector=>{
          const element=document.querySelector(selector),style=getComputedStyle(element);
          return {selector,values:Object.fromEntries(['display','fontFamily','fontSize','fontWeight','color','backgroundColor',
            'padding','borderRadius','borderWidth','gridTemplateColumns','gap','boxShadow'].map(key=>[key,style[key]]))};
        })};
      })()`));
    }
    writeFileSync(join(artifacts, 'style-check.json'), JSON.stringify(styleChecks, null, 2));
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const checks = await evaluate(`(() => {
      const get=id=>document.getElementById(id);
      get('tab-invoice').click();get('load-tool-demo').click();
      const result=get('invoice-result');
      const initial=result.textContent.includes('terlambat 3 hari')&&result.textContent.includes('400.000');
      get('invoice-discount-mode').value='percent';get('invoice-discount').value='10';
      get('invoice-form').requestSubmit();
      const percentage=result.textContent.includes('562.500')&&result.textContent.includes('362.500');
      get('invoice-discount').value='100.01';get('invoice-form').requestSubmit();
      const invalid=get('invoice-discount').getAttribute('aria-invalid')==='true'&&get('print-invoice').disabled;
      get('load-tool-demo').click();get('invoice-asof').value='2026-10-01';get('invoice-form').requestSubmit();
      const dateGuard=get('invoice-asof').getAttribute('aria-invalid')==='true';
      get('load-tool-demo').click();
      const defaultNoVat=get('invoice-vat').value==='none';
      get('invoice-vat').value='effective11';get('invoice-form').requestSubmit();
      const effective11=result.textContent.includes('666.000')&&result.textContent.includes('466.000')&&get('invoice-preview').textContent.includes('66.000');
      const hybridLayout=get('invoice-preview').querySelectorAll('.invoice-items-table thead th').length===6
        &&get('invoice-preview').textContent.includes('Empat ratus enam puluh enam ribu rupiah')
        &&get('invoice-preview').textContent.includes('PO-DEMO-001')
        &&get('invoice-preview').textContent.includes('Penanggung Jawab Demo');
      get('invoice-vat').value='full12';get('invoice-form').requestSubmit();
      const full12=result.textContent.includes('672.000')&&result.textContent.includes('472.000');
      get('invoice-paid').value='672000';get('invoice-form').requestSubmit();
      const vatPaid=result.textContent.includes('Lunas');
      get('invoice-paid').value='672001';get('invoice-form').requestSubmit();
      const vatOverpaid=get('invoice-paid').getAttribute('aria-invalid')==='true'&&get('print-invoice').disabled;
      get('load-tool-demo').click();get('invoice-vat').value='effective11';get('invoice-form').requestSubmit();
      get('invoice-vat').value='none';get('invoice-vat').dispatchEvent(new Event('change',{bubbles:true}));
      const taxChangeInvalidates=get('invoice-preview').hidden&&get('print-invoice').disabled;
      get('load-tool-demo').click();
      const observer=new MutationObserver(()=>{});
      observer.observe(result,{childList:true});
      for(let i=0;i<100;i++)get('invoice-form').dispatchEvent(new Event('input',{bubbles:true}));
      const pendingUpdatesCoalesced=observer.takeRecords().length<=1;
      observer.disconnect();
      const staleOutputBlocked=get('invoice-preview').hidden&&get('print-invoice').disabled;
      get('invoice-form').requestSubmit();
      const pendingCanRecalculate=result.textContent.includes('400.000')&&!get('invoice-preview').hidden;
      return { initial, percentage, invalid, dateGuard, defaultNoVat, effective11, hybridLayout, full12, vatPaid, vatOverpaid, taxChangeInvalidates, pendingUpdatesCoalesced, staleOutputBlocked, pendingCanRecalculate };
    })()`);
    Object.entries(checks).forEach(([name, passed]) => assert.equal(passed, true, name));
    await command('Emulation.setEmulatedMedia', { media: 'print' });
    const pdfs = [];
    async function print(kind, fileName) {
      const visible = await evaluate(`(() => {
        document.getElementById('tab-${kind}').click();
        document.getElementById('${kind}-form').requestSubmit();
        document.getElementById('panel-${kind}').classList.add('print-panel');
        document.body.classList.add('accounting-print-mode');
        const preview=document.getElementById('${kind}-preview');
        return {valid:!preview.hidden, navHidden:getComputedStyle(document.getElementById('main-header')).display==='none',
          editorHidden:getComputedStyle(document.querySelector('#${kind}-form .tool-editor')).display==='none',
          fullOpacity:getComputedStyle(document.querySelector('.tool-workspace')).opacity==='1'};
      })()`);
      assert.deepEqual(visible, { valid: true, navHidden: true, editorHidden: true, fullOpacity: true });
      const { data } = await command('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
      const buffer = Buffer.from(data, 'base64');
      const path = join(artifacts, fileName);
      writeFileSync(path, buffer);
      const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
      const mediaBox = buffer.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1];
      assert.ok(pages > 0 && buffer.length > 2000);
      pdfs.push({ path, pages, mediaBox });
      const screenshot = await command('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(artifacts, fileName.replace('.pdf', '.png')), Buffer.from(screenshot.data, 'base64'));
      await evaluate(`document.body.classList.remove('accounting-print-mode');document.querySelectorAll('.print-panel').forEach(p=>p.classList.remove('print-panel'));`);
      return pages;
    }
    assert.equal(await print('invoice', 'invoice-demo.pdf'), 1);
    await evaluate(`document.getElementById('invoice-vat').value='effective11';document.getElementById('invoice-form').requestSubmit();`);
    assert.equal(await print('invoice', 'invoice-ppn-demo.pdf'), 1);
    await evaluate(`document.getElementById('tab-ledger').click();document.getElementById('load-tool-demo').click();`);
    assert.equal(await print('ledger', 'buku-kas-demo.pdf'), 1);
    await evaluate(`(() => {
      document.getElementById('tab-invoice').click();document.getElementById('load-tool-demo').click();
      for(let i=0;i<45;i++){
        document.getElementById('add-invoice').click();const row=document.getElementById('invoice-rows').lastElementChild;
        row.querySelector('[data-description]').value='Jasa tambahan contoh demo '+(i+1);
        row.querySelector('[data-quantity]').value='1';row.querySelector('[data-amount]').value='1000';
      }
    })()`);
    assert.ok(await print('invoice', 'invoice-multipage-demo.pdf') >= 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, errors, pdfs, artifacts }, null, 2));
    await call('Browser.close');
  } finally {
    socket?.close();
    chrome.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
