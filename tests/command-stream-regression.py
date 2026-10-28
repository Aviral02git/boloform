from playwright.sync_api import sync_playwright
import threading,http.server,os,json
from pathlib import Path
os.chdir(Path(__file__).resolve().parents[1])
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),Quiet);threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox']);page=browser.new_page();results={}
 for suite in ['features','stress','snitch','amazon','ajio']:
  page.goto('http://127.0.0.1:8765/tests/'+suite+'-replica.html');page.wait_for_function('document.title === "PASS" || document.title === "FAIL"');txt=page.locator('#results').inner_text();print(suite,txt[-120:]);assert page.title()=='PASS',txt;results[suite]=txt
 page.goto('http://127.0.0.1:8765/demo-form.html')
 for f in ['parser.js','matcher.js','content.js']:page.add_script_tag(url='http://127.0.0.1:8765/'+f)
 page.evaluate("window.dispatchEvent(new Event('vfh:toggle'))")
 out=page.evaluate('''async()=>{
 let sh=window.__vfhShadow,ta=sh.querySelector('textarea'),fill=sh.querySelector('button.vfh-primary'),name=document.querySelector('#full-name'),checks=[];
 const check=(ok,s)=>{checks.push({ok,s});if(!ok)throw Error(s)};
 const set=(s)=>{ta.value=s;ta.dispatchEvent(new Event('input',{bubbles:true}))};
 const enter=(opts={})=>ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,...opts}));
 const setup=()=>{set('name Rahul Sharma');fill.click()};
 setup();
 for(let s of [' s',' sa',' sah',' sahi',' sahi h',' sahi hai',' sahi hai.']){set('name Rahul Sharma'+s);check(name.value==='', 'no write on partial '+s)}
 await new Promise(r=>setTimeout(r,2200));check(name.value==='', 'even a long pause does not confirm');
 set('name Rahul Sharma sahi hai kya');enter();check(name.value==='', 'extended phrase and Enter never confirm');
 setup();set('name Rahul Sharma sahi hai');enter({isComposing:true});check(name.value==='', 'composition Enter ignored');enter({repeat:true});check(name.value==='', 'repeat Enter ignored');enter({shiftKey:true});check(name.value==='', 'Shift Enter ignored');enter();check(name.value==='Rahul Sharma', 'explicit Enter confirms');
 set('wapas');check(name.value==='Rahul Sharma','undo text alone does not undo');enter();check(name.value==='', 'explicit Enter undoes');
 setup();set('name Rahul Sharma cancel');check(!!sh.querySelector('.vfh-plan-h'),'cancel text alone preserves preview');enter();check(!sh.querySelector('.vfh-plan-h'),'Enter cancels');check(name.value==='', 'cancel writes nothing');
 setup();set('name Rahul Sharma okay');check(name.value==='', 'bulk ready command writes nothing');enter();check(name.value==='Rahul Sharma','bulk command plus Enter confirms');
 return checks;
}''')
 results['streaming-regression']=out;print('STREAMING',len(out),'passed');open('/tmp/boloform-v032-test-results.json','w').write(json.dumps(results,indent=2));browser.close();server.shutdown();server.server_close()
