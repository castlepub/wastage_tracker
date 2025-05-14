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
  const submitBtn = form.querySelector('button[type="submit"]');
  const quantityInput = document.getElementById('quantity');

  // Employee data (no Justina)
  const employees = ["Guy","Dean","Henry","Bethany","Pero","Paddy","Vaile","Nora","Melissa"];

  // Show loading/error state
  function showMessage(text, type = 'info') {
    msg.textContent = text;
    msg.style.color = type === 'error' ? 'red' : type === 'success' ? 'green' : 'black';
  }

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
  showMessage('Loading items...');
  fetch('/api/items')
    .then(r => {
      if (!r.ok) throw new Error('Failed to fetch items');
      return r.json();
    })
    .then(data => {
      itemsData = data;
      const names = data.map(i => i.name);
      setupAutocomplete(itemInput, itemList, names, val => {
        itemInput.value = val;
        itemList.style.display = 'none';
        const found = data.find(i => i.name === val);
        if (found) {
          unitSelect.value = found.defaultUnit;
          // Disable other units to prevent mismatches
          Array.from(unitSelect.options).forEach(opt => {
            opt.disabled = opt.value !== '' && opt.value !== found.defaultUnit;
          });
        }
      });
      showMessage(''); // Clear loading message
    })
    .catch(err => {
      console.error('Failed to load items:', err);
      showMessage('Failed to load items. Please refresh the page.', 'error');
    });

  // Input validation
  quantityInput.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    if (isNaN(value) || value <= 0) {
      e.target.setCustomValidity('Quantity must be a positive number');
    } else {
      e.target.setCustomValidity('');
    }
  });

  // 3) Toggle "Other" reason
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

  // Add reset button
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Clear Form';
  resetBtn.className = 'reset-button';
  resetBtn.onclick = () => {
    form.reset();
    msg.textContent = '';
    unitSelect.value = '';
    Array.from(unitSelect.options).forEach(opt => opt.disabled = false);
    reasonOther.style.display = 'none';
  };
  form.appendChild(resetBtn);

  // 4) Form submit with validation
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';

    // Validate employee
    if (!employees.includes(empInput.value)) {
      showMessage('Please select a valid employee from the list', 'error');
      empInput.focus();
      return;
    }

    // Validate item
    const selectedItem = itemsData.find(i => i.name === itemInput.value);
    if (!selectedItem) {
      showMessage('Please select a valid item from the list', 'error');
      itemInput.focus();
      return;
    }

    // Validate unit matches item
    if (unitSelect.value !== selectedItem.defaultUnit) {
      showMessage(`Please use ${selectedItem.defaultUnit} for ${selectedItem.name}`, 'error');
      unitSelect.focus();
      return;
    }

    const reason = reasonSelect.value === 'other' ? reasonOther.value.trim() : reasonSelect.value;
    if (reasonSelect.value === 'other' && !reason) {
      showMessage('Please provide a reason', 'error');
      reasonOther.focus();
      return;
    }

    // Prepare payload
    const payload = {
      employeeName: empInput.value,
      itemName: itemInput.value,
      quantity: parseFloat(quantityInput.value),
      unit: unitSelect.value,
      reason: reason || null
    };

    // Disable form during submission
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging...';
    
    try {
      const response = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      
      if (result.success) {
        showMessage('✅ Wastage logged!', 'success');
        form.reset();
        unitSelect.value = '';
        Array.from(unitSelect.options).forEach(opt => opt.disabled = false);
        reasonOther.style.display = 'none';
      } else {
        showMessage(`❌ ${result.error || 'Failed to log wastage'}`, 'error');
      }
    } catch (err) {
      console.error('Network error:', err);
      showMessage('❌ Network error. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log Wastage';
    }
  });
});
