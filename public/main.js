// public/main.js

const employees = [
  "Guy","Dean","Henry","Bethany","Pero",
  "Paddy","Vaile","Nora","Melissa"
];
let items = [];

const form      = document.getElementById('wastage-form');
const msg       = document.getElementById('message');
const unitSel   = document.getElementById('unit');
const reasonSel = document.getElementById('reason-select');
const reasonOther = document.getElementById('reason-other');

const empInput    = document.getElementById('employee');
const empSug      = document.getElementById('employee-suggestions');
const itemInput   = document.getElementById('item');
const itemSug     = document.getElementById('item-suggestions');

// Show a filtered suggestion list under input
function showSuggestions(inputEl, suggestions, container) {
  const val = inputEl.value.toLowerCase();
  container.innerHTML = '';
  if (!val) { container.style.display = 'none'; return; }
  const matches = suggestions.filter(s => s.toLowerCase().includes(val));
  if (matches.length === 0) { container.style.display = 'none'; return; }
  matches.forEach(text => {
    const div = document.createElement('div');
    div.textContent = text;
    div.onclick = () => {
      inputEl.value = text;
      container.style.display = 'none';
      inputEl.dispatchEvent(new Event('input'));
    };
    container.appendChild(div);
  });
  container.style.display = 'block';
}

// 1) Employee autocomplete
empInput.addEventListener('input', () =>
  showSuggestions(empInput, employees, empSug)
);
document.addEventListener('click', e => {
  if (!empSug.contains(e.target) && e.target !== empInput)
    empSug.style.display = 'none';
});

// 2) Fetch items & autocomplete
fetch('/api/items')
  .then(r => r.json())
  .then(data => { items = data.map(i => i.name); })
  .catch(() => console.error('Failed to load items'));

itemInput.addEventListener('input', () =>
  showSuggestions(itemInput, items, itemSug)
);
document.addEventListener('click', e => {
  if (!itemSug.contains(e.target) && e.target !== itemInput)
    itemSug.style.display = 'none';
});

// 3) Set default unit when item is selected
itemInput.addEventListener('input', () => {
  if (!items.includes(itemInput.value)) { unitSel.value = ''; return; }
  fetch('/api/items')
    .then(r => r.json())
    .then(data => {
      const found = data.find(i => i.name === itemInput.value);
      unitSel.value = found ? found.defaultUnit : '';
    });
});

// 4) Toggle “Other” reason
reasonSel.addEventListener('change', () => {
  if (reasonSel.value === 'other') {
    reasonOther.style.display = 'block'; reasonOther.required = true;
  } else {
    reasonOther.style.display = 'none'; reasonOther.required = false;
    reasonOther.value = '';
  }
});

// 5) Submit
form.addEventListener('submit', e => {
  e.preventDefault();
  const reason = reasonSel.value === 'other' ? reasonOther.value : reasonSel.value;
  const payload = {
    employeeName: empInput.value,
    itemName:     itemInput.value,
    quantity:     parseFloat(document.getElementById('quantity').value),
    unit:         unitSel.value,
    reason:       reason || null
  };
  fetch('/api/entry', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        msg.style.color = 'green'; msg.textContent = '✅ Wastage logged!';
        form.reset(); unitSel.value = '';
      } else {
        msg.style.color = 'red'; msg.textContent = '❌ ' + (res.error||'Server error');
      }
    })
    .catch(() => {
      msg.style.color = 'red'; msg.textContent = '❌ Network error';
    });
});
