// public/main.js

window.addEventListener('DOMContentLoaded', () => {
  // 1) Static employee list (Justina removed)
  const employees = [
    "Guy","Dean","Henry","Bethany","Pero",
    "Paddy","Vaile","Nora","Melissa"
  ];
  const empList = document.getElementById('employee-list');
  employees.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    empList.appendChild(opt);
  });

  // 2) Fetch items & populate item datalist
  let items = [];
  const itemList = document.getElementById('item-list');
  fetch('/api/items')
    .then(res => res.json())
    .then(data => {
      items = data; // [{ name, defaultUnit }, ...]
      data.forEach(({ name }) => {
        const opt = document.createElement('option');
        opt.value = name;
        itemList.appendChild(opt);
      });
    })
    .catch(err => console.error('Failed to load items:', err));

  // 3) Set default unit on item selection
  const itemInput  = document.getElementById('item');
  const unitSelect = document.getElementById('unit');
  itemInput.addEventListener('input', () => {
    const found = items.find(i => i.name === itemInput.value);
    unitSelect.value = found ? found.defaultUnit : '';
  });

  // 4) Toggle "Other" reason field
  const reasonSelect = document.getElementById('reason-select');
  const reasonOther  = document.getElementById('reason-other');
  reasonSelect.addEventListener('change', () => {
    if (reasonSelect.value === 'other') {
      reasonOther.style.display = 'block'; reasonOther.required = true;
    } else {
      reasonOther.style.display = 'none'; reasonOther.required = false;
      reasonOther.value = '';
    }
  });

  // 5) Submit form
  const form = document.getElementById('wastage-form');
  const msg  = document.getElementById('message');
  form.addEventListener('submit', e => {
    e.preventDefault();
    msg.textContent = '';

    const reason = reasonSelect.value === 'other'
      ? reasonOther.value.trim()
      : reasonSelect.value;

    const payload = {
      employeeName: document.getElementById('employee').value,
      itemName:     itemInput.value,
      quantity:     parseFloat(document.getElementById('quantity').value),
      unit:         unitSelect.value,
      reason:       reason || null
    };

    fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          msg.style.color = 'green'; msg.textContent = '✅ Wastage logged!';
          form.reset(); unitSelect.value = '';
        } else {
          msg.style.color = 'red'; msg.textContent = '❌ ' + (res.error || 'Server error');
        }
      })
      .catch(() => {
        msg.style.color = 'red'; msg.textContent = '❌ Network error';
      });
  });
});
