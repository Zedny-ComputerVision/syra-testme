const { chromium } = require('playwright');
const path=require('path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.goto('https://trial.youtestme.com/251003113025uvu/login.xhtml', {waitUntil:'domcontentloaded'});
  await page.fill('input[name="loginForm:username"]','admin');
  await page.fill('input[name="loginForm:password"]','ZednyAdmin12#');
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded'}).catch(()=>{}),
    page.click('#loginForm\\:signInBtn')
  ]);
  await page.goto('https://trial.youtestme.com/251003113025uvu/pages/quizzes.xhtml', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1000);
  const btn=page.locator('#allTestsFullForm\\:allTests\\:0\\:j_idt413');
  await btn.click();
  await page.waitForNavigation({waitUntil:'domcontentloaded', timeout:60000}).catch(()=>{});
  await page.waitForTimeout(1000);
  await page.screenshot({path:'frontend/output/playwright/test-candidates.png', fullPage:true});
  console.log('url', page.url());
  const titles = await page.title();
  console.log('title', titles);
  await browser.close();
})();
