/* Voice Form Helper - floating capture panel.
   Wispr Flow types into this panel's textarea like any other focused field.
   "Form bharo" shows a preview of the field/value mapping first; nothing is
   written to the page until you confirm with "Sahi hai, bharo". */
(function () {
    if (window.__vfhLoaded) return;
    window.__vfhLoaded = true;

    var VFH_VERSION = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
        ? chrome.runtime.getManifest().version : '0.3.2';
    var host = null;
    var pendingPick = null;
    var panelShadow = null; // closed shadow: page scripts cannot read the transcript

    // Spoken commands while a preview is open / after a fill. Wispr adds
    // punctuation and capitals, so normalize before matching.
    function normCmd(s) { return s.toLowerCase().replace(/[.,!?;:\u0964]/g, ' ').replace(/\s+/g, ' ').trim(); }
    var YES_WORDS = ['sahi hai', 'sahi', 'theek hai', 'thik hai', 'thik', 'haan', 'han', 'ha', 'ok', 'okay', 'done', 'confirm'];
    var NO_WORDS = ['cancel', 'ruko', 'nahi', 'nahin', 'nhi', 'nope', 'stop', 'mat karo', 'rehne do'];
    var YES_RE = new RegExp('^(' + YES_WORDS.join('|').replace(/ /g, '\\s') + ')$');
    var NO_RE = new RegExp('^(' + NO_WORDS.join('|').replace(/ /g, '\\s') + ')$');
    // "bhar do"/"kar do" jaise words narration ka natural hissa hote hain, isliye
    // confirm command nahi hain - warna "name me Rahul bhar do" ko aakhri word
    // se plan lagta.
    function isCmdPrefix(cmd) {
        var all = YES_WORDS.concat(NO_WORDS);
        for (var i = 0; i < all.length; i++) if (all[i].indexOf(cmd) === 0) return true;
        return false;
    }
    var UNDO_RE = /^(wapas|undo|wapas karo|wapas kar do|purana)$/;
    var NEXT_RE = /^(agla|agla step|next|aage|next step)$/;

    var CSS = ''
        + '.vfh-panel{position:fixed;bottom:16px;right:16px;width:340px;max-height:72vh;overflow-y:auto;'
        + 'background:#ffffff;color:#251f21;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.28);'
        + 'font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;z-index:2147483647;padding:14px 14px 12px;}'
        + '.vfh-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}'
        + '.vfh-title{font-weight:600;font-size:15px;}'
        + '.vfh-ver{font-weight:400;font-size:11px;color:#8a8384;margin-left:6px;}'
        + '.vfh-close{border:0;background:transparent;font-size:16px;cursor:pointer;color:#585254;padding:4px 8px;}'
        + '.vfh-hint{color:#585254;font-size:12px;margin:0 0 8px;}'
        + 'textarea{width:100%;box-sizing:border-box;min-height:74px;resize:vertical;border:1px solid #d9d5d4;'
        + 'border-radius:8px;padding:8px;font:13px/1.4 inherit;font-family:inherit;}'
        + 'textarea:focus{outline:2px solid #73a89a;border-color:#73a89a;}'
        + '.vfh-row{display:flex;gap:8px;margin-top:8px;}'
        + 'button.vfh-primary{flex:1;background:#2f7a67;color:#fff;border:0;border-radius:8px;padding:9px 10px;'
        + 'font-weight:600;cursor:pointer;font-size:13px;}'
        + 'button.vfh-ghost{background:transparent;color:#2f7a67;border:1px solid #2f7a67;border-radius:8px;'
        + 'padding:9px 10px;cursor:pointer;font-size:13px;}'
        + '.vfh-results{margin-top:10px;font-size:13px;}'
        + '.vfh-results div{padding:5px 0;border-top:1px solid #efedec;}'
        + '.vfh-ok{color:#2f7a67;}.vfh-ask{color:#9a6a00;}.vfh-warn{color:#b3261e;}.vfh-skip{color:#585254;}'
        + '.vfh-plan-h{color:#251f21;font-weight:600;font-size:13px;margin:10px 0 0;padding:0;border-top:none !important;}'
        + '.vfh-pick{margin-left:8px;background:transparent;color:#2f7a67;border:1px solid #2f7a67;border-radius:6px;'
        + 'padding:2px 8px;cursor:pointer;font-size:12px;white-space:nowrap;}'
        + '.vfh-pick:hover{background:#eef6f3;}'
        + '.vfh-old{color:#8a8384;font-size:12px;}'
        + '.vfh-note{margin-top:10px;font-size:11px;color:#585254;}';

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // Manual fallback: user picks the page field for one unmatched value.
    function addPickButton(row, item) {
        var b = el('button', 'vfh-pick', 'Field chuno');
        b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            pendingPick = item;
            row.appendChild(el('span', 'vfh-old', ' \u2190 ab page pe us field pe click karo jahan "' + item.value + '" bharna hai.'));
            b.disabled = true;
        });
        row.appendChild(b);
    }

    document.addEventListener('click', function (ev) {
        if (!pendingPick) return;
        var t = ev.target;
        if (t && t.id === 'vfh-host') return; // clicks on the panel itself
        var field = t && t.closest ? t.closest('input,textarea,select') : null;
        if (!field) return;
        ev.preventDefault();
        ev.stopPropagation();
        var item = pendingPick;
        pendingPick = null;
        var res = window.VFHMatcher.fillElement(field, item.value);
        var out = panelShadow ? panelShadow.querySelector('.vfh-results') : null;
        if (!out) return;
        if (res.ok) {
            var line = el('div', 'vfh-ok', '\u2713 ' + item.label + ' \u2192 tumhare chune field me bhara: ' + item.value);
            if (res.oldValue) line.appendChild(el('span', 'vfh-old', ' (pehle: ' + res.oldValue + ')'));
            out.appendChild(line);
        } else {
            out.appendChild(el('div', 'vfh-warn', '\u2013 ' + item.label + ': ' + res.reason + '. Kuch nahi badla.'));
        }
    }, true);

    // PREVIEW: show the planned mapping. No page field is written here.
    function renderPreview(container, plan, onConfirm, onCancel) {
        container.textContent = '';
        container.appendChild(el('div', 'vfh-plan-h', 'Ye mapping check karo - abhi kuch bhara nahi gaya:'));
        var actionable = 0;
        plan.items.forEach(function (it) {
            if (it.status === 'write') {
                actionable++;
                var line = el('div', 'vfh-ok', '\u2022 ' + it.label + ' \u2192 "' + it.fieldLabel + '" me jayega: ' + it.value);
                if (it.oldValue) line.appendChild(el('span', 'vfh-old', ' (pehle: ' + it.oldValue + ')'));
                container.appendChild(line);
            } else if (it.status === 'locked') {
                container.appendChild(el('div', 'vfh-skip', '\u2013 ' + it.label + ': "' + it.fieldLabel + '" locked hai (site khud bharti hai), skip.'));
            } else {
                actionable++;
                var row = el('div', 'vfh-warn', '\u2013 "' + it.label + '" jaisa field is page pe apne aap nahi mila.');
                if (it.value) addPickButton(row, { key: it.key, label: it.label, value: it.value });
                container.appendChild(row);
            }
        });
        plan.asks.forEach(function (a) {
            var row = el('div', 'vfh-ask', '? ' + a.question);
            if (a.value) { addPickButton(row, { key: a.key, label: a.label, value: a.value }); actionable++; }
            container.appendChild(row);
        });
        if (!actionable) {
            container.appendChild(el('div', 'vfh-warn', 'Kuch samajh nahi aaya. Field ka naam bata ke bolna, jaise "name field me Rahul bhar do".'));
            return;
        }
        var row = el('div', 'vfh-row');
        if (plan.hasWrites) {
            var ok = el('button', 'vfh-primary', 'Sahi hai, bharo');
            ok.addEventListener('click', onConfirm);
            row.appendChild(ok);
        }
        var cancel = el('button', 'vfh-ghost', 'Cancel');
        cancel.addEventListener('click', onCancel);
        row.appendChild(cancel);
        container.appendChild(row);
    }

    // RESULTS after the user-approved write.
    function renderResults(container, report) {
        container.textContent = '';
        if (!report.filled.length && !report.asks.length && !report.notFound.length && !report.locked.length) {
            container.appendChild(el('div', 'vfh-warn', 'Kuch nahi bhara gaya.'));
            return;
        }
        report.filled.forEach(function (f) {
            var line = el('div', 'vfh-ok', '\u2713 ' + f.label + ' \u2192 "' + f.fieldLabel + '" me bhara: ' + f.value);
            if (f.oldValue) line.appendChild(el('span', 'vfh-old', ' (pehle: ' + f.oldValue + ')'));
            container.appendChild(line);
        });
        report.locked.forEach(function (f) {
            container.appendChild(el('div', 'vfh-skip', '\u2013 ' + f.label + ': ye field locked hai (site khud bharti hai), skip kiya.'));
        });
        report.asks.forEach(function (a) {
            var row = el('div', 'vfh-ask', '? ' + a.question);
            if (a.value) addPickButton(row, { key: a.key, label: a.label, value: a.value });
            container.appendChild(row);
        });
        report.notFound.forEach(function (f) {
            var row = el('div', 'vfh-warn', '\u2013 "' + f.label + '" jaisa field is page pe apne aap nahi mila.');
            if (f.value) addPickButton(row, { key: f.key, label: f.label, value: f.value });
            container.appendChild(row);
        });
    }

    function togglePanel() {
        if (host) { host.remove(); host = null; return; }
        host = document.createElement('div');
        host.id = 'vfh-host';
        // Top layer (Popover API): a site modal - native <dialog> inert or a JS
        // focus trap - must not make this panel unclickable/untypeable. Manual
        // popover escapes inert without touching the site's modal at all.
        host.setAttribute('popover', 'manual');
        // Reset popover UA styles; placement comes from .vfh-panel's fixed CSS.
        host.style.padding = '0';
        host.style.border = 'none';
        host.style.margin = '0';
        host.style.background = 'transparent';
        host.style.maxWidth = 'none';
        host.style.maxHeight = 'none';
        host.style.overflow = 'visible';
        // Shield panel events from the page's document-level handlers: modal
        // focus traps (focusin refocus), outside-click closers and key handlers
        // must never see interaction with this panel. Our own Field-chuno
        // listener is capture-phase, so it is unaffected.
        ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick',
         'focusin', 'focusout', 'input', 'beforeinput'].forEach(function (type) {
            host.addEventListener(type, function (e) { e.stopPropagation(); }, false);
        });
        var shadow = host.attachShadow({ mode: 'closed' }); // transcript page scripts se chhupa rahe
        panelShadow = shadow;
        window.__vfhShadow = shadow; // isolated-world handle; test pages read this
        var style = document.createElement('style');
        style.textContent = CSS;
        var panel = el('div', 'vfh-panel');

        var head = el('div', 'vfh-head');
        var title = el('span', 'vfh-title', 'BoloForm');
        title.appendChild(el('span', 'vfh-ver', 'v' + VFH_VERSION));
        head.appendChild(title);
        var close = el('button', 'vfh-close', '\u2715');
        close.addEventListener('click', togglePanel);
        head.appendChild(close);
        panel.appendChild(head);

        panel.appendChild(el('p', 'vfh-hint',
            'Box pe click karo, Wispr ka button (Fn / Ctrl+Win) dabaa ke bolo - ek se zyada fields, kisi bhi order me. Ya type karo. Preview ke baad "sahi hai" likho/bolo, phir Enter dabao ya confirm button dabao. Commands khud se apply nahi hote. "cancel", "wapas" (undo), "agla" (next step) bhi Enter ke baad.'));

        var ta = document.createElement('textarea');
        ta.setAttribute('placeholder', 'Jaise: "name field me Rahul Sharma bhar do, janm tithi 21/11/2001, phone 9876543210"');
        panel.appendChild(ta);

        var row = el('div', 'vfh-row');
        var fillBtn = el('button', 'vfh-primary', 'Form bharo');
        var clearBtn = el('button', 'vfh-ghost', 'Highlights hatao');
        row.appendChild(fillBtn);
        row.appendChild(clearBtn);
        panel.appendChild(row);

        var results = el('div', 'vfh-results');
        panel.appendChild(results);
        panel.appendChild(el('p', 'vfh-note',
            'Pehle mapping ka preview dikhega; "Sahi hai, bharo" dabane ke baad hi page pe kuch likha jayega. Ye extension kuch submit nahi karta - khud review karke submit karna.'));

        var currentPlan = null;
        var previewSnapshot = null; // ta.value jab preview khula - iske baad ka text voice command hai
        var lastUndo = null;
        var autoTimer = null;
        var autoChk = null;

        // Obvious "next step" buttons only - kabhi bhi Submit/Save/Pay nahi.
        // Text denylist akela proof nahi: submit-type controls hamesha skip,
        // aur 1 se zyada match = unsure = skip (khud dabana padta hai).
        var NEXT_BAD = /submit|save|pay|payment|order|place|confirm|jama|bhugtan|complete|finish|done|book|buy|checkout|purchase|review/i;
        var NEXT_GOOD = /^(next|continue|proceed|agla|aage|\u0906\u0917\u0947|\u0905\u0917\u0932\u093e)(\s*(step|kadam|\u0915\u0926\u092e))?\s*$/i;
        function findNextButton() {
            var btns = document.querySelectorAll('button, [role="button"], input[type="button"], a');
            var found = [];
            for (var i = 0; i < btns.length; i++) {
                var b = btns[i];
                if (b.closest('#vfh-host')) continue;
                if (b.tagName === 'INPUT') {
                    if ((b.type || '').toLowerCase() !== 'button') continue;
                } else if (b.tagName === 'BUTTON') {
                    var bt = b.getAttribute('type');
                    if (bt) { if (bt.toLowerCase() !== 'button') continue; }
                    else if (b.form) continue; // default type=submit with a form owner
                }
                var t = ((b.textContent || '') + ' ' + (b.value || '') + ' ' + (b.getAttribute('aria-label') || '')).trim();
                var r = b.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                if (NEXT_BAD.test(t)) continue;
                if (NEXT_GOOD.test(t)) found.push(b);
            }
            return found.length === 1 ? found[0] : null; // 0 ya 2+ = offer nahi
        }

        function doUndo() {
            if (!lastUndo || !lastUndo.length) return;
            var res = window.VFHMatcher.undoLastApply(lastUndo);
            lastUndo = null;
            ta.value = '';
            var msg = '\u21a9 ' + res.restored + fieldN(res.restored) + ' wapas pichhli value pe lautaya.';
            if (res.kept) msg += ' ' + res.kept + fieldN(res.kept) + ' fill ke baad tumne khud badla tha - use nahi chheda.';
            results.appendChild(el('div', 'vfh-skip', msg));
        }
        function fieldN(n) { return n === 1 ? ' field' : ' fields'; }

        function afterApply(report) {
            lastUndo = report.undo && report.undo.length ? report.undo : null;
            if (lastUndo) {
                var urow = el('div', 'vfh-row');
                var ub = el('button', 'vfh-ghost', '\u21a9 Sab wapas karo (undo)');
                ub.addEventListener('click', doUndo);
                urow.appendChild(ub);
                results.appendChild(urow);
            }
            var nb = findNextButton();
            if (nb) {
                var nrow = el('div', 'vfh-row');
                var nbtn = el('button', 'vfh-ghost', 'Agla step dabao \u2192 ("' + ((nb.textContent || nb.value || '').trim()) + '")');
                nbtn.addEventListener('click', function () {
                    nb.click();
                    ta.value = '';
                    ta.focus();
                    results.appendChild(el('div', 'vfh-skip', 'Agla step khul gaya - us hisse ki details ab bol do. Last step ka Submit khud review karke dabana, BoloForm kabhi submit nahi karta.'));
                    nbtn.disabled = true;
                });
                nrow.appendChild(nbtn);
                results.appendChild(nrow);
            }
        }

        function doConfirm() {
            if (!currentPlan) return;
            var report = window.VFHMatcher.applyPlan(currentPlan);
            currentPlan = null;
            previewSnapshot = null;
            ta.value = '';
            renderResults(results, report);
            afterApply(report);
        }
        function doCancel() {
            if (!currentPlan) return;
            currentPlan = null;
            ta.value = previewSnapshot !== null ? previewSnapshot : ta.value; // voice command ka text hatao
            previewSnapshot = null;
            results.textContent = '';
            results.appendChild(el('div', 'vfh-skip', 'Cancel kiya - page pe kuch nahi badla. Text box me transcript abhi bhi hai; badal ke dobara "Form bharo" dabao.'));
        }

        fillBtn.addEventListener('click', function () {
            var text = ta.value.trim();
            if (!text) {
                results.textContent = '';
                results.appendChild(el('div', 'vfh-warn', 'Pehle box me dictate ya type karo.'));
                return;
            }
            currentPlan = window.VFHMatcher.planFromTranscript(text, document);
            previewSnapshot = ta.value;
            renderPreview(results, currentPlan, doConfirm, doCancel);
        });
        clearBtn.addEventListener('click', function () {
            window.VFHMatcher.clearHighlights(document);
        });

        // Voice commands + optional auto-preview. Wispr caret pe type karta hai,
        // isliye preview ke waqt ka snapshot ke BAAD ka text hi command maana.
        // Transcript badalte hi purana preview stale ho jata hai - plan tabhi
        // apply hota hai jab woh isi transcript ka ho.
        function invalidatePreview(note) {
            currentPlan = null;
            previewSnapshot = null;
            results.textContent = '';
            results.appendChild(el('div', 'vfh-skip', note || 'Transcript badal gaya - purana preview radd kiya. Naye transcript ke liye "Form bharo" dabao.'));
        }

        ta.addEventListener('input', function () {
            if (currentPlan && previewSnapshot !== null) {
                if (!ta.value.startsWith(previewSnapshot)) { invalidatePreview(); return; } // beech ka text badla
                var cmd = normCmd(ta.value.slice(previewSnapshot.length));
                if (!cmd) return;
                if (YES_RE.test(cmd) || NO_RE.test(cmd)) return; // ready only; Enter/button is the explicit boundary
                if (isCmdPrefix(cmd)) return; // utterance abhi aadhi hai, wait
                invalidatePreview(); // naya narration aaya - purana plan stale
            } else if (!currentPlan) {
                var whole = normCmd(ta.value);
                if (UNDO_RE.test(whole) || NEXT_RE.test(whole)) return; // wait for explicit Enter
                if (autoChk && autoChk.checked && ta.value.trim()) {
                    clearTimeout(autoTimer);
                    autoTimer = setTimeout(function () {
                        if (!currentPlan && ta.value.trim()) fillBtn.click();
                    }, 1500);
                }
            }
        });

        // Input timing is not an utterance boundary. Even a long pause can be
        // followed by more words. Only a deliberate Enter or visible button may
        // commit a command; IME composition and repeated keys never commit it.
        ta.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing || ev.repeat) return;
            ev.preventDefault();
            clearTimeout(autoTimer);
            if (currentPlan && previewSnapshot !== null) {
                if (!ta.value.startsWith(previewSnapshot)) { invalidatePreview(); return; }
                var cmd = normCmd(ta.value.slice(previewSnapshot.length));
                if (YES_RE.test(cmd)) { doConfirm(); return; }
                if (NO_RE.test(cmd)) { doCancel(); return; }
                if (cmd) invalidatePreview();
            } else {
                var whole = normCmd(ta.value);
                if (UNDO_RE.test(whole) && lastUndo && lastUndo.length) { doUndo(); return; }
                if (NEXT_RE.test(whole)) { ta.value = ''; ta.focus(); }
            }
        });

        // Auto preview toggle: 1.5s kuch na bolo to plan apne aap (writes phir bhi
        // sirf "sahi hai" + Enter / button ke baad).
        var autoRow = el('label', 'vfh-old', '');
        autoRow.style.display = 'block';
        autoRow.style.marginTop = '8px';
        autoChk = document.createElement('input');
        autoChk.type = 'checkbox';
        autoRow.appendChild(autoChk);
        autoRow.appendChild(document.createTextNode(' Auto preview: 1.5s rukte hi mapping dikhao'));
        panel.appendChild(autoRow);

        shadow.appendChild(style);
        shadow.appendChild(panel);
        // If a NATIVE modal <dialog> is open, the whole document behind it is
        // inert - even popovers can stay blocked in some builds. Mounting inside
        // the dialog keeps the panel live; the top layer keeps it on top.
        var mount = document.documentElement;
        try {
            var openDlg = document.querySelector('dialog:modal');
            if (openDlg) mount = openDlg;
        } catch (e) { /* :modal unsupported - documentElement mount still works */ }
        mount.appendChild(host);
        if (host.showPopover) {
            try { host.showPopover(); } catch (e) { /* older Chrome: plain fixed panel still works */ }
        }
        ta.focus();
    }

    window.addEventListener('vfh:toggle', togglePanel);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(function (msg) {
            if (msg && msg.type === 'VFH_TOGGLE') togglePanel();
        });
    }
})();
