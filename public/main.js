// public/main.js
window.addEventListener('DOMContentLoaded', () => {
  // Employee list (no Justina)
  const employees = ["Guy","Dean","Henry","Bethany","Pero","Paddy","Vaile","Nora","Melissa"];
  const empInput = document.getElementById('employee');
  const empList  = document.getElementById('employee-list');
  const itemInput= document.getElementById('item');
  const itemList = document.getElementById('item-list');
  const unitSelect = document.getElementById('unit');

  // Utility: render suggestions
  function renderList(listEl, items) {
    listEl.innerHTML = '';
    items.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      li.addEventListener('click', () => {
        if (listEl === empList) empInput.value = text;
        else {
          itemInput.value = text;
          // set unit on select
          const found = window.itemsData.find(i => i.name === text);
          unitSelect.value = found ? found.defaultUnit : '';
        }
        listEl.style.display = 'none';
      });
      listEl.appendChild(li);
    });
    listEl.style.display = items.length ? 'block' : 'none';
  }

  // 1) Employee input handling
  empInput.addEventListener('input', () => {
    const val = empInput.value.toLowerCase();
    if (!val) return empList.style.display = 'none';
    const matches = employees.filter(e => e.toLowerCase().includes(val));
    renderList(empList, matches);
  });
  document.addEventListener('click', e => {
    if (e.target !== empInput) empList.style.display = 'none';
  });

  // 2) Fetch items
  window.itemsData = [];
  fetch('/api/items')
    .then(r => r.json())
    .then(data => window.itemsData = data)
    .catch(console.error);

  // 3) Item input handling
  itemInput.addEventListener('input', () => {
    const val = itemInput.value.toLowerCase();
    if (!val) return itemList.style.display = 'none';
    const names = window.itemsData.map(i => i.name);
    const matches = names.filter(n => n.toLowerCase().includes(val));
    renderList(itemList, matches);
  });
  document.addEventListener('click', e => {
    if (e.target !== itemInput) itemList.style.display = 'none';
  });

  // rest of form handlers (reason, submit) unchanged...
  const reasonSelect = document.getElementById('reason-select');
  const reasonOther  = document.getElementById('reason-other');
  reasonSelect.addEventListener('change', () => {
    if (reasonSelect.value === 'other') {
      reasonOther.style.display = 'block'; reasonOther.required = true;
    } else { reasonOther.style.display = 'none'; reasonOther.required = false; reasonOther.value = ''; }
  });
  
  const form = document.getElementById('wastage-form');
  const msg  = document.getElementById('message');
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
    fetch('/api/entry', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      .then(r=>r.json()).then(res=>{
        msg.style.color = res.success ? 'green' : 'red';
        msg.textContent = res.success ? '✅ Wastage logged!' : '❌ '+(res.error||'Server error');
        if(res.success){ form.reset(); unitSelect.value=''; }
      }).catch(()=>{ msg.style.color='red'; msg.textContent='❌ Network error'; });
  });
});
