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
        house: [], street: [], pincode: [], city: [], state: [], landmark: [], country: [],
        address: ['email', 'web'], gender: [], occupation: [], income: [], purpose: []
    };

    function hasWord(text, word) {
        if (/^[a-z]/.test(word)) {
            return new RegExp('\\b' + word.replace(/ /g, '\\s+') + '\\b').test(text);
        }
        return text.indexOf(word) !== -1;
    }

    var SKIP_TYPES = ['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio', 'password', 'image'];

    // HTML autocomplete tokens -> our keys (WHATWG standard, real sites use it).
    var AUTOCOMPLETE_MAP = {
        'name': 'name', 'given-name': 'name', 'family-name': 'name',
        'bday': 'dob', 'street-address': 'house', 'address-line1': 'house',
        'address-line2': 'street', 'postal-code': 'pincode',
        'address-level2': 'city', 'address-level1': 'state',
        'country': 'country', 'country-name': 'country',
        'tel': 'phone', 'tel-national': 'phone', 'email': 'email'
    };

    function humanize(s) {
        return (s || '').replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
    }

    // Visible text (label/aria/placeholder) is kept apart from humanized
    // name/id attributes: negative hints apply only to what the user sees, so
    // framework ids like "address-ui-widgets-enterAddressFullName" can no longer
    // disqualify a perfectly good "Full name" field.
    function siblingLabelText(el, doc) {
        // Floating labels and Google-Forms-style question text sit in a nearby
        // element BEFORE the input, not in a label[for]. Walk preceding
        // siblings, climbing up to 4 ancestors. A sibling that IS or CONTAINS a
        // form control is a barrier (it belongs to another field), headings are
        // skipped (form titles are not labels), and the text must contain a
        // letter (a "+91" chip is not a label).
        var node = el;
        for (var h = 0; h < 4 && node && node !== doc.body; h++) {
            var sib = node.previousElementSibling;
            while (sib) {
                var tag = sib.tagName ? sib.tagName.toLowerCase() : '';
                if (/^(input|textarea|select)$/.test(tag) || sib.querySelector('input,textarea,select')) break;
                if (!/^h[1-6]$/.test(tag)) {
                    var t = (sib.textContent || '').replace(/\s+/g, ' ').trim();
                    if (t.length >= 2 && t.length <= 90 && /[\p{L}]/u.test(t)) return t;
                }
                sib = sib.previousElementSibling;
            }
            node = node.parentElement;
        }
        return '';
    }

    function labelText(el, doc) {
        var visible = [];
        if (el.id) {
            var lbl = doc.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]');
            if (lbl) visible.push(lbl.textContent);
        }
        var wrapping = el.closest('label');
        if (wrapping) visible.push(wrapping.textContent);
        if (el.getAttribute('aria-label')) visible.push(el.getAttribute('aria-label'));
        if (el.getAttribute('aria-labelledby')) {
            el.getAttribute('aria-labelledby').split(/\s+/).forEach(function (id) {
                var n = doc.getElementById(id);
                if (n) visible.push(n.textContent);
            });
        }
        var sibLabel = siblingLabelText(el, doc);
        if (sibLabel) visible.push(sibLabel);
        if (el.getAttribute('placeholder')) visible.push(el.getAttribute('placeholder'));
        var parts = visible.slice();
        if (el.name) parts.push(humanize(el.name));
        if (el.id) parts.push(humanize(el.id));
        return {
            all: parts.join(' | ').replace(/\s+/g, ' ').toLowerCase().trim(),
            visible: visible.join(' | ').replace(/\s+/g, ' ').toLowerCase().trim()
        };
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
            var lt = labelText(el, doc);
            out.push({ el: el, text: lt.all, visible: lt.visible, fillable: isFillable(el), locked: isLocked(el), hidden: hidden });
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
            // Only an immediately adjacent "+91" chip marks the phone box - in a
            // flat form the chip is a sibling of EVERY field and would otherwise
            // pull phone values onto pincode/name inputs.
            var neighbours = [f.el.previousElementSibling, f.el.nextElementSibling];
            for (var s = 0; s < neighbours.length; s++) {
                var sib = neighbours[s];
                if (!sib) continue;
                if (sib.querySelector && sib.querySelector('input,textarea,select')) continue;
                if (/^\+?\s?91[\s-]*$/.test((sib.textContent || '').trim())) return 90;
            }
        }
        if (key === 'email' && (f.el.getAttribute('type') || '').toLowerCase() === 'email') return 100;
        // The autocomplete attribute is the most reliable signal on modern sites.
        var acTok = (f.el.getAttribute('autocomplete') || '').toLowerCase().trim();
        if (acTok && AUTOCOMPLETE_MAP[acTok] === key) return 95;
        if (!f.text) return 0;
        var neg = NEGATIVE_HINTS[key] || [];
        for (var i = 0; i < neg.length; i++) {
            if (hasWord(f.visible, neg[i])) return 0;
        }
        var field = PARSER.FIELDS.find(function (x) { return x.key === key; });
        var best = 0;
        // An alias matching one whole label part ("name" == "name") beats a
        // substring inside a longer part ("name" inside "apartment name").
        // Google Forms & co. hang a required-marker " *" on the visible label
        // ("Name *"). Without stripping it, the exact-part boost never fires
        // and "Name *" merely word-ties with "University Name" - a false
        // ambiguity on the most basic field of any form.
        var parts = f.text.split('|').map(function (p) { return p.trim().replace(/[\s*]+$/, '').trim(); });
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
            if (!best || s > best.score) best = { el: f.el, score: s, text: f.text, tied: false };
            else if (best && s === best.score) best.tied = true;
        });
        // Barabar score wale do alag fields = asli ambiguity. Chupke se pehla
        // field bharna galat ho sakta hai (billing vs shipping "Name") - isliye
        // notfound, jisse Field chuno se user khud field chune.
        if (best && best.tied) return null;
        if (best) return { el: best.el, label: best.text };
        if (lockedMatch) return { locked: true, label: lockedMatch.text };
        return null;
    }

    function highlight(el) {
        if (!el.hasAttribute('data-vfh-highlighted')) {
            el.setAttribute('data-vfh-oldstyle', el.getAttribute('style') || '');
        }
        el.style.outline = '2px solid #2f7a67';
        el.style.backgroundColor = '#e8f4ef';
        el.setAttribute('data-vfh-highlighted', '1');
    }

    function clearHighlights(doc) {
        doc.querySelectorAll('[data-vfh-highlighted]').forEach(function (el) {
            var old = el.getAttribute('data-vfh-oldstyle');
            if (old) el.setAttribute('style', old); else el.removeAttribute('style');
            el.removeAttribute('data-vfh-highlighted');
            el.removeAttribute('data-vfh-oldstyle');
        });
    }

    function findOption(el, value) {
        var v = value.toLowerCase().trim();
        var opts = Array.prototype.slice.call(el.options);
        function t(o) { return o.textContent.toLowerCase().trim(); }
        return opts.find(function (o) { return o.value.toLowerCase() === v || t(o) === v; })
            || opts.find(function (o) { return t(o).indexOf(v) === 0; })
            || opts.find(function (o) { return (' ' + t(o) + ' ').indexOf(' ' + v + ' ') !== -1; })
            || null;
    }

    // Read-only check: can this value be written without actually writing it?
    function canSetValue(el, value) {
        if (el.tagName.toLowerCase() !== 'select') return true;
        return !!findOption(el, value);
    }

    // React/Vue track input values through their own prototype setter: a plain
    // el.value = x writes the DOM but the framework still thinks the field is
    // empty and can wipe it. Writing through the native prototype setter plus
    // real events is what a human's typing looks like to those frameworks.
    function nativeSet(el, value) {
        var tag = el.tagName;
        var proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                  : tag === 'SELECT' ? HTMLSelectElement.prototype
                  : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    }

    function setValue(el, value) {
        var type = (el.type || '').toLowerCase();
        if (el.tagName.toLowerCase() === 'select') {
            var opt = findOption(el, value);
            if (opt) nativeSet(el, opt.value); else return false;
        } else if (type === 'radio') {
            if (!el.checked) el.click();
            highlight(el.labels && el.labels.length ? el.labels[0] : el);
            return true;
        } else if (type === 'date') {
            // <input type=date> only accepts YYYY-MM-DD; we speak DD/MM/YYYY.
            var dm = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            nativeSet(el, dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : value);
        } else {
            nativeSet(el, value);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        highlight(el);
        return true;
    }

    // ---- Radio groups (gender, yes/no, address type): matched as ONE group,
    // the spoken value picks the option. Never writes anything but a click. ----
    function radioGroups(doc) {
        var groups = [];
        var byName = {};
        doc.querySelectorAll('input[type=radio]').forEach(function (r) {
            if (r.closest('#vfh-host') || r.disabled) return;
            var key = r.name || ('__anon_' + groups.length);
            if (!byName[key]) { byName[key] = { name: r.name || '', radios: [] }; groups.push(byName[key]); }
            byName[key].radios.push(r);
        });
        return groups;
    }

    function radioOptionLabel(r, doc) {
        if (r.id) {
            var lbl = doc.querySelector('label[for="' + r.id.replace(/"/g, '\\"') + '"]');
            if (lbl) return lbl.textContent.replace(/\s+/g, ' ').trim();
        }
        var wrapping = r.closest('label');
        if (wrapping) return wrapping.textContent.replace(/\s+/g, ' ').trim();
        if (r.getAttribute('aria-label')) return r.getAttribute('aria-label').trim();
        var sib = r.nextElementSibling;
        if (sib && !sib.querySelector('input,textarea,select')) {
            var t = (sib.textContent || '').replace(/\s+/g, ' ').trim();
            if (t) return t;
        }
        return (r.value || '').trim();
    }

    function groupLabelText(g, doc) {
        var first = g.radios[0];
        var fs = first.closest('fieldset');
        if (fs) {
            var lg = fs.querySelector('legend');
            if (lg) return lg.textContent.replace(/\s+/g, ' ').trim();
        }
        var rg = first.closest('[role="radiogroup"]');
        if (rg && rg.getAttribute('aria-label')) return rg.getAttribute('aria-label').trim();
        var sib = siblingLabelText(first, doc);
        if (sib) return sib;
        return humanize(g.name);
    }

    function matchRadioGroup(key, value, doc) {
        var field = PARSER.FIELDS.find(function (x) { return x.key === key; });
        var neg = NEGATIVE_HINTS[key] || [];
        var best = null, bestScore = 0;
        radioGroups(doc).forEach(function (g) {
            var gt = groupLabelText(g, doc).toLowerCase();
            if (!gt) return;
            for (var i = 0; i < neg.length; i++) { if (hasWord(gt, neg[i])) return; }
            var s = 0;
            field.aliases.forEach(function (a) {
                var al = a.toLowerCase();
                if (gt === al) s = Math.max(s, 100 + al.length);
                else if (hasWord(gt, al)) s = Math.max(s, 50 + al.length);
            });
            if (s > bestScore) { bestScore = s; best = { group: g, label: groupLabelText(g, doc) }; }
        });
        if (!best) return null;
        // pick the option matching the spoken value: exact -> starts-with -> word
        var v = value.toLowerCase().trim();
        var chosen = null, options = [];
        best.group.radios.forEach(function (r) {
            var t = radioOptionLabel(r, doc).toLowerCase();
            options.push(t);
            if (chosen) return;
            if (t === v || r.value.toLowerCase() === v) chosen = r;
            else if (t.indexOf(v) === 0) chosen = r;
            else if ((' ' + t + ' ').indexOf(' ' + v + ' ') !== -1) chosen = r;
        });
        return { radio: chosen, groupLabel: best.label, options: options, group: best.group };
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
                var rgL = matchRadioGroup(fill.key, fill.value, doc);
                if (rgL && rgL.radio) {
                    plan.items.push({ status: 'write', el: rgL.radio, key: fill.key, label: fill.label, value: fill.value,
                        fieldLabel: rgL.groupLabel, isRadio: true,
                        oldValue: (function () { var ch = rgL.group.radios.find(function (r) { return r.checked; }); return ch && ch !== rgL.radio ? radioOptionLabel(ch, doc) : null; })() });
                    plan.hasWrites = true;
                } else {
                    plan.items.push({ status: 'locked', key: fill.key, label: fill.label, value: fill.value, fieldLabel: m.label.split('|')[0].trim() });
                }
            } else {
                var rg = matchRadioGroup(fill.key, fill.value, doc);
                if (rg && rg.radio) {
                    var checked = rg.group.radios.find(function (r) { return r.checked; });
                    plan.items.push({ status: 'write', el: rg.radio, key: fill.key, label: fill.label, value: fill.value,
                        fieldLabel: rg.groupLabel, isRadio: true,
                        oldValue: checked && checked !== rg.radio ? radioOptionLabel(checked, doc) : null });
                    plan.hasWrites = true;
                } else if (rg && !rg.radio) {
                    plan.asks.push({ key: fill.key, label: fill.label, value: fill.value, question: fill.label + ' ke group me "' + fill.value + '" option nahi mila. Options hain: ' + rg.options.join(', ') + ' - in me se ek bolna.' });
                } else {
                    plan.items.push({ status: 'notfound', key: fill.key, label: fill.label, value: fill.value });
                }
            }
        });
        return plan;
    }

    // Write an approved plan to the page. Returns the fill report.
    function applyPlan(plan) {
        var report = { filled: [], notFound: [], locked: [], asks: plan.asks.slice(), undo: [] };
        var firstEl = null;
        plan.items.forEach(function (it) {
            if (it.status === 'write') {
                if (setValue(it.el, it.value)) {
                    var entry = { key: it.key, label: it.label, value: it.value, fieldLabel: it.fieldLabel };
                    if (it.oldValue) entry.oldValue = it.oldValue;
                    report.filled.push(entry);
                    report.undo.push(it.isRadio
                        ? { radio: true, el: it.el, groupName: it.el.name, oldValue: it.oldValue || null }
                        : { radio: false, el: it.el, oldValue: it.oldValue || '', newValue: it.el.value });
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

    // Restore the values the last approved write replaced. Radio groups go back
    // to the previously-checked option (or unchecked if none was checked).
    // Undo restores only fields still holding the value BoloForm wrote.
    // A field the user edited after the fill is left alone and reported.
    function undoLastApply(undoEntries) {
        var restored = 0, kept = 0;
        (undoEntries || []).forEach(function (u) {
            if (u.radio) {
                if (!u.el.checked) { kept++; return; } // user changed the selection after the fill
                if (u.oldValue) {
                    var radios = u.el.form ? u.el.form.elements[u.groupName] : document.querySelectorAll('input[type=radio][name="' + u.groupName + '"]');
                    var list = radios && radios.length !== undefined ? Array.prototype.slice.call(radios) : [radios];
                    list.forEach(function (r) {
                        if (r && radioOptionLabel(r, document).toLowerCase() === u.oldValue.toLowerCase() && !r.checked) { r.click(); }
                    });
                } else if (u.el.checked) {
                    u.el.checked = false;
                }
                restored++;
            } else {
                if (u.newValue != null && u.el.value !== u.newValue) { kept++; return; } // user edited after the fill
                nativeSet(u.el, u.oldValue);
                u.el.dispatchEvent(new Event('input', { bubbles: true }));
                u.el.dispatchEvent(new Event('change', { bubbles: true }));
                restored++;
            }
        });
        return { restored: restored, kept: kept };
    }

    return { fillFromTranscript: fillFromTranscript, planFromTranscript: planFromTranscript, applyPlan: applyPlan, clearHighlights: clearHighlights, matchField: matchField, fillElement: fillElement, undoLastApply: undoLastApply };
});
