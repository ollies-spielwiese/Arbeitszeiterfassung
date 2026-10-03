// v3.9.94: explizites ASCII-Prüfprofil, Grenzwerte und reale Eingabepfade.
const special="!#$%&'*+-/=?^_`{|}~";
const cases=[
  ['',true],['   ',true],[' Name+arbeit@Sub.Example.DE ',true],
  ["o'connor@example.de",true],['first_last@example.de',true],['1@example.de',true],
  [`${special}@example.de`,true],['a.b.c@example.de',true],
  ['name@sub.example.travel',true],['name@intranet',true],['name@example.c',true],
  ['name@example.technology',true],['name@3d-studio.example',true],['a@123',true],
  ['name@xn--bcher-kva.de',true],['Name@XN--BCHER-KVA.DE',true],
  ['.name@example.de',false],['name.@example.de',false],['na..me@example.de',false],
  ['..@example.de',false],['a@',false],['@example.de',false],['a@@example.de',false],
  ['abc',false],['a b@example.de',false],['a@example de',false],
  ['a()@example.de',false],['a:b@example.de',false],['a<b>@example.de',false],
  ['a,b@example.de',false],['a;b@example.de',false],['a\\b@example.de',false],
  ['a@.example.de',false],['a@example.de.',false],['a@example..de',false],
  ['a@-example.de',false],['a@example-.de',false],['a@sub.-example.de',false],
  ['a@exam_ple.de',false],['a@example.de/path',false],['a@example.de:443',false],
  ['a@example.de%00',false],['a@xn--abc-.de',false],
  [`${'a'.repeat(64)}@example.de`,true],[`${'a'.repeat(65)}@example.de`,false],
  [`a@${'b'.repeat(63)}.de`,true],[`a@${'b'.repeat(64)}.de`,false],
  [`${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,true],
  [`${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,false],
  ['a@example.de\n',false],['\ra@example.de',false],['a\t@example.de',false],
  ['a@example.de\u0000',false],['a\u007f@example.de',false],
  ['"first.last"@example.de',false],['"a@b"@example.de',false],
  ['müller@example.de',false],['a@bücher.de',false],['a@[127.0.0.1]',false],
];
export async function runEmailRulesTests(browser, baseURL, { assertEq }) {
  console.log('\n=== E-Mail-Regeln vor und nach dem @ ===');
  const context = await browser.newContext();
  try {
    const p=await context.newPage();
    p.setDefaultTimeout(10000);
    const check=(name,actual,expected)=>assertEq(`EMAILRULE ${name}`,JSON.stringify(actual),JSON.stringify(expected));
    p.on('pageerror', error => check(`Browserfehler: ${error.message}`,true,false));
    p.on('console', message => {
      if(message.type()==='error')check(`Konsole: ${message.text()}`,true,false);
    });
    await p.goto(baseURL);
    await p.waitForFunction(()=>typeof emailFormatError==='function');
    for(const [value,valid] of cases){
      check(`Format ${JSON.stringify(value)}`,await p.evaluate(value=>!emailFormatError(value),value),valid);
    }
    for(const [value,needle] of [['.name@example.de','vor dem @'],['a@exam_ple.de','Nach dem @'],
      ['"a@b"@example.de','nicht unterstützt'],['müller@example.de','SMTPUTF8'],['a@bücher.de','Punycode']]){
      check(`Konkreter Hinweis ${value}`,await p.evaluate(({value,needle})=>emailFormatError(value).toLowerCase().includes(needle.toLowerCase()),{value,needle}),true);
    }
    check('Liste zulässigeTrenner',await p.evaluate(()=>emailListError("a@example.de; o'connor@example.de, a+b@example.de")),'');
    check('Liste Punktfehler mitGrund',await p.evaluate(()=>emailListError('a@example.de; a..b@example.de').includes('zwei Punkte')),true);
    check('Liste CRLF nicht wegtrimmen',await p.evaluate(()=>!!emailListError('a@example.de;\nb@example.de')),true);
    await p.evaluate(()=>{
      document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
      state.settings.ownEmail='alt@example.de';saveState();switchView('settings');
    });
    await p.fill('#setting-own-email','a..b@example.de');await p.locator('#setting-own-email').press('Tab');
    check('EigeneAdresse: Altwertschutz beiPunktfehler',await p.evaluate(()=>state.settings.ownEmail),'alt@example.de');
    for(const mode of ['employee','freelance']){
      await p.evaluate(mode=>{
        document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
        state.settings.appMode=mode;state.employers=[];state.entries=[];state.activeEmployerId=null;
        saveState();renderSettings();switchView('employers');
        document.getElementById('btn-add-employer').click();
      },mode);
      await p.fill('#employer-name','Regel-Test');
      await p.fill('#employer-contact1-email','a..b@example.de');
      await p.click('#form-employer button[type=submit]');
      check(`${mode}: neuerFehler blockiert`,await p.evaluate(()=>state.employers.length),0);
      check(`${mode}: ersterKlick fokussiert`,await p.evaluate(()=>document.activeElement.id),'employer-contact1-email');
      await p.fill('#employer-contact1-email',"o'connor+arbeit@example.de");
      await p.click('#form-employer button[type=submit]');
      check(`${mode}: Sonderzeichen gespeichert`,await p.evaluate(()=>state.employers[0]?.contacts[0].email),"o'connor+arbeit@example.de");
    }
    await p.evaluate(async()=>{
      const {openShareModal,openOverviewShareModal,shareReport}=await import('/modules/share.js');
      const probe=window.__rulesProbe={effects:0,toasts:[]};
      const employer={name:'Beispiel',contacts:[]};
      const ctx={
        getState:()=>({settings:{ownEmail:'.alt@example.de'}}),
        getCurrentReport:()=>({employer,ym:'2026-10',workedMin:60,targetMin:60,balance:0,vacationEntries:[],sickEntries:[]}),
        getCurrentOverview:()=>({ym:'2026-10',rows:[{employer}]}),
        fileNameForReport:()=> 'test.pdf',fileNameForOverview:()=> 'test.pdf',
        formatMonthYear:()=> 'Oktober2026',renderSummaryPlaintext:()=> [],
        getSummaryFields:()=> [],getOverviewSummaryFields:()=> [],
        generatePdfBlob:()=>{probe.effects++;throw Error('UngültigerEmpfänger');},
        generateOverviewPdfBlob:()=>{probe.effects++;throw Error('UngültigerEmpfänger');},
        downloadBlob:()=>{probe.effects++;},toast:t=>probe.toasts.push(t),
        escapeHtml:t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        closeModals:()=>document.getElementById('modal-share').classList.add('hidden')
      };
      probe.open=mode=>mode==='report'?openShareModal(ctx):openOverviewShareModal(ctx);
      probe.direct=emails=>shareReport('pdf',emails,ctx);
    });
    for(const mode of ['report','overview']){
      await p.evaluate(mode=>__rulesProbe.open(mode),mode);
      await p.fill('#share-manual-emails','gut@example.de; name.@example.de');
      await p.click('#share-send-btn');
      check(`${mode}: manuellerPunktfehler fokussiert`,await p.evaluate(()=>document.activeElement.id),'share-manual-emails');
      check(`${mode}: noch keinExport`,await p.evaluate(()=>__rulesProbe.effects),0);
      await p.fill('#share-manual-emails','');
      await p.check('#share-recipient-0');await p.click('#share-send-btn');
      check(`${mode}: Altadresse blockiert`,await p.evaluate(()=>document.activeElement.id),'share-recipient-0');
      await p.locator('#modal-share .modal-close').click();
    }
    for(const value of ['a..b@example.de','a@example.de\n','a@example.de\r']){
      await p.evaluate(value=>__rulesProbe.direct([value]),value);
      check(`Direktaufruf blockiert ${JSON.stringify(value)}`,await p.evaluate(()=>__rulesProbe.effects),0);
    }
    await p.close();
  }finally{await context.close();}
}
