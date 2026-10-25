/* Voice Form Helper - floating capture panel.
   Wispr Flow types into this panel's textarea like any other focused field;
   "Form bharo" then maps the transcript into the open page's fields. */
(function () {
    if (window.__vfhLoaded) return;
    window.__vfhLoaded = true;

    var host = null;

    var CSS = ''
        + '.vfh-panel{position:fixed;bottom:16px;right:16px;width:330px;max-height:72vh;overflow-y:auto;'
        + 'background:#ffffff;color:#251f21;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.28);'
        + 'font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;z-index:2147483647;padding:14px 14px 12px;}'
        + '.vfh-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}'
        + '.vfh-title{font-weight:600;font-size:15px;}'
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
        + '.vfh-note{margin-top:10px;font-size:11px;color:#585254;}';

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function renderResults(container, report) {
        container.textContent = '';
        if (!report.filled.length && !report.asks.length && !report.notFound.length && !report.locked.length) {
            container.appendChild(el('div', 'vfh-warn', 'Kuch samajh nahi aaya. Field ka naam bata ke bolna, jaise "name field me Rahul bhar do".'));
            return;
        }
        report.filled.forEach(function (f) {
            container.appendChild(el('div', 'vfh-ok', '✓ ' + f.label + ' → "' + f.fieldLabel + '" me bhara: ' + f.value));
        });
        report.locked.forEach(function (f) {
            container.appendChild(el('div', 'vfh-skip', '– ' + f.label + ': ye field locked hai (site khud bharti hai), skip kiya.'));
        });
        report.asks.forEach(function (a) {
            container.appendChild(el('div', 'vfh-ask', '? ' + a.question));
        });
        report.notFound.forEach(function (f) {
            container.appendChild(el('div', 'vfh-warn', '– "' + f.label + '" jaisa field is page pe nahi mila.'));
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
        head.appendChild(el('span', 'vfh-title', 'Voice Form Helper'));
        var close = el('button', 'vfh-close', '✕');
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
            'Ye extension kuch submit nahi karta. Bhare hue fields highlight hote hain - khud review karke submit karna.'));

        fillBtn.addEventListener('click', function () {
            var text = ta.value.trim();
            if (!text) {
                results.textContent = '';
                results.appendChild(el('div', 'vfh-warn', 'Pehle box me dictate ya type karo.'));
                return;
            }
            var report = window.VFHMatcher.fillFromTranscript(text, document);
            renderResults(results, report);
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
