// public/main.js
window.addEventListener('DOMContentLoaded', () => {
  const empInput = document.getElementById('employee');
  const empList  = document.getElementById('employee-list');
  const itemInput= document.getElementById('item');
  const itemList = document.getElementById('item-list');
  const unitSelect = document.getElementById('unit');
  const reasonSelect= document.getElementById('reason-select');
  const reasonOther = document.getElementById('reason-other');
  const form = document.getElementById('wastage-form');
  const msg  = document.getElementById('message');

  // Employee data (no Justina)
  const employees = ["Guy","Dean","Henry","Bethany","Pero","Paddy","Vaile","Nora","Melissa"];

  // Utility: setup autocomplete with arrow navigation
  function setupAutocomplete(inputEl, listEl, data, onSelect) {
    let currentIndex = -1;

    function updateList(filter) {
      listEl.innerHTML = '';
      const matches = data.filter(v => v.toLowerCase().includes(filter.toLowerCase()));
      matches.forEach(v => {
        const li = document.createElement('li');
        li.textContent = v;
        li.addEventListener('mousedown', () => onSelect(v));
        listEl.appendChild(li);
      });
      currentIndex = -1;
      listEl.style.display = matches.length ? 'block' : 'none';
    }

    inputEl.addEventListener('input', () => updateList(inputEl.value));
    inputEl.addEventListener('keydown', e => {
      const items = listEl.querySelectorAll('li');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentIndex = (currentIndex + 1) % items.length;
        items.forEach((li,i) => li.classList.toggle('highlight', i === currentIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentIndex = (currentIndex - 1 + items.length) % items.length;
        items.forEach((li,i) => li.classList.toggle('highlight', i === currentIndex));
      } else if (e.key === 'Enter') {
        if (currentIndex >= 0) {
          e.preventDefault();
          onSelect(items[currentIndex].textContent);
        }
      }
    });

    document.addEventListener('click', e => {
      if (e.target !== inputEl) listEl.style.display = 'none';
    });
  }

  // 1) Employee autocomplete
  setupAutocomplete(empInput, empList, employees, val => {
    empInput.value = val;
    empList.style.display = 'none';
  });

  // 2) Fetch items & setup autocomplete
  window.itemsData = [];
  fetch('/api/items')
    .then(r => r.json())
    .then(data => {
      itemsData = data;
      const names = data.map(i => i.name);
      setupAutocomplete(itemInput, itemList, names, val => {
        itemInput.value = val;
        itemList.style.display = 'none';
        const found = data.find(i => i.name === val);
        unitSelect.value = found ? found.defaultUnit : '';
      });
    })
    .catch(console.error);

  // 3) Toggle "Other" reason
  reasonSelect.addEventListener('change', () => {
    if (reasonSelect.value === 'other') {
      reasonOther.style.display = 'block'; reasonOther.required = true;
    } else {
      reasonOther.style.display = 'none'; reasonOther.required = false; reasonOther.value = '';
    }
  });

  // 4) Form submit
  form.addEventListener('submit', e => {
    e.preventDefault(); msg.textContent = '';
    const reason = reasonSelect.value === 'other' ? reasonOther.value.trim() : reasonSelect.value;
    const payload = {
      employeeName: empInput.value,
      itemName:     itemInput.value,
      quantity:     parseFloat(document.getElementById('quantity').value),
      unit:         unitSelect.value,
      reason:       reason || null
    };
    fetch('/api/entry', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
      .then(r=>r.json()).then(res=>{
        msg.style.color = res.success ? 'green' : 'red';
        msg.textContent = res.success ? '✅ Wastage logged!' : '❌ '+(res.error||'Server error');
        if(res.success){ form.reset(); unitSelect.value=''; }
      }).catch(()=>{ msg.style.color='red'; msg.textContent='❌ Network error'; });
  });
});
