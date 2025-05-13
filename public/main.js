// public/main.js

// 1) Employee list (static)
const employees = [
  "Guy","Dean","Henry","Bethany","Pero",
  "Paddy","Vaile","Nora","Melissa","Justina"
];

// Form elements
const form       = document.getElementById('wastage-form');
const msg        = document.getElementById('message');
const empDatalist = document.getElementById('employee-list');
const itemDatalist = document.getElementById('item-list');
const unitSelect  = document.getElementById('unit');
const reasonSelect = document.getElementById('reason-select');
const reasonOther  = document.getElementById('reason-other');

// 2) Populate employee datalist
employees.forEach(name => {
  const opt = document.createElement('option');
  opt.value = name;
  empDatalist.appendChild(opt);
});

// 3) Fetch items & populate item datalist
let items = [];
fetch('/api/items')
  .then(r => r.json())
  .then(data => {
    items = data;
    data.forEach(({ name }) => {
      const opt = document.createElement('option');
      opt.value = name;
      itemDatalist.appendChild(opt);
    });
  })
  .catch(() => console.error('Failed to load items'));

// 4) When selecting an item, set unit to its default
document.getElementById('item').addEventListener('input', e => {
  const entry = items.find(i => i.name === e.target.value);
  unitSelect.value = entry?.defaultUnit || '';
});

// 5) Toggle “Other” reason input
reasonSelect.addEventListener('change', e => {
  if (e.target.value === 'other') {
    reasonOther.style.display = 'inline-block';
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

  // Determine final reason
  const reason = (reasonSelect.value === 'other')
    ? reasonOther.value.trim()
    : reasonSelect.value;

  const payload = {
    employeeName: document.getElementById('employee').value,
    itemName:     document.getElementById('item').value,
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
