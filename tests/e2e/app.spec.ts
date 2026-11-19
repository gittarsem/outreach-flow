import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.describe('OutreachFlow desktop shell',()=>{
 let app:ElectronApplication;let page:Page;let dataPath='';
 test.beforeAll(async()=>{
   dataPath=await fs.mkdtemp(path.join(os.tmpdir(),'outreachflow-e2e-'));
   app=await electron.launch({args:[path.resolve('.')],env:{...process.env,OUTREACHFLOW_TEST_USER_DATA_DIR:dataPath},timeout:40000});
   page=await app.firstWindow();await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 });
 test.afterAll(async()=>{if(app)await app.close();if(dataPath)await fs.rm(dataPath,{recursive:true,force:true});});
 test('composes and schedules generic email with editable cadence and tracking',async()=>{
   await expect(page.getByText('Gmail disconnected')).toBeVisible();
   await page.getByRole('button',{name:'Compose Email',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Compose Email'})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Message details'})).toBeVisible();
   await expect(page.getByLabel('Job description')).toHaveCount(0);
   await page.getByLabel('Recipient name').fill('Casey');
   await page.getByLabel('Email address *').fill('casey@example.test');
  await page.getByRole('button',{name:'Schedule for later'}).click();
  await page.getByLabel('Send date (IST)').fill('2099-01-02');
  await page.getByLabel('Send time (IST)').nth(0).fill('14:20');
   await page.getByLabel('Repeat every (days)').fill('4');
   await page.getByLabel('Send time (IST)').nth(1).fill('13:15');
   await expect(page.getByText('Day 4 · 13:15 IST')).toBeVisible();
   await page.getByLabel('Email template').selectOption({label:'General introduction · General'});
   await page.getByRole('button',{name:'Insert template'}).click();
   await page.getByLabel('Subject *').fill('Custom subject');
   await expect(page.getByLabel('Subject *')).toHaveValue('Custom subject');
   await expect(page.getByRole('button',{name:'Review & schedule'})).toBeDisabled();
   await expect(page.getByText('2099-01-02 at 14:20 IST')).toBeVisible();
   await page.getByRole('button',{name:'Email Log',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Email Log'})).toBeVisible();
   await page.getByRole('button',{name:'Follow-ups',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Follow-ups'})).toBeVisible();
   await page.getByRole('button',{name:'Profile',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Sender details'})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Resume library'})).toBeVisible();
 });
});
