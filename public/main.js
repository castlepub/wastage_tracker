// public/main.js

// List of employees
const employees = [
  "Guy","Dean","Henry","Bethany","Pero",
  "Paddy","Vaile","Nora","Melissa","Justina"
];

const form = document.getElementById('wastage-form');
const msg  = document.getElementById('message');

// 1) Populate employee datalist
const empDatalist = document.getElementById('employee-list');
employees.forEach(name => {
  const opt = document.createElement('option');
  opt.value = name;
  empDatalist.appendChild(opt);
});

// 2) Fetch items and populate item datalist
let items = [];
const itemDatalist = document.getElementById('item-list');

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
  .catch(() => {
    console.error('Failed to load items');
  });

// 3) Update unit when item is selected
const itemInput = document.getElementById('item');
itemInput.addEventListener('input', () => {
  const entry = items.find(i => i.name === itemInput.value);
  document.getElementById('unit').value = entry ? entry.defaultUnit : '';
});

// 4) Handle form submission
form.addEventListener('submit', e => {
  e.preventDefault();

  const payload = {
    employeeName: document.getElementById('employee').value,
    itemName:     document.getElementById('item').value,
    quantity:     parseFloat(document.getElementById('quantity').value),
    unit:         document.getElementById('unit').value,
    reason:       document.getElementById('reason').value || null
  };

  fetch('/api/entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        msg.textContent = '✅ Wastage logged!';
        msg.style.color = 'green';
        form.reset();
      } else {
        msg.textContent = '❌ ' + (res.error || 'Unknown error');
        msg.style.color = 'red';
      }
    })
    .catch(err => {
      msg.textContent = '❌ Network error';
      msg.style.color = 'red';
      console.error(err);
    });
});
