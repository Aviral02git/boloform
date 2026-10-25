/* Voice Form Helper - floating capture panel.
   Wispr Flow types into this panel's textarea like any other focused field.
   "Form bharo" shows a preview of the field/value mapping first; nothing is
   written to the page until you confirm with "Sahi hai, bharo". */
(function () {
    if (window.__vfhLoaded) return;
    window.__vfhLoaded = true;

    var VFH_VERSION = '0.2.0';
    var host = null;
    var pendingPick = null;

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
        var out = host && host.shadowRoot ? host.shadowRoot.querySelector('.vfh-results') : null;
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
        var shadow = host.attachShadow({ mode: 'open' });
        var style = document.createElement('style');
        style.textContent = CSS;
        var panel = el('div', 'vfh-panel');

        var head = el('div', 'vfh-head');
        var title = el('span', 'vfh-title', 'Voice Form Helper');
        title.appendChild(el('span', 'vfh-ver', 'v' + VFH_VERSION));
        head.appendChild(title);
        var close = el('button', 'vfh-close', '\u2715');
        close.addEventListener('click', togglePanel);
        head.appendChild(close);
        panel.appendChild(head);

        panel.appendChild(el('p', 'vfh-hint',
            'Box pe click karo, Wispr ka button (Fn / Ctrl+Win) dabaa ke bolo - ek se zyada fields, kisi bhi order me. Ya type karo.'));

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
        fillBtn.addEventListener('click', function () {
            var text = ta.value.trim();
            if (!text) {
                results.textContent = '';
                results.appendChild(el('div', 'vfh-warn', 'Pehle box me dictate ya type karo.'));
                return;
            }
            currentPlan = window.VFHMatcher.planFromTranscript(text, document);
            renderPreview(results, currentPlan, function () {
                var report = window.VFHMatcher.applyPlan(currentPlan);
                currentPlan = null;
                renderResults(results, report);
            }, function () {
                currentPlan = null;
                results.textContent = '';
                results.appendChild(el('div', 'vfh-skip', 'Cancel kiya - page pe kuch nahi badla. Text box me transcript abhi bhi hai; badal ke dobara "Form bharo" dabao.'));
            });
        });
        clearBtn.addEventListener('click', function () {
            window.VFHMatcher.clearHighlights(document);
        });

        shadow.appendChild(style);
        shadow.appendChild(panel);
        document.documentElement.appendChild(host);
        ta.focus();
    }

    window.addEventListener('vfh:toggle', togglePanel);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(function (msg) {
            if (msg && msg.type === 'VFH_TOGGLE') togglePanel();
        });
    }
})();
