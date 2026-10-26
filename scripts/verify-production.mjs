import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserOptions } from './browser-options.mjs';
const basePath=process.env.PREVIEW_BASE_PATH || '/', baseURL='http://127.0.0.1:4174'+basePath;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4174','--strictPort','--base',basePath],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
let browser;const checks=[],errors=[];
try {
  let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error(output);try{const response=await fetch(baseURL);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw new Error('Production preview did not start');
  browser=await chromium.launch(browserOptions());const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(response.url().startsWith('http://127.0.0.1:4174/')&&response.status()>=400)errors.push(response.status()+' '+response.url());});
  const click=name=>page.getByRole('button',{name,exact:true}).click();
  await page.goto(baseURL,{waitUntil:'networkidle'});await page.locator('.region-list button').first().waitFor();await click('外观主题');assert.equal(await page.locator('.theme-options button').count(),2);await click('暗夜模式');await click('外观主题');await click('城市记录');await click('添加旅行记录');await page.locator('select').first().selectOption('330000');await page.waitForFunction(()=>!document.querySelector('button[type="submit"]').disabled);await page.locator('select').nth(1).selectOption('330100');await page.getByPlaceholder('例如：在西湖，把日子慢下来').fill('生产构建原图验证');await page.getByLabel('上传旅行照片',{exact:true}).setInputFiles('public/assets/hangzhou.png');await page.waitForFunction(()=>!!document.querySelector('.upload-photos img')?.getAttribute('src'));await click('点亮并保存');await page.waitForFunction(()=>!document.querySelector('.record-modal'));await page.reload({waitUntil:'networkidle'});await click('城市记录');await page.locator('.city-tile').filter({hasText:'杭州'}).click();await page.getByRole('heading',{name:'生产构建原图验证',exact:true}).waitFor();checks.push('compiled mobile app imports and persists an original-photo trip, with two appearance modes');
  await click('回忆录');await click('萤火旅线');await page.locator('.journey-stops li').first().waitFor();await click('播放旅线');await page.waitForFunction(()=>Number(document.querySelector('[aria-label="旅线进度"]').value)>0);await click('暂停旅线');await click('照片地图');await page.getByLabel('照片填充区域',{exact:true}).selectOption('330000');await click('多图拼贴');await click('填充照片1');await click('填充照片2');await page.getByText('拼贴已自动保存',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('compiled lazy journey and photo-map chunks load and operate at mobile width');
  await click('我的设置');const downloading=page.waitForEvent('download');await click('导出旅行备份');const path='qa/features/production-backup.yhf';await(await downloading).saveAs(path);const header=await fs.open(path,'r');try{const bytes=Buffer.alloc(8);await header.read(bytes,0,8,0);assert.equal(bytes.toString(),'YHF3BIN\n');}finally{await header.close();}checks.push('compiled app exports a complete binary original-photo backup');
  await page.screenshot({path:'qa/features/09-production-mobile.png',fullPage:true});await context.close();
} finally {await browser?.close();server.kill();await fs.writeFile('qa/features/production-results.json',JSON.stringify({checkedAt:new Date().toISOString(),basePath,checks,errors},null,2));}
console.log(JSON.stringify({scenariosPassed:checks.length,checks,errors},null,2));if(errors.length)process.exitCode=1;
