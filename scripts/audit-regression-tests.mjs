// F05–F22: counterexamples from the code audit, executed by both browser suites.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
const require = createRequire(import.meta.url);

export async function runAuditRegressionTests(browser, baseURL, { assertEq }) {
  console.log('\n=== F05–F22: Audit-Regression ===');
  const check = (name, value, expected) => assertEq(`AUDIT ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-10-14T10:00:00+02:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    const results = await page.evaluate(async () => {
      const C = await import('/modules/compute.js');
      const U = await import('/modules/util-time.js');
      const { findEntryConflict } = await import('/modules/entry-conflicts.js');
      const { restoreArchiveReport } = await import('/modules/archive-report.js');
      const { reportMode } = await import('/modules/report-mode.js');
      const { validateBackup } = await import('/modules/backup-validation.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const schedule = Object.fromEntries(C.DAY_KEYS.map((k,i) => [k, {enabled:i<5,start:'09:00',end:'17:00',break:0}]));
      const emp = {id:'audit',name:'Audit Arbeitgeber',kind:'employer',color:'#123456',contacts:[],
        hoursMode:'week',weeklyHours:40,monthlyHours:160,schedule,hiredSince:'2026-10-01',annualVacation:30,breakMode:'none'};
      const ctx = {state:{employers:[emp],entries:[],settings:{state:'HE'}}};
      const entry = (id,date,type='work') => ({id,date,type,employerId:emp.id,start:'09:00',end:'17:00',breakMinutes:0});
      for (const [start,end,minutes,dates] of [
        ['2026-10-14T23:00','2026-10-15T01:00',120,['2026-10-14','2026-10-15']],
        ['2026-10-25T22:00','2026-10-26T01:00',180,['2026-10-25','2026-10-26']],
        ['2026-03-28T23:00','2026-03-30T01:00',1560,['2026-03-28','2026-03-29','2026-03-30']],
        ['2026-10-24T23:00','2026-10-26T01:00',1560,['2026-10-24','2026-10-25','2026-10-26']],
        ['2026-12-31T23:00','2027-01-01T00:00',60,['2026-12-31']],
      ]) {
        const parts=U.splitAcrossMidnight(new Date(start),new Date(end));
        test(`F05 ${start} Minuten (Uhrzeitmodell)`,parts.reduce((s,p)=>s+U.timeToMinutes(p.end)-U.timeToMinutes(p.start),0),minutes);
        test(`F05 ${start} Kalendertage`,parts.map(p=>p.date),dates);
        test(`F05 ${start} Mitternachtsgrenze`,parts[0].end,'24:00');
      }
      test('F05 umgekehrtes Intervall',U.splitAcrossMidnight(new Date(2026,9,2),new Date(2026,9,1)),[]);
      const backup={schemaVersion:7,employers:[emp],entries:[{id:'h',employerId:emp.id,date:'2026-10-14',type:'homeoffice',segments:[{start:'23:00',end:'24:00'}]}],
        archives:[],templates:[],auditLog:[],settings:{state:'HE',appMode:'employee'},activeEmployerId:emp.id,runningTimer:null};
      let accepted=true;try { validateBackup(backup); } catch { accepted=false; }
      test('F05 Backup 24:00 akzeptiert',accepted,true);
      backup.entries[0].segments[0].start='24:00';
      let rejected=false;try { validateBackup(backup); } catch { rejected=true; }
      test('F05 Start 24:00 abgewiesen',rejected,true);
      const asOf = () => C.computeGleitzeitkontoAsOfToday(emp,2026,'2026-10-14',ctx);
      test('F06 Stichtag Basis',asOf().cumulativeBalance,-4800);
      ctx.state.entries=[entry('future','2026-10-30','vacation')];
      test('F06 Zukunftsurlaub nicht gutgeschrieben',asOf().cumulativeBalance,-4800);
      ctx.state.entries.push(entry('off','2026-10-12','off_day'));
      test('F06 freier Tag senkt vergangenes Soll',asOf().cumulativeBalance,-4320);
      test('F07 nur Beschäftigungsmonat',C.computeGleitzeitkontoRollingWindow(emp,'2026-10-14',ctx).months,['2026-10']);
      test('F07 Soll einschließlich freiem Tag',C.computeGleitzeitkontoRollingWindow(emp,'2026-10-14',ctx).targetMin,4320);
      test('F07 Zukunftsurlaub ausgeschlossen',C.computeGleitzeitkontoRollingWindow(emp,'2026-10-14',ctx).actualMin,0);
      emp.hiredSince='2026-10-13';
      test('F07 Arbeitstage ab Eintritt',C.computeGleitzeitkontoRollingWindow(emp,'2026-10-14',ctx).elapsedWorkdaysCurrentMonth,2);
      test('F07 Mindesttage nicht erreicht',C.computeGleitzeitkontoRollingWindow(emp,'2026-10-14',ctx).months,[]);
      emp.hiredSince='2025-12-01';ctx.state.entries=[];
      const dec=C.computeMonthReport(emp.id,'2025-12',ctx).balance;
      test('F06 Vorjahr im Januar',C.computeGleitzeitkontoAsOfToday(emp,2026,'2026-01-02',ctx).cumulativeBalance,dec-480);
      emp.hiredSince='2026-09-01';emp.employmentEndDate='2026-09-30';
      test('F06 kein Soll nach Ende',asOf().cumulativeBalance,C.computeMonthReport(emp.id,'2026-09',ctx).balance);
      test('F07 kein Oktober nach Ende',C.computeGleitzeitkontoRollingWindow(emp,'2026-10-14',ctx).months,['2026-09']);
      delete emp.employmentEndDate;emp.hiredSince='2026-10-01';
      for (const type of ['vacation','sick','off_day','overtime_reduction']) {
        const absence=entry('a','2026-10-14',type), work=entry('w','2026-10-14');
        test(`F08 ${type} -> Arbeit`,!!findEntryConflict([absence],work),true);
        test(`F08 Arbeit -> ${type}`,!!findEntryConflict([work],absence),true);
        test(`F08 ${type} -> Homeoffice`,!!findEntryConflict([absence],{...work,type:'homeoffice'}),true);
        test(`F08 ${type} Selbstbearbeitung`,!!findEntryConflict([absence],absence),false);
      }
      test('F08 anderer Arbeitgeber erlaubt',!!findEntryConflict([entry('a','2026-10-14','sick')],{...entry('b','2026-10-14'),employerId:'other'}),false);
      test('F08 mehrere Arbeitsblöcke erlaubt',!!findEntryConflict([entry('a','2026-10-14')],entry('b','2026-10-14')),false);
      emp.schedule.sat={enabled:true,start:'09:00',end:'13:00',break:0};
      ctx.state.entries=[entry('sat','2026-10-10','vacation')];
      test('F09 Samstag gutgeschrieben',C.computeMonthReport(emp.id,'2026-10',ctx).creditedAbsenceMin,240);
      emp.schedule.sat.enabled=false;
      test('F09 inaktiver Samstag keine Gutschrift',C.computeMonthReport(emp.id,'2026-10',ctx).creditedAbsenceMin,0);
      emp.hiredSince='2026-01-01';emp.hoursMode='month';
      ctx.state.entries=[entry('vac','2026-05-04','vacation')];
      const may=C.computeMonthReport(emp.id,'2026-05',ctx);
      test('F10 Soll Hessen Mai',may.targetMin,8229);
      test('F10 einheitliche Tagesgutschrift',may.creditedAbsenceMin,457);
      test('F10 Monat gleich Summe Tage',may.targetMin,Math.round(U.monthDates('2026-05').reduce((s,d)=>s+C.computeDayTargetMinutes(emp,d,{stateCode:'HE'}),0)));
      test('F10 Rundung ohne 0:60',U.minutesToHM(59.8),'1:00');
      for (const hours of [20,40,50]) {
        const e={hoursMode:'week',weeklyHours:hours,schedule:C.defaultSchedule(hours)};
        test(`F11 Standard ${hours} netto`,C.computeWeekTargetMinutes(e,['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'],{stateCode:'HE'}),hours*60);
      }
      emp.hoursMode='week';emp.schedule.mon={enabled:true,start:'09:00',end:'10:00',break:120};
      test('F12 defensive Begrenzung',C.computeDayTargetMinutes(emp,'2026-10-12'),0);
      emp.schedule.mon={enabled:true,start:'09:00',end:'17:00',break:0};
      const ho={id:'ho',employerId:emp.id,date:'2026-10-14',type:'homeoffice',segments:[{start:'09:00',end:'11:00'}]};
      ctx.state.entries=[entry('a','2026-10-14'),entry('b','2026-10-14'),ho,{...ho,id:'ho2',date:'2026-10-15'}];
      test('F16 eindeutige Tage inkl. Homeoffice',C.computeMonthOverview('2026-10',ctx).rows[0].workEntriesCount,2);
      const archived=restoreArchiveReport({yearMonth:'2026-10',snapshot:{employer:emp,entries:[ho],workedMin:120,targetMin:480,balance:120}});
      test('F13 alter Snapshot Homeoffice',archived.homeofficeMin,120);
      test('F13 alter Snapshot Gutschrift rekonstruiert',archived.creditedAbsenceMin,480);
      test('F13 unbekannter Resturlaub nicht erfunden',archived.vacationRemaining===undefined,true);
      test('F15 Arbeitgeberbericht',reportMode(emp),'employee');
      test('F15 Kundenbericht',reportMode({hourlyRate:50}),'freelance');
      // Seed the actual app for browser workflows, without modifying user data.
      Object.assign(state,{employers:[{...emp,hiredSince:'2026-10-01'}],entries:[],archives:[],templates:[],activeEmployerId:emp.id,runningTimer:null});
      state.settings.appMode='employee';state.settings.state='HE';
      document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
      saveState();renderTracker();
      return out;
    });
    results.forEach(([n,v,e])=>check(n,v,e));
    await page.reload();await page.waitForFunction(()=>typeof window.renderTracker==='function');
    check('F18 absichtlich leere Vorlagen bleiben leer',await page.evaluate(()=>state.templates.length),0);
    await page.evaluate(()=>document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden')));
    await page.click('#btn-add-manual');
    await page.fill('#entry-break','-1');await page.selectOption('#entry-type','vacation');
    check('F17 ausgeblendete Pause validiert nicht',await page.locator('#entry-break').evaluate(e=>e.willValidate),false);
    await page.selectOption('#entry-type','work');
    check('F17 zurückgeschaltete Pause weiterhin ungültig',await page.locator('#entry-break').evaluate(e=>[e.disabled,e.value,e.checkValidity()]),[false,'-1',false]);
    await page.selectOption('#entry-type','vacation');await page.click('#form-entry button[type=submit]');
    check('F17 Urlaub trotz inaktiver Pause gespeichert',await page.evaluate(()=>state.entries.length),1);
    await page.click('#btn-add-manual');await page.fill('#entry-start','09:00');await page.fill('#entry-end','17:00');
    await page.click('#form-entry button[type=submit]');
    check('F08 echtes Arbeitsformular blockiert Konflikt',await page.evaluate(()=>state.entries.length),1);
    await page.evaluate(()=>{document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));});
    await page.click('#btn-start');
    check('F08 Timerstart bei Urlaub gesperrt',await page.evaluate(()=>state.runningTimer),null);
    await page.evaluate(()=>{
      state.runningTimer={employerId:state.activeEmployerId,type:'homeoffice',startISO:'2026-10-13T23:00:00+02:00'};
      renderTracker();
    });
    await page.click('#btn-end');
    check('F08 Timerende atomar bei Konflikt am Folgetag',await page.evaluate(()=>[state.entries.length,!!state.runningTimer]),[1,true]);
    await page.evaluate(()=>{state.runningTimer=null;renderTracker();});
    await page.click('#btn-add-homeoffice');
    await page.fill('[data-seg-start]','23:00');await page.locator('[data-seg-midnight]').check();
    await page.click('#form-homeoffice button[type=submit]');
    check('F08 echtes Homeofficeformular blockiert Konflikt',await page.evaluate(()=>state.entries.length),1);
    await page.fill('#ho-date','2026-10-15');await page.click('#form-homeoffice button[type=submit]');
    check('F05 echte Mitternachtseingabe gespeichert',await page.evaluate(()=>state.entries.find(e=>e.type==='homeoffice')?.segments),[{start:'23:00',end:'24:00'}]);
    await page.click('#btn-add-homeoffice');await page.fill('#ho-date','2026-10-15');
    await page.locator('#ho-date').press('Tab');
    // Reopen the existing date through its entry card to exercise the edit path.
    await page.evaluate(()=>{document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));switchView('entries');});
    const hoId=await page.evaluate(()=>state.entries.find(e=>e.type==='homeoffice').id);
    await page.locator(`.entry-card[data-id="${hoId}"]`).click();
    check('F05 Bearbeiten erhält 24:00-Schalter',await page.locator('[data-seg-midnight]').isChecked(),true);
    await page.setViewportSize({width:375,height:812});
    check('F05 schmaler Dialog ohne horizontalen Überlauf',await page.locator('#modal-homeoffice .modal-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    await page.click('#form-homeoffice button[type=submit]');
    check('F05 Bearbeiten erhält genau 60 Minuten',await page.evaluate(()=>computeHomeofficeMinutes(state.entries.find(e=>e.type==='homeoffice'))),60);
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(()=>{document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));switchView('employers');});
    await page.click('#btn-add-employer');await page.fill('#employer-name','Ungültige Pause');
    await page.fill('#schedule-grid [data-day="mon"] .day-start','09:00');
    await page.fill('#schedule-grid [data-day="mon"] .day-end','10:00');
    await page.fill('#schedule-grid [data-day="mon"] .day-break','120');
    await page.click('#form-employer button[type=submit]');
    check('F12 echtes Arbeitgeberformular blockiert Pause',await page.evaluate(()=>state.employers.length),1);
    await page.fill('#employer-weekly-hours','-1');await page.selectOption('#employer-hours-mode','month');
    check('F17 versteckte Wochenstunden validieren nicht',await page.locator('#employer-weekly-hours').evaluate(e=>e.willValidate),false);
    await page.fill('#employer-monthly-hours','160');await page.click('#form-employer button[type=submit]');
    check('F17 Monatsmodell speicherbar',await page.evaluate(()=>state.employers.length),2);
    await page.evaluate(()=>{document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));state.employers=state.employers.slice(0,1);state.entries=[];switchView('gleitzeitkonto');});
    const pdfParse=require('pdf-parse/lib/pdf-parse.js');
    const gleit=await page.evaluate(async()=>{const g=getCurrentGleitzeitkonto();return Array.from(new Uint8Array(await(await generateGleitzeitkontoPdfBlob(g.rows,g.emp,g.meta)).arrayBuffer()));});
    const gleitText=(await pdfParse(Buffer.from(gleit))).text;
    check('F14 PDF aktueller Saldo -80:00',/Aktueller Gleitzeitsaldo[\s\S]{0,80}-80:00/.test(gleitText),true);
    // A failed CDN request must not poison the retry promise.
    await context.route('https://unpkg.com/docx@**',r=>r.abort());
    check('F19 erster Ladeversuch schlägt fehl',await page.evaluate(async()=>{try{await(await import('/modules/lib-loader.js')).ensureDocxLib();return false;}catch{return true;}}),true);
    check('F19 defektes Script entfernt',await page.locator('script[data-lib="docx"]').count(),0);
    await context.unroute('https://unpkg.com/docx@**');
    check('F19 zweiter Ladeversuch erfolgreich',await page.evaluate(async()=>{await(await import('/modules/lib-loader.js')).ensureDocxLib();return !!window.docx;}),true);
    await page.evaluate(()=>{
      state.entries=[{id:'ho-archive',employerId:state.activeEmployerId,date:'2026-10-14',type:'homeoffice',segments:[{start:'09:00',end:'11:00'}]}];
      state.settings.appMode='freelance';state.settings.employeeName='Audit Person';switchView('report');document.getElementById('report-month').value='2026-10';renderReport();
    });
    check('F15 Bildschirm bleibt Arbeitgeberbericht',await page.locator('#report-content').evaluate(e=>e.textContent.includes('Soll')),true);
    await page.click('#btn-archive-month');
    const live=await page.evaluate(async()=>{const r=computeMonthReport(state.activeEmployerId,'2026-10');return {
      pdf:Array.from(new Uint8Array(await(await generatePdfBlob(r)).arrayBuffer())),
      word:Array.from(new Uint8Array(await(await generateWordBlob(r)).arrayBuffer()))};});
    const mammoth=require('mammoth');
    check('F15 gemischter Modus PDF Soll', (await pdfParse(Buffer.from(live.pdf))).text.includes('Soll-Stunden'),true);
    check('F15 gemischter Modus Word Soll', (await mammoth.extractRawText({buffer:Buffer.from(live.word)})).value.includes('Soll-Stunden'),true);
    check('F15 gemischter Modus CSV Arbeitgeber',await page.evaluate(async()=>(
      await generateCsvBlob(computeMonthReport(state.activeEmployerId,'2026-10')).text()).includes('Arbeitnehmer/in;Audit Person')),true);
    await page.evaluate(()=>{state.entries[0].segments[0].end='12:00';state.employers[0].name='Geändert';switchView('archive');});
    check('F13 Archiv bleibt unverändert',await page.evaluate(()=>[state.archives[0].snapshot.entries[0].segments[0].end,state.archives[0].snapshot.employer.name]),['11:00','Audit Arbeitgeber']);
    for (const kind of ['word','pdf']) {
      const downloadPromise=page.waitForEvent('download');await page.click(`#archive-list button[data-action="${kind}"]`);
      const download=await downloadPromise, stream=await download.createReadStream(), chunks=[];
      for await (const c of stream) chunks.push(c);
      const buf=Buffer.concat(chunks);
      const text=kind==='word'?(await mammoth.extractRawText({buffer:buf})).value:(await pdfParse(buf)).text;
      check(`F13 Archiv ${kind} Homeoffice-Tagesnachweis`,/Home.Office/.test(text)&&/2:00/.test(text)&&/14/.test(text),true);
      check(`F13 Archiv ${kind} alter Arbeitgeber`,text.includes('Audit Arbeitgeber')&&!text.includes('Geändert'),true);
    }
  } finally { await context.close(); }

  // Run the real service worker in isolated fault-injection environments.
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  const currentCache=sw.match(/const CACHE_NAME = '([^']+)'/)[1];
  async function worker(fail) {
    const handlers={}, deleted=[], cached=[];
    const sandbox={URL,Response,console:{warn(){}},self:{location:{origin:'https://example.test'},
      addEventListener:(n,f)=>handlers[n]=f,clients:{claim(){}},skipWaiting(){}},
      caches:{open:async()=>({put:async u=>cached.push(u)}),keys:async()=>[currentCache,'arbeitszeit-old','fremde-app'],
        delete:async k=>{deleted.push(k);return true;}},
      fetch:async u=>{if(fail(u))throw Error('controlled network failure');return new Response('ok');}};
    vm.runInNewContext(sw,sandbox);
    let wait;handlers.install({waitUntil:p=>wait=p});
    let installed=true;try{await wait;}catch{installed=false;}
    if(installed){handlers.activate({waitUntil:p=>wait=p});await wait;}
    return {installed,deleted,cached};
  }
  for (const asset of ['./','./app.js','./modules/compute.js','./styles.css','./manifest.json']) {
    const r=await worker(u=>u===asset);
    check(`F20 Kernfehler ${asset} verhindert Installation`,r.installed,false);
    check(`F20 Kernfehler ${asset} erhält alten Cache`,r.deleted,[]);
  }
  check('F20 komplett offline keine erfolgreiche Installation',(await worker(()=>true)).installed,false);
  const optional=await worker(u=>u.startsWith('https:')||u.endsWith('.png'));
  check('F20 optionale Ausfälle erlaubt',optional.installed,true);
  check('F21 nur eigene alte Caches löschen',optional.deleted,['arbeitszeit-old']);
  const tc=(await readFile(new URL('./typecheck.mjs',import.meta.url),'utf8'))
    .replace(/^import .*;$/gm,'').replace('import.meta.url',"'file:///repo/scripts/typecheck.mjs'");
  for (const [label,result,expected] of [
    ['ENOENT',{error:new Error('ENOENT'),status:null},1],
    ['Signal',{signal:'SIGTERM',status:null},1],
    ['Exit 1',{status:1},1],['Exit 2 ohne Diagnostik',{status:2},1],['Erfolg',{status:0},0],
    ['DOM Filter',{status:2,stdout:"a.js(1,1): error TS2339: Property 'value' does not exist on type 'HTMLElement'."},0],
    ['echter Typfehler',{status:2,stdout:'a.js(1,1): error TS2322: wrong type'},1],
  ]) {
    let exit;const stop={};
    try {vm.runInNewContext(tc,{spawnSync:()=>result,fileURLToPath:x=>x.replace('file://',''),path,
      console:{log(){},error(){}},process:{exit:n=>{exit=n;throw stop;}}});}catch(e){if(e!==stop)throw e;}
    check(`F22 ${label}`,exit,expected);
  }
}
