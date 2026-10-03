// v3.9.93: Native Formularprüfung mit echten Klicks und Touch-Taps.
// Separate Kontexte verhindern Änderungen am Zustand anderer Regressionstests.
export async function runEmploymentFormValidationTests(browser, base, { assertEq }) {
  console.log('\n=== Arbeitszeitmodell: ausgeblendete Felder und native Validierung ===');
    for(const touch of [false,true]) {
      const context=await browser.newContext({
        viewport:{width:touch?390:1280,height:touch?844:900},
        isMobile:touch,hasTouch:touch,serviceWorkers:'block'
      });
      try {
      const p=await context.newPage(); p.setDefaultTimeout(10000);
      const errors=[]; p.on('pageerror',e=>errors.push(e.message));
      const check=(name,actual,expected)=>{
        assertEq(`FORM ${touch?'touch':'desktop'}: ${name}`,
          JSON.stringify(actual), JSON.stringify(expected));
      };
      await p.goto(base); await p.waitForFunction(()=>typeof state!=='undefined');
      const inspect=()=>p.locator('#employer-parttime-percent').evaluate(e=>({
        value:e.value,validate:e.willValidate,visible:!!e.getClientRects().length
      }));
      async function fresh(mode='employee',scope='vollzeit'){
        await p.evaluate(mode=>{
          document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
          state.settings.appMode=mode;state.employers=[];state.entries=[];state.activeEmployerId=null;
          saveState();renderSettings();switchView('employers');
          document.getElementById('btn-add-employer').click();
        },mode);
        await p.fill('#employer-name','Beispielfirma');
        if(mode==='employee')await p.selectOption('#employer-employment-scope',scope);
      }
      async function save(){
        const button=p.locator('#form-employer button[type=submit]');
        if(touch)await button.tap();else await button.click();
      }
      async function edit(){
        await p.locator('.employer-card').first().click();
      }
      for(const scope of ['vollzeit','minijob','midijob','client']){
        await fresh(scope==='client'?'freelance':'employee',scope==='client'?'vollzeit':scope);
        check(`${scope}: unveränderter Default100 ist ausgeblendet und prüfungsfrei`,
          await inspect(),{value:'100',validate:false,visible:false});
        await save();
        check(`${scope}: erster echter Klick speichert`,await p.evaluate(()=>state.employers.length),1);
        check(`${scope}: 100 bleibt gespeichert`,await p.evaluate(()=>state.employers[0].parttimePercent),100);
        check(`${scope}: Wochenstunden unverändert`,await p.evaluate(()=>state.employers[0].weeklyHours),scope==='client'?0:40);
        const saved=await p.evaluate(()=>JSON.stringify(state.employers[0]));
        await edit(); await save();
        check(`${scope}: Bearbeiten/Speichern ohne Änderung ist verlustfrei`,
          await p.evaluate(()=>JSON.stringify(state.employers[0])),saved);
      }
      await fresh('employee','teilzeit');
      check('Teilzeit: Default100 wird sichtbar wieder geprüft',
        await inspect(),{value:'100',validate:true,visible:true});
      await save();
      check('Teilzeit100: Speichern gesperrt',await p.evaluate(()=>state.employers.length),0);
      check('Teilzeit100: native Prüfung fokussiert sichtbares Feld',
        await p.evaluate(()=>document.activeElement.id),'employer-parttime-percent');
      for(const bad of ['0','101','60.5']){
        await p.fill('#employer-parttime-percent',bad);
        await save();
        check(`Teilzeit${bad}: außerhalb Grenze/Schritt gesperrt`,await p.evaluate(()=>state.employers.length),0);
      }
      await p.fill('#employer-parttime-percent','60');
      check('Teilzeit60: bestehende Stundenkopplung40h→24h',
        await p.inputValue('#employer-weekly-hours'),'24');
      await save();
      check('Teilzeit60: gültiger Wert gespeichert',
        await p.evaluate(()=>[state.employers.length,state.employers[0]?.parttimePercent,state.employers[0]?.weeklyHours]),[1,60,24]);
      await edit();
      check('Teilzeit: Wiederöffnung reaktiviert Eingabe', (await inspect()).validate,true);
      await p.selectOption('#employer-employment-scope','vollzeit');
      check('Teilzeit→Vollzeit: nur deaktiviert, Wert/Stunden nicht verändert',
        await p.evaluate(()=>[document.getElementById('employer-parttime-percent').value,
          document.getElementById('employer-parttime-percent').willValidate,
          document.getElementById('employer-weekly-hours').value]),['60',false,'24']);
      await p.selectOption('#employer-employment-scope','teilzeit');
      check('Zurück zu Teilzeit: 60 wieder aktiv',await inspect(),{value:'60',validate:true,visible:true});
      for(const good of ['1','99']){
        await fresh('employee','teilzeit');
        await p.fill('#employer-parttime-percent',good);await save();
        check(`Teilzeit${good}: gültige Grenze speicherbar`,
          await p.evaluate(()=>state.employers[0]?.parttimePercent),Number(good));
      }
      await fresh();
      await p.fill('#employer-fulltime-reference','0.5');
      await save();
      check('Vollzeit: sichtbare ungültige Referenz blockiert weiterhin',await p.evaluate(()=>state.employers.length),0);
      await p.selectOption('#employer-employment-scope','minijob');
      check('Minijob: ausgeblendete Referenz ist deaktiviert',
        await p.locator('#employer-fulltime-reference').evaluate(e=>e.willValidate),false);
      await save();
      check('Minijob: Speichern trotz irrelevanter Referenz möglich',await p.evaluate(()=>state.employers.length),1);
      await edit();await p.selectOption('#employer-employment-scope','vollzeit');
      check('Minijob→Vollzeit: Referenzprüfung wieder aktiv',
        await p.locator('#employer-fulltime-reference').evaluate(e=>e.willValidate&&!e.validity.valid),true);

      await fresh('freelance');
      // Importierter Kundendatensatz: Auch ein aktives Teilzeit-Kindfeld muss
      // durch das deaktivierte, unsichtbare Gesamt-Fieldset ausgenommen sein.
      await p.evaluate(()=>{
        state.employers=[{id:'imported-client',kind:'client',name:'Altkunde',color:'#3b82f6',
          hoursMode:'week',weeklyHours:0,monthlyHours:0,yearlyHours:0,
          employmentScope:'teilzeit',parttimePercent:100,fullTimeReferenceHours:0.5,
          workTimeModel:'klassisch',contacts:[],schedule:{}}];
        saveState();document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
        renderEmployers();
      });
      await edit();
      check('Altkunde: Teilzeit100 unsichtbar und prüfungsfrei',
        await inspect(),{value:'100',validate:false,visible:false});
      await save();
      check('Altkunde: Importwerte nicht automatisch korrigiert',
        await p.evaluate(()=>[state.employers[0].parttimePercent,state.employers[0].fullTimeReferenceHours]),[100,0.5]);
      await fresh('employee','teilzeit');
      check('Kunde→Arbeitgeber: Gesamt-Fieldset wieder aktiv',
        await p.locator('#fs-employer-employment-model').evaluate(e=>!e.disabled&&!e.classList.contains('hidden')),true);

      for(const mode of ['employee','freelance']){
        await fresh(mode);
        await p.fill('#employer-name','');await save();
        check(`${mode}: Pflichtname bleibt geprüft`,await p.evaluate(()=>state.employers.length),0);
        await p.fill('#employer-name','Beispielfirma');
        await p.fill('#employer-contact1-email','ungueltig@');await save();
        check(`${mode}: E-Mail blockiert ohne Prozent60-Workaround`,await p.evaluate(()=>state.employers.length),0);
        check(`${mode}: E-Mail erhält ersten Fehlerfokus`,await p.evaluate(()=>document.activeElement.id),'employer-contact1-email');
        await p.fill('#employer-contact1-email','buero@example.de');await save();
        check(`${mode}: gültige E-Mail + Originaldefault speichern`,await p.evaluate(()=>state.employers.length),1);
      }
      check('Keine unbehandelten Browserfehler',errors,[]);
      } finally {
      await context.close();
      }
    }
}
