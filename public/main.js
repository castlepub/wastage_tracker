// public/main.js

// 1) Static employee list
const employees = [
  "Guy","Dean","Henry","Bethany","Pero",
  "Paddy","Vaile","Nora","Melissa"
];

let items = [];
const form        = document.getElementById('wastage-form');
const msg         = document.getElementById('message');
const unitSel     = document.getElementById('unit');
const reasonSel   = document.getElementById('reason-select');
const reasonOther = document.getElementById('reason-other');

const empInput  = document.getElementById('employee');
const empSug    = document.getElementById('employee-suggestions');
const itemInput = document.getElementById('item');
const itemSug   = document.getElementById('item-suggestions');

// Helper to show suggestions under an input
function showSuggestions(inputEl, list, container) {
  const query = inputEl.value.toLowerCase();
  container.innerHTML = '';
  if (!query) { container.style.display = 'none'; return; }
  const matches = list.filter(v => v.toLowerCase().includes(query));
  if (!matches.length) { container.style.display = 'none'; return; }
  matches.forEach(v => {
    const div = document.createElement('div');
    div.textContent = v;
    div.addEventListener('click', () => {
      inputEl.value = v;
      container.style.display = 'none';
      inputEl.dispatchEvent(new Event('input'));
    });
    container.appendChild(div);
  });
  container.style.display = 'block';
}

// 2) Populate employee suggestions
showSuggestions(empInput, employees, empSug);
empInput.addEventListener('input', () => showSuggestions(empInput, employees, empSug));
document.addEventListener('click', e => {
  if (!empSug.contains(e.target) && e.target !== empInput) empSug.style.display = 'none';
});

// 3) Fetch items & populate item suggestions
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/items')
    .then(r => r.json())
    .then(data => { items = data.map(i => i.name); })
    .catch(() => console.error('Failed to load items'));
});
itemInput.addEventListener('input', () => showSuggestions(itemInput, items, itemSug));
document.addEventListener('click', e => {
  if (!itemSug.contains(e.target) && e.target !== itemInput) itemSug.style.display = 'none';
});

// 4) Set default unit when item selected
itemInput.addEventListener('input', () => {
  const name = itemInput.value;
  fetch('/api/items')
    .then(r => r.json())
    .then(data => {
      const found = data.find(i => i.name === name);
      unitSel.value = found ? found.defaultUnit : '';
    });
});

// 5) Toggle "Other" reason input
reasonSel.addEventListener('change', () => {
  if (reasonSel.value === 'other') {
    reasonOther.style.display = 'block'; reasonOther.required = true;
  } else {
    reasonOther.style.display = 'none'; reasonOther.required = false; reasonOther.value = '';
  }
});

// 6) Submit form
form.addEventListener('submit', e => {
  e.preventDefault();
  msg.textContent = '';
  const reason = reasonSel.value === 'other' ? reasonOther.value : reasonSel.value;
  const payload = {
    employeeName: empInput.value,
    itemName:     itemInput.value,
    quantity:     parseFloat(document.getElementById('quantity').value),
    unit:         unitSel.value,
    reason:       reason || null
  };
  fetch('/api/entry', {
    method:  'POST',
    headers: {'Content-Type':'application/json'},
    body:    JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        msg.style.color = 'green'; msg.textContent = '✅ Wastage logged!';
        form.reset(); unitSel.value = '';
      } else {
        msg.style.color = 'red'; msg.textContent = '❌ ' + (res.error || 'Server error');
      }
    })
    .catch(() => {
      msg.style.color = 'red'; msg.textContent = '❌ Network error';
    });
});
