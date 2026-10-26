// Stress suite: malformed, mixed-language, boundary and hostile-shaped inputs.
// Asserts intended behavior; a FAIL here is a real bug to fix, not to tune away.
const p = require(__dirname + '/../parser.js');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
function fill(r, key) { const f = r.fills.find(x => x.key === key); return f && f.value; }

// --- malformed input must never crash and never invent fills ---
['', '   ', '...', '!!! ???', '\n\n\n', 'asdf qwer zxcv', '123', '😀😀😀'].forEach(function (t, i) {
    let threw = false, r = null;
    try { r = p.parse(t); } catch (e) { threw = true; }
    check('malformed ' + i + ' no crash', !threw);
    check('malformed ' + i + ' no invented fills', r && r.fills.length === 0);
});

// --- perf: huge transcript stays fast ---
let big = 'mera naam Rahul Sharma hai, gali number 5 Model Town, '.repeat(400);
let t0 = Date.now();
p.parse(big);
let ms = Date.now() - t0;
check('400-clause transcript parses under 2000ms (got ' + ms + 'ms)', ms < 2000);

// --- PIN boundaries: 5 and 7 digits must ask, never guess ---
let r = p.parse('pincode 20962');
check('5-digit PIN asks', r.asks.some(a => a.key === 'pincode') && !fill(r, 'pincode'));
r = p.parse('pincode 2096257');
check('7-digit PIN asks', r.asks.some(a => a.key === 'pincode') && !fill(r, 'pincode'));
r = p.parse('pin code २०९६२५');
check('Devanagari-digit PIN fills', fill(r, 'pincode') === '209625');

// --- phone boundaries ---
r = p.parse('phone +91 98765 01234');
check('+91 spaced phone normalizes', fill(r, 'phone') === '9876501234');
r = p.parse('phone 09876501234');
check('0-prefixed 11-digit phone normalizes', fill(r, 'phone') === '9876501234');
r = p.parse('phone 12345');
check('5-digit phone asks', r.asks.some(a => a.key === 'phone') && !fill(r, 'phone'));

// --- date boundaries ---
r = p.parse('dob 21-11-2001');
check('dash date', fill(r, 'dob') === '21/11/2001');
r = p.parse('dob 21.11.2001');
check('dot date', fill(r, 'dob') === '21/11/2001');
r = p.parse('dob 2001-11-21');
check('ISO date not misread', fill(r, 'dob') === '21/11/2001');
r = p.parse('dob 21/11/01');
check('2-digit year asks for the full year (no century guess)', r.asks.some(a => a.key === 'dob') && !fill(r, 'dob'));
r = p.parse('dob 21/11/99');
check('2-digit year 99 also asks, never 1999-by-default', r.asks.some(a => a.key === 'dob') && !fill(r, 'dob'));
r = p.parse('dob 31/13/2001');
check('month 13 asks', r.asks.some(a => a.key === 'dob') && !fill(r, 'dob'));
r = p.parse('dob 30/02/2001');
check('30 Feb is asked about not filled', r.asks.some(a => a.key === 'dob'));

// --- narration: mid-clause field words are labels only after possessives ---
r = p.parse('mera naam Rahul hai');
check('possessive narration still parses', fill(r, 'name') === 'Rahul');
r = p.parse('address 12 MG Road, near City Hospital');
check('near-phrase continues the address', fill(r, 'address') === '12 MG Road, near City Hospital');
check('near-phrase does not invent a city', !fill(r, 'city'));
r = p.parse('near City Hospital');
check('lone near-phrase asks instead of mangling city', r.asks.length === 1 && !fill(r, 'city'));

// --- conflicts and duplicates never silently overwrite ---
r = p.parse('- Name: Rahul Sharma\n- Name: Rohit Verma');
check('duplicate name keeps BOTH values for the matcher conflict-ask', r.fills.filter(x => x.key === 'name').length === 2);

// --- command words inside values are just words ---
r = p.parse('street me Sahi Hai Colony bhar do');
check('interior command-looking words stay in the value', fill(r, 'street') === 'Sahi Hai Colony');

// --- emoji and punctuation stripped from values ---
r = p.parse('name me Rahul Sharma 😀 bhar do');
check('emoji stripped', fill(r, 'name') === 'Rahul Sharma');

// --- gender map ---
r = p.parse('gender mahila');
check('mahila -> female', fill(r, 'gender') === 'female');
r = p.parse('ling aadmi');
check('aadmi -> male', fill(r, 'gender') === 'male');
r = p.parse('gender kuch bhi naya');
check('unknown gender asks', r.asks.some(a => a.key === 'gender'));

// --- email ---
r = p.parse('email rahul.sharma@gmail.com');
check('plain email fills', fill(r, 'email') === 'rahul.sharma@gmail.com');
r = p.parse('email nahi hai mere paas');
check('garbage email asks', r.asks.some(a => a.key === 'email') && !fill(r, 'email'));

console.log('STRESS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
