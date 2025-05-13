// public/main.js
const employees = ["Guy","Dean","Henry","Bethany","Pero","Paddy","Vaile","Nora","Melissa","Justina"];
const form = document.getElementById('wastage-form');
const msg  = document.getElementById('message');

// Populate employee dropdown
const empSelect = document.getElementById('employee');
employees.forEach(name => {
  const opt = document.createElement('option');
  opt.value = name;
  opt.text  = name;
  empSelect.add(opt);
});

// Fetch items & default units
let items = [];
fetch('/api/items')
  .then(res => res.json())
  .then(data => {
    items = data;
    const itemSelect = document.getElementById('item');
    const unitSelect = document.getElementById('unit');
    data.forEach(({ name, defaultUnit }) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.text  = name;
      itemSelect.add(opt);
    });
    // On item change, set unit
    itemSelect.addEventListener('change', () => {
      const selected = data.find(i => i.name === itemSelect.value);
      unitSelect.value = selected.defaultUnit;
    });
    // Initialize first unit
    unitSelect.value = data[0]?.defaultUnit || 'pcs';
  });

// Handle form submission
form.addEventListener('submit', e => {
  e.preventDefault();
  const payload = {
    employeeName: empSelect.value,
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
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        msg.textContent = '✅ Wastage logged!';
        form.reset();
      } else {
        msg.textContent = '❌ Error: ' + res.error;
      }
    });
});
