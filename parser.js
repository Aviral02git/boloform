/* Voice Form Helper - transcript parser.
   Rule-based, bilingual (Hindi/Hinglish/English). Turns one dictated message into
   field-value pairs, in any order, plus "ask" items for anything unclear.
   No network, no dependencies. Works in the browser (window.VFHParser) and Node. */
(function (root, factory) {
    var api = factory();
    root.VFHParser = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {

    var FIELDS = [
        { key: 'name', label: 'Name', aliases: ['full name', 'applicant name', 'name', 'naam', 'नाम'] },
        { key: 'father', label: "Father's name", aliases: ["father's name", 'father name', 'father', 'pita', 'pitaji', 'पिताजी', 'पिता'] },
        { key: 'dob', label: 'Date of birth', aliases: ['date of birth', 'janm tithi', 'janam tithi', 'जन्म तिथि', 'dob', 'birth'] },
        { key: 'gender', label: 'Gender', aliases: ['gender', 'ling', 'लिंग', 'sex'] },
        { key: 'address', label: 'Address', aliases: ['address', 'pata', 'पता', 'residence', ] },
        { key: 'occupation', label: 'Occupation', aliases: ['occupation', 'pesha', 'पेशा', 'kaam', 'काम', 'profession'] },
        { key: 'income', label: 'Annual income', aliases: ['annual income', 'varshik aay', 'वार्षिक आय', 'income', 'aay', 'आय', 'salary'] },
        { key: 'house', label: 'House / Flat', aliases: ['house flat', 'flat no', 'house no', 'apartment name', 'apartment', 'house', 'flat', 'makan', 'मकान'] },
        { key: 'street', label: 'Street / Area', aliases: ['street', 'area', 'gali', 'गली', 'स्ट्रीट', 'एरिया', 'colony'] },
        { key: 'pincode', label: 'PIN code', aliases: ['pincode', 'pin code', 'पिन कोड', 'पिन', 'pin', 'zip'] },
        { key: 'city', label: 'City', aliases: ['city', 'sheher', 'shahar', 'शहर'] },
        { key: 'state', label: 'State', aliases: ['state', 'rajya', 'राज्य'] },
        { key: 'landmark', label: 'Landmark', aliases: ['landmark', 'land mark', 'लैंडमार्क'] },
        { key: 'country', label: 'Country', aliases: ['country', 'desh', 'देश'] },
        { key: 'purpose', label: 'Purpose', aliases: ['purpose', 'udeshya', 'उद्देश्य', 'kaaran', 'कारण'] },
        { key: 'phone', label: 'Phone', aliases: ['phone number', 'mobile number', 'phone', 'mobile', 'फोन', 'मोबाइल', 'contact number', 'संपर्क'] },
        { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'ईमेल', 'ई-मेल', 'mail'] }
    ];

    var VERBS_LATIN = ['bhar dijiye', 'bhar do', 'bharna', 'bhariye', 'bharo', 'daal dijiye', 'daal do', 'daalo', 'daal', 'likh dijiye', 'likh do', 'likho', 'likhna', 'fill karo', 'fill in', 'fill', 'set karo', 'set', 'badal do', 'badlo', 'update karo', 'update', 'daalna', 'likhna'];
    var VERBS_DEVA = ['भर दीजिये', 'भर दो', 'भरिए', 'भरना', 'भरो', 'डाल दीजिये', 'डाल दो', 'डालो', 'डालना', 'लिख दीजिये', 'लिख दो', 'लिखना', 'लिखो', 'बदल दो', 'बदलो'];

    var STOP_TOKENS = ['field', 'column', 'box', 'me', 'mein', 'में', 'मे', 'मूं', 'ka', 'ki', 'ke', 'का', 'की', 'के', 'hai', 'है', 'हैं', 'he', 'mera', 'meri', 'mere', 'मेरा', 'मेरी', 'मेरे', 'apna', 'apni', 'apne', 'अपना', 'अपनी', 'अपने', 'to', 'is', 'as', 'ko', 'को', 'please', 'plz', 'ji', 'जी', 'wapas', 'वापस', 'dobara', 'दोबारा', 'phir', 'फिर', 'se', 'से', 'aise', 'ऐसे', 'jaise', 'जैसे', 'wala', 'wali', 'वाला', 'वाली', 'ye', 'ये', 'यह', 'karo', 'करो', 'karna', 'करना', 'do', 'दो', 'dijiye', 'दीजिये', 'hona', 'होना', 'chahiye', 'चाहिए', 'the', 'a', 'an', 'my'];

    var MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, 'जनवरी': 1, 'फरवरी': 2, 'मार्च': 3, 'अप्रैल': 4, 'मई': 5, 'जून': 6, 'जुलाई': 7, 'अगस्त': 8, 'सितंबर': 9, 'सितम्बर': 9, 'अक्टूबर': 10, 'अक्तूबर': 10, 'नवंबर': 11, 'नवम्बर': 11, 'दिसंबर': 12, 'दिसम्बर': 12 };

    var GENDER_MAP = { male: 'male', female: 'female', other: 'other', purush: 'male', mahila: 'female', 'पुरुष': 'male', 'महिला': 'female', stri: 'female', 'स्त्री': 'female', aadmi: 'male', 'आदमी': 'male' };

    function collapse(s) { return s.replace(/\s+/g, ' ').trim(); }

    function splitClauses(text) {
        return text.split(/[,।;\n]|\.\s+|\s+aur\s+|\s+and\s+|\s+और\s+/i)
            .map(collapse)
            .filter(function (c) { return c.length > 0; });
    }

    function findField(clause) {
        var lower = clause.toLowerCase();
        var best = null;
        FIELDS.forEach(function (f) {
            f.aliases.forEach(function (a) {
                var idx = lower.indexOf(a.toLowerCase());
                if (idx === -1) return;
                // For latin aliases, require word-ish boundaries to avoid "naam" inside other words.
                if (/^[a-z]/.test(a)) {
                    var before = idx === 0 ? ' ' : lower.charAt(idx - 1);
                    var after = idx + a.length >= lower.length ? ' ' : lower.charAt(idx + a.length);
                    if (/[a-z]/.test(before) || /[a-z]/.test(after)) return;
                }
                if (!best || idx < best.idx || (idx === best.idx && a.length > best.alias.length)) {
                    best = { field: f, idx: idx, alias: a };
                }
            });
        });
        return best;
    }

    function stripVerbs(s) {
        VERBS_LATIN.forEach(function (v) {
            s = s.replace(new RegExp('\\b' + v.replace(/ /g, '\\s+') + '\\b', 'gi'), ' ');
        });
        VERBS_DEVA.forEach(function (v) {
            s = s.split(v).join(' ');
        });
        return s;
    }

    function hasAliasOrStopToken(s) {
        var toks = s.toLowerCase().split(/\s+/);
        var allAliases = [];
        FIELDS.forEach(function (f) { f.aliases.forEach(function (a) { allAliases.push(a.toLowerCase()); }); });
        for (var i = 0; i < toks.length; i++) {
            var t = toks[i].replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}.,/@]+$/gu, '');
            if (!t) continue;
            if (STOP_TOKENS.indexOf(t) !== -1) return true;
            for (var j = 0; j < allAliases.length; j++) {
                if (allAliases[j] === t) return true;
            }
        }
        return false;
    }

    var EDGE_LABEL_WORDS = ['naam', 'नाम'];

    // Words that only ever name a field, built from every alias. Used to drop
    // a leading run of dictated label words from a value - interior words are
    // never touched, so real address text keeps "colony", "apartment" etc.
    var LABEL_VOCAB = {};
    FIELDS.forEach(function (f) {
        f.aliases.forEach(function (a) {
            a.toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach(function (w) {
                if (w) LABEL_VOCAB[w] = 1;
            });
        });
    });

    // "town" appears in page labels ("Town/City") but is also real address text
    // ("Town Hall") - vocabulary for label detection only, never a field alias.
    LABEL_VOCAB['town'] = 1;

    function isLabelToken(tok) {
        var subs = tok.toLowerCase().split(/[\/\-]/);
        for (var i = 0; i < subs.length; i++) {
            if (!subs[i] || !LABEL_VOCAB[subs[i]]) return false;
        }
        return true;
    }

    function frontIsLabelish(front) {
        var toks = front.split(/\s+/).map(function (t) {
            return t.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}.,/@]+$/gu, '');
        }).filter(function (t) { return t.length > 0; });
        if (!toks.length) return false;
        for (var i = 0; i < toks.length; i++) {
            var low = toks[i].toLowerCase();
            if (STOP_TOKENS.indexOf(low) !== -1) continue;
            if (isLabelToken(toks[i])) continue;
            return false;
        }
        return true;
    }

    function cleanValue(raw, matchedAlias) {
        var escA = matchedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
        var s = raw.replace(new RegExp('\\b' + escA + '\\b', 'i'), ' ');
        if (s === raw) s = raw.replace(new RegExp(escA, 'i'), ' ');
        s = stripVerbs(s);
        s = s.replace(/[:=]+/g, ' ');
        // Strip dashes/slashes only when not between identifier characters -
        // keep dates ("21/11/2001") and house/flat IDs ("2A/45", "2A-45") intact.
        s = s.replace(/(?<![A-Za-z0-9])[\/\-]|[\/\-](?![A-Za-z0-9])/g, ' ');
        // Directed commands put the label first, then "mein <value>": keep only
        // the part after the last connector when the front still looks label-ish
        // ("... apartment name me 2A Block 45 bharo" -> "2A Block 45").
        var conn = /(?:^|\s)(में|मे|मूं|mein|me)\s/g, m, cut = -1, cutEnd = -1;
        while ((m = conn.exec(s)) !== null) {
            var afterIdx = conn.lastIndex;
            if (s.slice(afterIdx).trim()) { cut = m.index; cutEnd = afterIdx; }
        }
        if (cut !== -1 && (hasAliasOrStopToken(s.slice(0, cut)) || frontIsLabelish(s.slice(0, cut)))) {
            s = s.slice(cutEnd);
        }
        // Drop only leading/trailing filler words. Interior words are the user's
        // data - never strip them ("Shanti ka Colony" keeps "ka" and "Colony").
        var tokens = s.split(/\s+/).map(function (t) {
            return t.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}.,/@]+$/gu, '');
        });
        while (tokens.length && !tokens[0]) tokens.shift();
        while (tokens.length && !tokens[tokens.length - 1]) tokens.pop();
        while (tokens.length) {
            var first = tokens[0].toLowerCase();
            if (STOP_TOKENS.indexOf(first) !== -1 || EDGE_LABEL_WORDS.indexOf(first) !== -1) tokens.shift(); else break;
        }
        while (tokens.length) {
            var last = tokens[tokens.length - 1].toLowerCase();
            if (STOP_TOKENS.indexOf(last) !== -1) tokens.pop(); else break;
        }
        // A disfluent or composite dictated label ("house flat number/apartment
        // number 2A-45") leaves label words in front of the real value. Drop the
        // leading label-word run only when a real value clearly follows (a digit
        // or at least two label words) - "Colony Road" stays whole.
        var run = 0;
        while (run < tokens.length && isLabelToken(tokens[run])) run++;
        if (run > 0 && tokens.length > run && (run >= 2 || /\d/.test(tokens[run]))) {
            tokens = tokens.slice(run);
        }
        return collapse(tokens.join(' ').replace(/\s*([.,/@])\s*/g, '$1'));
    }

    function validateName(v) {
        if (v.length < 2) return { ok: false, question: 'Naam samajh nahi aaya. Dobara bolna: poora naam kya hai?' };
        if (/\d/.test(v)) return { ok: false, question: 'Naam me number aa gaya ("' + v + '"). Sahi naam bolna ya type karna.' };
        return { ok: true, value: v };
    }

    function validatePhone(v) {
        var digits = v.replace(/\D/g, '');
        if (digits.length === 10) return { ok: true, value: digits };
        if (digits.length === 12 && digits.indexOf('91') === 0) return { ok: true, value: digits.slice(2) };
        if (digits.length === 11 && digits.indexOf('0') === 0) return { ok: true, value: digits.slice(1) };
        if (digits.length > 0) return { ok: false, question: 'Phone number adhura lag raha hai ("' + digits + '" - sirf ' + digits.length + ' digits). Poora 10-digit number bolna ya type karna.' };
        return { ok: false, question: 'Phone number nahi mila. 10-digit number bolna ya type karna.' };
    }

    function validateDob(v, rawClause) {
        // ISO first: "2001-11-21" must not be read as day 01, year 1921.
        var iso = v.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        var m = iso ? [iso[0], iso[3], iso[2], iso[1]] : v.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
        if (!m && rawClause) {
            var rm = rawClause.toLowerCase().match(/(\d{1,2})\s*([a-z\u0900-\u097F]+)\s*(\d{4})/);
            if (rm && MONTHS[rm[2]]) m = [rm[0], rm[1], String(MONTHS[rm[2]]), rm[3]];
        }
        if (!m) return { ok: false, question: 'Date of birth ka format clear nahi hua. DD/MM/YYYY me bolna, jaise 21/11/2001.' };
        var d = m[1].padStart(2, '0');
        var mo = m[2].padStart(2, '0');
        // 2-digit year: century KABHI guess nahi karte - poora saal poochte hain.
        if (m[3].length === 2) {
            return { ok: false, question: 'Saal sirf 2 digits me aaya ("' + m[3] + '"). Poora 4-digit saal bolna, jaise 21/11/2001 - century guess karke nahi bharenge.' };
        }
        var y = m[3];
        var dd = parseInt(d, 10), mm = parseInt(mo, 10), yy = parseInt(y, 10);
        var dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (mm === 2 && ((yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0)) dim[1] = 29;
        if (dd < 1 || mm < 1 || mm > 12 || yy < 1900 || yy > 2100 || (mm >= 1 && mm <= 12 && dd > dim[mm - 1])) {
            return { ok: false, question: 'Ye date valid nahi lagti ("' + d + '/' + mo + '/' + y + '"). Dobara bolna, DD/MM/YYYY me.' };
        }
        return { ok: true, value: d + '/' + mo + '/' + y };
    }

    function validateGender(v) {
        var lower = v.toLowerCase();
        var keys = Object.keys(GENDER_MAP).sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (/^[a-z]/.test(k)) {
                if (new RegExp('\\b' + k + '\\b').test(lower)) return { ok: true, value: GENDER_MAP[k] };
            } else if (lower.indexOf(k) !== -1) {
                return { ok: true, value: GENDER_MAP[k] };
            }
        }
        return { ok: false, question: 'Gender samajh nahi aaya ("' + v + '"). male / female / other bolna.' };
    }

    function validateEmail(v) {
        var m = v.replace(/\s+/g, '').match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        if (m) return { ok: true, value: m[0] };
        return { ok: false, question: 'Email valid nahi lagta ("' + v + '"). Dobara bolna ya type karna.' };
    }

    function validatePincode(v) {
        var six = v.match(/\b\d{6}\b/);
        if (six) return { ok: true, value: six[0] };
        var digits = v.replace(/\D/g, '');
        if (digits.length === 6) return { ok: true, value: digits };
        if (digits.length > 0) return { ok: false, question: 'PIN code 6 digits ka hota hai; "' + digits + '" adhura ya galat lag raha hai. Poora PIN bolna ya type karna - guess karke nahi bharenge.' };
        return { ok: false, question: 'PIN code nahi mila. 6-digit PIN bolna ya type karna.' };
    }

    function validateAny(v, fieldLabel) {
        if (v.length < 1) return { ok: false, question: fieldLabel + ' ke liye value nahi mili. Dobara bolna.' };
        return { ok: true, value: v };
    }

    function validate(fieldKey, value, rawClause) {
        switch (fieldKey) {
            case 'name': case 'father': return validateName(value);
            case 'phone': return validatePhone(value);
            case 'dob': return validateDob(value, rawClause);
            case 'gender': return validateGender(value);
            case 'email': return validateEmail(value);
            case 'pincode': return validatePincode(value);
            default: return validateAny(value, fieldKey);
        }
    }

    function containsVerb(clause) {
        var lower = clause.toLowerCase();
        for (var i = 0; i < VERBS_LATIN.length; i++) {
            if (new RegExp('\\b' + VERBS_LATIN[i].replace(/ /g, '\\s+') + '\\b').test(lower)) return true;
        }
        for (var j = 0; j < VERBS_DEVA.length; j++) {
            if (clause.indexOf(VERBS_DEVA[j]) !== -1) return true;
        }
        return false;
    }

    function parseClause(clause) {
        // Wispr sometimes transcribes "landmark" as "land block" in label
        // position. Uncertain, so never auto-fill: ask and offer the value for
        // manual field pick. Checked before findField because the VALUE itself
        // may contain field words ("near City Hospital").
        var lb = clause.match(/^\s*[-\u2022*\u2013\u2014]?\s*(land[\s\-]*block)\b/i);
        if (lb) {
            var lbv = cleanValue(clause, lb[1]);
            if (lbv) {
                return { ask: { key: 'landmark', label: 'Landmark', value: lbv, clause: clause, question: '"land block" shayad "landmark" ka transcription hai. Agar Landmark field me "' + lbv + '" bharna hai to "Field chuno" se Landmark chuno, ya dobara bolo: "landmark me ' + lbv + ' bhar do".' } };
            }
        }
        var hit = findField(clause);
        // A field word mid-clause is a label only when what precedes it is
        // possessive filler ("mera naam Rahul"). "near City Hospital" me "City"
        // label nahi - value ka hissa hai; warna city = "near Hospital" jaisa
        // galat fill banta hai.
        if (hit && hit.idx > 0) {
            // A field word right after a preposition is value content, not a
            // label: "near City Hospital" ka "City" city nahi hai. Without this
            // guard the alias hijacked the phrase into city = "near Hospital".
            var PREP = ['near', 'behind', 'opposite', 'beside', 'next', 'to', 'paas', 'pas', 'samne', 'bagal', 'andher',
                '\u092a\u093e\u0938', '\u0938\u093e\u092e\u0928\u0947', '\u092c\u0917\u0932', '\u092a\u0940\u091b\u0947'];
            var preWords = clause.slice(0, hit.idx).toLowerCase().replace(/[-\u2022*\u2013\u2014"':\s]+/g, ' ').trim().split(/\s+/).filter(Boolean);
            var lastPre = preWords.length ? preWords[preWords.length - 1] : '';
            if (PREP.indexOf(lastPre) !== -1) hit = null;
        }
        if (!hit) {
            // Bare-number shortcuts: a standalone 6-digit reads as PIN, 10-digit as phone.
            var bare = clause.replace(/[.\s-]/g, '');
            if (/^\d{6}$/.test(bare)) {
                return { fill: { key: 'pincode', label: 'PIN code', value: bare } };
            }
            if (/^\d{10}$/.test(bare)) {
                return { fill: { key: 'phone', label: 'Phone', value: bare } };
            }
            return { ask: { key: null, clause: clause, question: 'Ye line kisi field se match nahi hui: "' + clause + '". Field ka naam bata ke dobara bolna, jaise "name field me ... bhar do".' } };
        }
        var value = cleanValue(clause.toLowerCase() === clause ? clause : clause, hit.alias);
        // cleanValue keeps original case; but matching is case-insensitive so remove alias regardless of case:
        if (value === clause) {
            value = cleanValue(clause.replace(new RegExp(hit.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' '), hit.alias);
        }
        if (!value) {
            return { ask: { key: hit.field.key, clause: clause, question: hit.field.label + ' ke liye value nahi mili. Dobara bolna, jaise "' + hit.field.label + ' me ... bhar do".' } };
        }
        var check = validate(hit.field.key, value, clause);
        if (!check.ok) {
            return { ask: { key: hit.field.key, clause: clause, question: check.question } };
        }
        return { fill: { key: hit.field.key, label: hit.field.label, value: check.value } };
    }

    var CONTINUATION_KEYS = ['house', 'street', 'address', 'landmark'];

    // Wispr often transcribes a dictated list as bulleted "- Key: value" lines.
    var BULLET_KEYS = {
        'name': 'name', 'full name': 'name', 'applicant name': 'name', 'naam': 'name',
        'father': 'father', "father's name": 'father', 'father name': 'father',
        'dob': 'dob', 'date of birth': 'dob', 'birth date': 'dob',
        'gender': 'gender', 'sex': 'gender',
        'address': 'address', 'house': 'house', 'house no': 'house', 'house number': 'house',
        'flat': 'house', 'flat no': 'house', 'apartment': 'house',
        'street': 'street', 'street area': 'street', 'area': 'street', 'locality': 'street',
        'pin': 'pincode', 'pincode': 'pincode', 'pin code': 'pincode', 'zip': 'pincode',
        'zip code': 'pincode', 'postal code': 'pincode',
        'city': 'city', 'town': 'city', 'town/city': 'city', 'city/town': 'city', 'state': 'state',
        'landmark': 'landmark', 'land mark': 'landmark', 'country': 'country',
        'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone',
        'mobile number': 'phone', 'contact': 'phone', 'contact number': 'phone',
        'email': 'email', 'e-mail': 'email', 'mail': 'email',
        'occupation': 'occupation', 'income': 'income', 'annual income': 'income', 'purpose': 'purpose'
    };

    function lightClean(v) {
        return v.replace(/\s+/g, ' ').replace(/^["'\s]+|[."'\s,]+$/g, '').trim();
    }

    // Split a transcript into bulleted key/value lines plus leftover raw lines.
    function splitLines(text) {
        return text.split(/\n+/).map(function (line) {
            var m = line.match(/^\s*(?:[-•*–—]\s*)?([A-Za-z][A-Za-z &'/.\-]{0,29}?)\s*:\s+(\S[\s\S]*)$/);
            if (!m) return { raw: line };
            var k = BULLET_KEYS[m[1].toLowerCase().replace(/\s+/g, ' ').trim()];
            if (!k) return { raw: line };
            return { key: k, value: m[2], raw: line };
        });
    }

    // Pull "PIN code ... 148001" out of an address clause so the digits never
    // merge into house/street text.
    var PIN_IN_CLAUSE = /\b(?:pin\s*code|pincode|zip(?:\s*code)?|postal\s*code|पिन(?:\s*कोड)?)\b[\s\S]{0,15}?(\d{6})\b/i;

    var DEVA_DIGITS = '०१२३४५६७८९';
    function parse(text) {
        // Wispr can emit Devanagari digits (०-९); JS \d only sees ASCII.
        text = text.replace(/[०-९]/g, function (d) { return String(DEVA_DIGITS.indexOf(d)); });
        var fills = [];
        var asks = [];
        var clauses = [];
        splitLines(text).forEach(function (item) {
            if (!item.key) {
                splitClauses(item.raw).forEach(function (c) { clauses.push(c); });
                return;
            }
            var value = lightClean(item.value);
            if (!value) {
                asks.push({ key: item.key, clause: item.raw, question: (FIELDS.find(function (f) { return f.key === item.key; }) || { label: item.key }).label + ' ke liye value nahi mili. Dobara bolna.' });
                return;
            }
            var check = validate(item.key, value, item.raw);
            if (check.ok) fills.push({ key: item.key, label: (FIELDS.find(function (f) { return f.key === item.key; }) || { label: item.key }).label, value: check.value });
            else asks.push({ key: item.key, clause: item.raw, question: check.question });
        });
        clauses.forEach(function (clause) {
            // A 6-digit PIN hiding inside a house/street/address clause becomes its own fill.
            var pinM = clause.match(PIN_IN_CLAUSE);
            if (pinM) {
                var hit = findField(clause);
                if (!hit || hit.field.key !== 'pincode') {
                    fills.push({ key: 'pincode', label: 'PIN code', value: pinM[1] });
                    clause = collapse((clause.slice(0, pinM.index) + ' ' + clause.slice(pinM.index + pinM[0].length)));
                    if (!clause || clause.replace(/[\W_]+/g, '').length < 2) return;
                }
            }
            var r = parseClause(clause);
            if (r.fill) fills.push(r.fill);
            else if (r.ask) {
                // "5A Extension Road, behind park" style: a verb-free fragment with no field name
                // right after an address-like value continues that value instead of becoming a question.
                var last = fills.length ? fills[fills.length - 1] : null;
                if (r.ask.key === null && last && CONTINUATION_KEYS.indexOf(last.key) !== -1 && !containsVerb(clause)) {
                    last.value = last.value + ', ' + clause.replace(/[\s.।,]+$/, '');
                } else {
                    asks.push(r.ask);
                }
            }
        });
        return { fills: fills, asks: asks };
    }

    return { parse: parse, FIELDS: FIELDS };
});
