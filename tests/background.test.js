// background.js glue: toolbar click must inject the three scripts into the
// CLICKED tab only, then send VFH_TOGGLE; errors (chrome:// pages) are quiet.
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }

const calls = { injected: null, messages: [], lastError: null };
global.chrome = {
    action: { onClicked: { addListener(fn) { this._fn = fn; } } },
    scripting: {
        executeScript(opts, cb) {
            calls.injected = opts;
            if (cb) cb();
        }
    },
    tabs: { sendMessage(tabId, msg) { calls.messages.push({ tabId, msg }); } },
    runtime: { get lastError() { return calls.lastError; } }
};
require(__dirname + '/../background.js');
const fn = chrome.action.onClicked._fn;
check('listener registered', typeof fn === 'function');

fn({ id: 42, url: 'https://example.com' });
check('injects into the clicked tab', calls.injected && calls.injected.target.tabId === 42);
check('injects parser, matcher, content in order', JSON.stringify(calls.injected.files) === '["parser.js","matcher.js","content.js"]');
check('sends VFH_TOGGLE to that tab', calls.messages.length === 1 && calls.messages[0].tabId === 42 && calls.messages[0].msg.type === 'VFH_TOGGLE');

calls.injected = null; calls.messages = [];
fn(null); fn({});
check('missing tab id is a safe no-op', calls.injected === null && calls.messages.length === 0);

calls.messages = []; calls.lastError = { message: 'Cannot access a chrome:// URL' };
fn({ id: 7 });
check('injection failure stays quiet (no message sent)', calls.messages.length === 0);
calls.lastError = null;

// manifest wiring: the SW the browser loads is the file we tested, the
// shortcut command exists, and permissions stay minimal.
const fs = require('fs');
const man = JSON.parse(fs.readFileSync(__dirname + '/../manifest.json', 'utf8'));
check('manifest MV3', man.manifest_version === 3);
check('background points at background.js', man.background && man.background.service_worker === 'background.js' && fs.existsSync(__dirname + '/../background.js'));
check('permissions stay activeTab + scripting only', JSON.stringify(man.permissions.slice().sort()) === '["activeTab","scripting"]');
check('Alt+Shift+B command wired to the action', !!(man.commands && man.commands._execute_action && /Alt\+Shift\+B/.test(man.commands._execute_action.suggested_key.default)));
check('action title present', !!man.action.default_title);

console.log('BACKGROUND: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
