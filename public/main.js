/ public/main.js
const employees = ["Guy","Dean","Henry","Bethany","Pero","Paddy","Vaile","Nora","Melissa","Justina"];
const form = document.getElementById('wastage-form');
const msg  = document.getElementById('message');

// Populate employee dropdown
const empSelect = document.getElementById('employee');
employees.forEach(name => {
  const opt = document.createElement('option'); opt.value = name; opt.text = name;
  empSelect.add(opt);
});

// Fetch items & populate datalist
let items = [];
fetch('/api/items')
  .then(r => r.json())
  .then(data => {
    items = data;
    const list = document.getElementById('item-list');
    data.forEach(({ name, defaultUnit }) => {
      const opt = document.createElement('option');
      opt.value = name;
      list.appendChild(opt);
    });
  });

// Update unit when item selected
const itemInput = document.getElementById('item');
itemInput.addEventListener('input', () => {
  const entry = items.find(i => i.name === itemInput.value);
  document.getElementById('unit').value = entry?.defaultUnit || '';
});

// Handle form submit
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
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(res => {
    msg.textContent = res.success ? '✅ Wastage logged!' : `❌ ${res.error}`;
    if(res.success) form.reset();
  });
});
