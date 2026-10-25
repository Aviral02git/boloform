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
            // Sites often mark the phone box with a +91 chip or a numeric sample placeholder.
            var ph = (f.el.getAttribute('placeholder') || '').trim();
            if (/^[\d\s()+-]{9,}$/.test(ph)) return 90;
            var sibs = f.el.parentElement ? f.el.parentElement.children : [];
            for (var s = 0; s < sibs.length; s++) {
                if (sibs[s] === f.el) continue;
                if (sibs[s].querySelector && sibs[s].querySelector('input,textarea,select')) continue;
                if (/^\+?\s?91[\s-]*$/.test((sibs[s].textContent || '').trim())) return 90;
            }
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

    function findOption(el, value) {
        var lower = value.toLowerCase();
        return Array.prototype.find.call(el.options, function (o) {
            return o.value.toLowerCase() === lower || o.textContent.toLowerCase().indexOf(lower) !== -1;
        });
    }

    // Read-only check: can this value be written without actually writing it?
    function canSetValue(el, value) {
        if (el.tagName.toLowerCase() !== 'select') return true;
        return !!findOption(el, value);
    }

    function setValue(el, value) {
        if (el.tagName.toLowerCase() === 'select') {
            var opt = findOption(el, value);
            if (opt) el.value = opt.value; else return false;
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        highlight(el);
        return true;
    }

    // Preview-first flow: compute the full field/value mapping WITHOUT writing.
    // Items carry status: 'write' (el set, will fill on approval), 'locked',
    // 'notfound'. Conflicts and dropdown misses become asks before any write.
    function planFromTranscript(text, doc) {
        doc = doc || document;
        var parsed = PARSER.parse(text);
        var plan = { items: [], asks: parsed.asks.slice(), hasWrites: false };
        var claimed = []; // {el, key, label, value} planned in THIS run
        parsed.fills.forEach(function (fill) {
            var m = matchField(fill.key, doc);
            if (m && m.el) {
                var shortLabel = m.label.split('|')[0].trim();
                var prev = null;
                for (var c = 0; c < claimed.length; c++) { if (claimed[c].el === m.el) { prev = claimed[c]; break; } }
                if (prev && prev.key !== fill.key) {
                    plan.asks.push({ key: fill.key, label: fill.label, value: fill.value, question: '"' + prev.label + '" ("' + prev.value + '") aur "' + fill.label + '" ("' + fill.value + '") dono ek hi field pe map hue ("' + shortLabel + '"). "Field chuno" se sahi field khud choose kar sakte ho, ya field ka naam de ke dobara bolo.' });
                    return;
                }
                if (prev && prev.value !== fill.value) {
                    plan.asks.push({ key: fill.key, label: fill.label, value: fill.value, question: fill.label + ' ke liye ek hi message me do alag values aaye: "' + prev.value + '" aur "' + fill.value + '". Pehli wali preview me hai - doosri chahiye to "Field chuno" ya field ka naam de ke dobara bolo.' });
                    return;
                }
                if (prev) return;
                if (!canSetValue(m.el, fill.value)) {
                    plan.asks.push({ key: fill.key, label: fill.label, value: fill.value, question: fill.label + ' ke liye "' + fill.value + '" is dropdown me nahi mila. Options dekh ke dobara bolna.' });
                    return;
                }
                claimed.push({ el: m.el, key: fill.key, label: fill.label, value: fill.value });
                var oldValue = (m.el.value || '').trim();
                plan.items.push({ status: 'write', el: m.el, key: fill.key, label: fill.label, value: fill.value, fieldLabel: shortLabel, oldValue: (oldValue && oldValue !== fill.value) ? oldValue : null });
                plan.hasWrites = true;
            } else if (m && m.locked) {
                plan.items.push({ status: 'locked', key: fill.key, label: fill.label, value: fill.value, fieldLabel: m.label.split('|')[0].trim() });
            } else {
                plan.items.push({ status: 'notfound', key: fill.key, label: fill.label, value: fill.value });
            }
        });
        return plan;
    }

    // Write an approved plan to the page. Returns the fill report.
    function applyPlan(plan) {
        var report = { filled: [], notFound: [], locked: [], asks: plan.asks.slice() };
        var firstEl = null;
        plan.items.forEach(function (it) {
            if (it.status === 'write') {
                if (setValue(it.el, it.value)) {
                    var entry = { key: it.key, label: it.label, value: it.value, fieldLabel: it.fieldLabel };
                    if (it.oldValue) entry.oldValue = it.oldValue;
                    report.filled.push(entry);
                    if (!firstEl) firstEl = it.el;
                } else {
                    report.asks.push({ key: it.key, label: it.label, value: it.value, question: it.label + ' ke liye "' + it.value + '" likhte waqt field ne mana kar diya. Khud likhna ya "Field chuno" use karna.' });
                }
            } else if (it.status === 'locked') {
                report.locked.push(it);
            } else {
                report.notFound.push(it);
            }
        });
        if (firstEl && firstEl.scrollIntoView) firstEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return report;
    }

    // One-shot fill without preview (used by tests and the manual flow).
    function fillFromTranscript(text, doc) {
        return applyPlan(planFromTranscript(text, doc));
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

    return { fillFromTranscript: fillFromTranscript, planFromTranscript: planFromTranscript, applyPlan: applyPlan, clearHighlights: clearHighlights, matchField: matchField, fillElement: fillElement };
});
