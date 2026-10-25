const p = require(__dirname + '/../parser.js');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
function fill(r, key) { const f = r.fills.find(x => x.key === key); return f && f.value; }

let r = p.parse('mera naam Rahul Sharma hai, pita ka naam Suresh Sharma, janm tithi 21/11/2001');
check('narration name', fill(r,'name')==='Rahul Sharma');
check('narration father', fill(r,'father')==='Suresh Sharma');
check('narration dob', fill(r,'dob')==='21/11/2001');
check('narration no asks', r.asks.length===0);

r = p.parse('name field me Rahul Sharma bhar do');
check('directed name', fill(r,'name')==='Rahul Sharma');

r = p.parse('phone me 94 daal do');
check('incomplete phone asks', r.asks.length===1 && r.asks[0].key==='phone');
check('incomplete phone not filled', !fill(r,'phone'));

r = p.parse('DOB me 21 November 2001 daal do, address 12 Model Town Delhi likho');
check('month name dob', fill(r,'dob')==='21/11/2001');
check('address directed', fill(r,'address')==='12 Model Town Delhi');

r = p.parse('मेरा नाम राहुल शर्मा है, पिता का नाम सुरेश शर्मा, जन्म तिथि 21/11/2001');
check('devanagari name', fill(r,'name')==='राहुल शर्मा');
check('devanagari father', fill(r,'father')==='सुरेश शर्मा');
check('devanagari dob', fill(r,'dob')==='21/11/2001');

r = p.parse('मोबाइल नंबर 9876543210 डाल दो');
check('devanagari phone', fill(r,'phone')==='9876543210');

r = p.parse('phone number wapas likho 9876543210');
check('correction phone', fill(r,'phone')==='9876543210');

r = p.parse('date of birth 21/11/2026 ऐसे है और phone number 94');
check('mixed dob', fill(r,'dob')==='21/11/2026');
check('mixed phone asks', r.asks.length===1 && r.asks[0].key==='phone');

r = p.parse('PAN card me year 2024 bhar do');
check('unknown field asks', r.asks.length===1 && r.asks[0].key===null);

r = p.parse('gender female daal do');
check('gender female not male', fill(r,'gender')==='female');
r = p.parse('gender male');
check('gender male', fill(r,'gender')==='male');
r = p.parse('ling mahila');
check('gender devanagari', fill(r,'gender')==='female');

r = p.parse('email me rahul@gmail.com likho');
check('email with dot', fill(r,'email')==='rahul@gmail.com');
r = p.parse('email rahul.sharma@gmail.com');
check('email dotted name', fill(r,'email')==='rahul.sharma@gmail.com');

r = p.parse('naam badal do Rahul Verma aur phone 9123456780 daal do');
check('multi field any order', fill(r,'name')==='Rahul Verma' && fill(r,'phone')==='9123456780');

r = p.parse('annual income 3 lakh bhar do, purpose scholarship, occupation student hai');
check('income', fill(r,'income')==='3 lakh');
check('purpose', fill(r,'purpose')==='scholarship');
check('occupation', fill(r,'occupation')==='student');

console.log("suite1: " + pass + " passed, " + fail + " failed");


// --- address distribution (Snitch-style use case, dummy values) ---
r = p.parse('house 5A Extension Road, behind park, street Angel Road, pincode 110034');
check('house with comma continuation', fill(r,'house')==='5A Extension Road, behind park');
check('street directed', fill(r,'street')==='Angel Road');
check('pincode directed', fill(r,'pincode')==='110034');
check('address split no asks', r.asks.length===0);

r = p.parse('pincode 13');
check('incomplete pin asks', r.asks.length===1 && r.asks[0].key==='pincode');
check('incomplete pin not filled', !fill(r,'pincode'));

r = p.parse('city Delhi, state Haryana');
check('city parse', fill(r,'city')==='Delhi');
check('state parse', fill(r,'state')==='Haryana');

r = p.parse('110034');
check('bare 6-digit is pincode', fill(r,'pincode')==='110034');
r = p.parse('9876501234');
check('bare 10-digit is phone', fill(r,'phone')==='9876501234');

// --- regression: first real-site test (Snitch add-address), dummy values ---
r = p.parse('- Name: Rahul Sharma\n- House: 452A\n- Street: Model Town Phase 2\n- PIN code: 148001\n- Phone number: 9876501234');
check('bullet name', fill(r,'name')==='Rahul Sharma');
check('bullet house intact', fill(r,'house')==='452A');
check('bullet street', fill(r,'street')==='Model Town Phase 2');
check('bullet pincode', fill(r,'pincode')==='148001');
check('bullet phone', fill(r,'phone')==='9876501234');

r = p.parse('house 452A, street Green Colony');
check('alphanumeric house kept', fill(r,'house')==='452A');

r = p.parse('Green Colony PIN code 4: 148001');
check('pin rescued from address clause', fill(r,'pincode')==='148001');
check('street without pin digits', fill(r,'street') && fill(r,'street').indexOf('148001')===-1);

r = p.parse('PIN code 4: 209625');
check('stray digit before pin rescued', fill(r,'pincode')==='209625');

// --- regression: second real-site failure (full directed bullet transcript, dummy values) ---
r = p.parse('- House flat number apartment name में 2A Block 45 भरो\n- Street area में Shanti का Colony\n- Pin code में 148001\n- City Rampura\n- State में Punjab\n- Name में Rahul Sharma\n- Phone number में 9876501234');
check('directed long house label', fill(r,'house')==='2A Block 45');
check('street keeps ka and colony', fill(r,'street')==='Shanti का Colony');
check('directed pincode', fill(r,'pincode')==='148001');
check('city without connector', fill(r,'city')==='Rampura');
check('directed state', fill(r,'state')==='Punjab');
check('directed name', fill(r,'name')==='Rahul Sharma');
check('directed phone', fill(r,'phone')==='9876501234');
check('full transcript no asks', r.asks.length===0);

r = p.parse('street Green Colony');
check('colony in value preserved', fill(r,'street')==='Green Colony');

// --- regression: house/flat ID separators must survive as dictated ---
r = p.parse('- House number में भरो: 2A/45');
check('house slash ID kept', fill(r,'house')==='2A/45');
r = p.parse('house 2A-45');
check('house dash ID kept', fill(r,'house')==='2A-45');
r = p.parse('street Omaxe-2 Colony');
check('street hyphen kept', fill(r,'street')==='Omaxe-2 Colony');

console.log('TOTAL: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
