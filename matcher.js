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
        // "Name" must never land in "House / Flat No / Apartment Name" and vice versa.
        name: ['father', 'mother', 'spouse', 'pita', 'pitaji', 'पिता', 'माता', 'husband', 'wife', 'contact',
               'house', 'flat', 'apartment', 'street', 'area', 'locality', 'landmark', 'pincode', 'pin',
               'city', 'state', 'address', 'shop', 'store', 'company', 'business'],
        father: ['mother', 'spouse'],
        phone: ['aadhaar', 'aadhar', 'pan', 'account', 'otp', 'alternate', 'emergency'],
        dob: ['issue', 'expiry', 'valid', 'registration'],
        email: ['website'],
        house: [], street: [], pincode: [], city: [], state: [],
        address: ['email', 'web'], gender: [], occupation: [], income: [], purpose: []
    };

    function hasWord(text, word) {
        if (/^[a-z]/.test(word)) {
            return new RegExp('\\b' + word.replace(/ /g, '\\s+') + '\\b').test(text);
        }
        return text.indexOf(word) !== -1;
    }

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
        if (f.hidden) return 0;
        // Structural match: tel inputs and tel autocomplete are phone fields even with no label.
        if (key === 'phone') {
            var t = (f.el.getAttribute('type') || '').toLowerCase();
            var ac = (f.el.getAttribute('autocomplete') || '').toLowerCase();
            if (t === 'tel' || ac === 'tel' || ac === 'tel-national') return 100;
        }
        if (key === 'email' && (f.el.getAttribute('type') || '').toLowerCase() === 'email') return 100;
        if (!f.text) return 0;
        var neg = NEGATIVE_HINTS[key] || [];
        for (var i = 0; i < neg.length; i++) {
            if (hasWord(f.text, neg[i])) return 0;
        }
        var field = PARSER.FIELDS.find(function (x) { return x.key === key; });
        var best = 0;
        // An alias matching one whole label part ("name" == "name") beats a
        // substring inside a longer part ("name" inside "apartment name").
        var parts = f.text.split('|').map(function (p) { return p.trim(); });
        field.aliases.forEach(function (a) {
            var al = a.toLowerCase();
            for (var p = 0; p < parts.length; p++) {
                if (parts[p] === al) best = Math.max(best, 100 + al.length);
            }
            if (hasWord(f.text, al)) best = Math.max(best, al.length);
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
        var claimed = []; // {el, key, label, value} written in THIS run
        parsed.fills.forEach(function (fill) {
            var m = matchField(fill.key, doc);
            if (m && m.el) {
                var shortLabel = m.label.split('|')[0].trim();
                // Never silently overwrite: two different details mapping to one field
                // is a mapping doubt, so ask instead of picking one.
                var prev = null;
                for (var c = 0; c < claimed.length; c++) { if (claimed[c].el === m.el) { prev = claimed[c]; break; } }
                if (prev && prev.key !== fill.key) {
                    report.asks.push({ key: fill.key, label: fill.label, value: fill.value, question: '"' + prev.label + '" ("' + prev.value + '") aur "' + fill.label + '" ("' + fill.value + '") dono ek hi field pe map hue ("' + shortLabel + '"). Maine kuch nahi badla - "Field chuno" se sahi field khud choose kar sakte ho, ya field ka naam de ke dobara bolo.' });
                    return;
                }
                if (prev && prev.value !== fill.value) {
                    report.asks.push({ key: fill.key, label: fill.label, value: fill.value, question: fill.label + ' ke liye ek hi message me do alag values aaye: "' + prev.value + '" aur "' + fill.value + '". Abhi "' + prev.value + '" rakha hai - doosri chahiye to "Field chuno" ya field ka naam de ke dobara bolo.' });
                    return;
                }
                if (prev) return;
                var oldValue = (m.el.value || '').trim();
                if (setValue(m.el, fill.value)) {
                    claimed.push({ el: m.el, key: fill.key, label: fill.label, value: fill.value });
                    var entry = { key: fill.key, label: fill.label, value: fill.value, fieldLabel: shortLabel };
                    if (oldValue && oldValue !== fill.value) entry.oldValue = oldValue;
                    report.filled.push(entry);
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

    // Manual field binding: user clicks a field on the page for one pending value.
    function fillElement(el, value) {
        if (!el) return { ok: false, reason: 'koi field nahi mila' };
        if (isLocked(el)) return { ok: false, reason: 'ye field locked hai (site khud bharti hai)' };
        var tag = el.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return { ok: false, reason: 'ye ek form field nahi hai' };
        var oldValue = (el.value || '').trim();
        if (!setValue(el, value)) return { ok: false, reason: 'is dropdown me ye value nahi mila' };
        return { ok: true, oldValue: oldValue };
    }

    return { fillFromTranscript: fillFromTranscript, clearHighlights: clearHighlights, matchField: matchField, fillElement: fillElement };
});
