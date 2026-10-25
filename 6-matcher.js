/* Voice Form Helper - page field matcher and filler.
   Finds the open page's real fields by their labels/placeholders/names,
   writes matched values with proper input events, highlights what it touched.
   Never touches readonly/disabled fields, never submits anything. */
(function (root, factory) {
    var api = factory(root.VFHParser);
    root.VFHMatcher = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (PARSER) {

    // A field whose label mentions these must not be filled by that key
    // (e.g. "Father's Name" must not catch a plain "name" value).
    var NEGATIVE_HINTS = {
        name: ['father', 'mother', 'spouse', 'pita', 'pitaji', 'पिता', 'माता', 'husband', 'wife', 'contact'],
        father: ['mother', 'spouse'],
        phone: ['aadhaar', 'aadhar', 'pan', 'account', 'otp'],
        dob: ['issue', 'expiry', 'valid', 'registration'],
        email: ['website'],
        house: [], street: [], pincode: [], city: [], state: [],
        address: ['email', 'web'], gender: [], occupation: [], income: [], purpose: []
    };

    var SKIP_TYPES = ['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio', 'password', 'image'];

    function humanize(s) {
        return (s || '').replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
    }

    function labelText(el, doc) {
        var parts = [];
        if (el.id) {
            var lbl = doc.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]');
            if (lbl) parts.push(lbl.textContent);
        }
        var wrapping = el.closest('label');
        if (wrapping) parts.push(wrapping.textContent);
        if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
        if (el.getAttribute('placeholder')) parts.push(el.getAttribute('placeholder'));
        if (el.name) parts.push(humanize(el.name));
        if (el.id) parts.push(humanize(el.id));
        return parts.join(' | ').replace(/\s+/g, ' ').toLowerCase().trim();
    }

    function isFillable(el) {
        if (el.disabled || el.readOnly) return false;
        var tag = el.tagName.toLowerCase();
        if (tag === 'select') return true;
        if (tag === 'textarea') return true;
        return SKIP_TYPES.indexOf((el.type || 'text').toLowerCase()) === -1;
    }

    function isLocked(el) {
        return !!(el.disabled || el.readOnly);
    }

    function collectFields(doc) {
        var out = [];
        doc.querySelectorAll('input, textarea, select').forEach(function (el) {
            if (el.closest('#vfh-host')) return;
            var rect = el.getBoundingClientRect();
            var hidden = el.type === 'hidden' || (rect.width === 0 && rect.height === 0 && el.type !== 'hidden');
            out.push({ el: el, text: labelText(el, doc), fillable: isFillable(el), locked: isLocked(el), hidden: hidden });
        });
        return out;
    }

    function scoreField(f, key) {
        if (f.hidden || !f.text) return 0;
        var neg = NEGATIVE_HINTS[key] || [];
        for (var i = 0; i < neg.length; i++) {
            if (f.text.indexOf(neg[i]) !== -1) return 0;
        }
        var field = PARSER.FIELDS.find(function (x) { return x.key === key; });
        var best = 0;
        field.aliases.forEach(function (a) {
            var al = a.toLowerCase();
            if (/^[a-z]/.test(al)) {
                if (new RegExp('\\b' + al.replace(/ /g, '\\s+') + '\\b').test(f.text)) best = Math.max(best, al.length);
            } else if (f.text.indexOf(al) !== -1) {
                best = Math.max(best, al.length);
            }
        });
        return best;
    }

    function matchField(key, doc) {
        var best = null;
        var lockedMatch = null;
        collectFields(doc).forEach(function (f) {
            var s = scoreField(f, key);
            if (s <= 0) return;
            if (f.locked) {
                if (!lockedMatch || s > lockedMatch.score) lockedMatch = { el: f.el, score: s, text: f.text };
                return;
            }
            if (!f.fillable) return;
            if (!best || s > best.score) best = { el: f.el, score: s, text: f.text };
        });
        if (best) return { el: best.el, label: best.text };
        if (lockedMatch) return { locked: true, label: lockedMatch.text };
        return null;
    }

    function highlight(el) {
        el.style.outline = '2px solid #2f7a67';
        el.style.backgroundColor = '#e8f4ef';
        el.setAttribute('data-vfh-highlighted', '1');
    }

    function clearHighlights(doc) {
        doc.querySelectorAll('[data-vfh-highlighted]').forEach(function (el) {
            el.style.outline = '';
            el.style.backgroundColor = '';
            el.removeAttribute('data-vfh-highlighted');
        });
    }

    function setValue(el, value) {
        if (el.tagName.toLowerCase() === 'select') {
            var lower = value.toLowerCase();
            var opt = Array.prototype.find.call(el.options, function (o) {
                return o.value.toLowerCase() === lower || o.textContent.toLowerCase().indexOf(lower) !== -1;
            });
            if (opt) el.value = opt.value; else return false;
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        highlight(el);
        return true;
    }

    function fillFromTranscript(text, doc) {
        doc = doc || document;
        var parsed = PARSER.parse(text);
        var report = { filled: [], notFound: [], locked: [], asks: parsed.asks };
        var firstEl = null;
        parsed.fills.forEach(function (fill) {
            var m = matchField(fill.key, doc);
            if (m && m.el) {
                if (setValue(m.el, fill.value)) {
                    report.filled.push({ key: fill.key, label: fill.label, value: fill.value, fieldLabel: m.label.split('|')[0].trim() });
                    if (!firstEl) firstEl = m.el;
                } else {
                    report.asks.push({ key: fill.key, question: fill.label + ' ke liye "' + fill.value + '" is dropdown me nahi mila. Options dekh ke dobara bolna.' });
                }
            } else if (m && m.locked) {
                report.locked.push({ key: fill.key, label: fill.label, value: fill.value });
            } else {
                report.notFound.push(fill);
            }
        });
        if (firstEl && firstEl.scrollIntoView) firstEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return report;
    }

    return { fillFromTranscript: fillFromTranscript, clearHighlights: clearHighlights, matchField: matchField };
});
