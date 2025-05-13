// public/main.js

// 1) Static employee list
const employees = [
  "Guy","Dean","Henry","Bethany","Pero",
  "Paddy","Vaile","Nora","Melissa"
];

// DOM refs
const empDatalist = document.getElementById('employee-list');
const itemDatalist= document.getElementById('item-list');
const empInput    = document.getElementById('employee');
const itemInput   = document.getElementById('item');
const unitSelect  = document.getElementById('unit');
const form        = document.getElementById('wastage-form');
const msg         = document.getElementById('message');
const reasonSelect= document.getElementById('reason-select');
const reasonOther = document.getElementById('reason-other');

// 2) Populate employee datalist
employees.forEach(name => {
  const opt = document.createElement('option');
  opt.value = name;
  empDatalist.appendChild(opt);
});

// 3) Fetch items & populate datalist
let items = [];
fetch('/api/items')
  .then(res => res.json())
  .then(data => {
    items = data; // array of { name, defaultUnit }
    data.forEach(({ name }) => {
      const opt = document.createElement('option');
      opt.value = name;
      itemDatalist.appendChild(opt);
    });
  })
  .catch(err => console.error('Failed to load items:', err));

// 4) When item input changes, set default unit
itemInput.addEventListener('input', () => {
  const found = items.find(i => i.name === itemInput.value);
  unitSelect.value = found ? found.defaultUnit : '';
});

// 5) Toggle “Other…” reason field
reasonSelect.addEventListener('change', () => {
  if (reasonSelect.value === 'other') {
    reasonOther.style.display = 'block';
    reasonOther.required = true;
  } else {
    reasonOther.style.display = 'none';
    reasonOther.required = false;
    reasonOther.value = '';
  }
});

// 6) Handle form submission
form.addEventListener('submit', e => {
  e.preventDefault();
  msg.textContent = '';  

  const reason = reasonSelect.value === 'other'
    ? reasonOther.value.trim()
    : reasonSelect.value;

  const payload = {
    employeeName: empInput.value,
    itemName:     itemInput.value,
    quantity:     parseFloat(document.getElementById('quantity').value),
    unit:         unitSelect.value,
    reason:       reason || null
  };

  fetch('/api/entry', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        msg.style.color = 'green';
        msg.textContent = '✅ Wastage logged!';
        form.reset();
        unitSelect.value = '';
      } else {
        msg.style.color = 'red';
        msg.textContent = '❌ ' + (res.error || 'Server error');
      }
    })
    .catch(() => {
      msg.style.color = 'red';
      msg.textContent = '❌ Network error';
    });
});
