// public/main.js
window.addEventListener('DOMContentLoaded', () => {
  const empInput = document.getElementById('employee');
  const empList = document.getElementById('employee-list');
  const itemInput = document.getElementById('item');
  const itemList = document.getElementById('item-list');
  const unitSelect = document.getElementById('unit');
  const reasonSelect = document.getElementById('reason-select');
  const reasonOther = document.getElementById('reason-other');
  const form = document.getElementById('wastage-form');
  const msg = document.getElementById('message');
  const submitBtn = form.querySelector('button[type="submit"]');
  const quantityInput = document.getElementById('quantity');

  // Employee data (no Justina)
  const employees = ["Guy", "Dean", "Henry", "Bethany", "Pero", "Paddy", "Vaile", "Nora", "Melissa"];

  // Show message with type (success/error/info)
  function showMessage(text, type = 'info') {
    msg.textContent = text;
    msg.className = type;
    
    if (type === 'success') {
      setTimeout(() => {
        msg.textContent = '';
        msg.className = '';
      }, 3000);
    }
  }

  // Utility: setup autocomplete with improved matching
  function setupAutocomplete(inputEl, listEl, data, onSelect) {
    let currentIndex = -1;
    let lastFilter = '';

    function fuzzyMatch(str, pattern) {
      const string = str.toLowerCase();
      const search = pattern.toLowerCase();
      let j = 0;
      for (let i = 0; i < string.length && j < search.length; i++) {
        if (string[i] === search[j]) {
          j++;
        }
      }
      return j === search.length;
    }

    function updateList(filter) {
      if (filter === lastFilter) return;
      lastFilter = filter;
      
      listEl.innerHTML = '';
      if (!filter.trim()) {
        listEl.style.display = 'none';
        return;
      }

      const matches = data
        .filter(v => fuzzyMatch(v, filter))
        .sort((a, b) => {
          // Exact matches first, then startsWith, then contains
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const filterLower = filter.toLowerCase();
          
          if (aLower === filterLower) return -1;
          if (bLower === filterLower) return 1;
          if (aLower.startsWith(filterLower) && !bLower.startsWith(filterLower)) return -1;
          if (bLower.startsWith(filterLower) && !aLower.startsWith(filterLower)) return 1;
          return a.localeCompare(b);
        });

      matches.forEach(v => {
        const li = document.createElement('li');
        // Highlight matching part
        const index = v.toLowerCase().indexOf(filter.toLowerCase());
        if (index !== -1) {
          const before = v.substring(0, index);
          const match = v.substring(index, index + filter.length);
          const after = v.substring(index + filter.length);
          li.innerHTML = before + '<strong>' + match + '</strong>' + after;
        } else {
          li.textContent = v;
        }
        
        li.addEventListener('mousedown', () => onSelect(v));
        listEl.appendChild(li);
      });

      currentIndex = -1;
      listEl.style.display = matches.length ? 'block' : 'none';
    }

    // Debounce input updates
    let timeout;
    inputEl.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => updateList(inputEl.value), 150);
    });

    inputEl.addEventListener('keydown', e => {
      const items = listEl.querySelectorAll('li');
      if (!items.length) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.key === 'ArrowDown') {
          currentIndex = (currentIndex + 1) % items.length;
        } else {
          currentIndex = (currentIndex - 1 + items.length) % items.length;
        }
        items.forEach((li, i) => li.classList.toggle('highlight', i === currentIndex));
        
        // Scroll into view if needed
        const highlighted = items[currentIndex];
        if (highlighted) {
          if (highlighted.offsetTop < listEl.scrollTop) {
            listEl.scrollTop = highlighted.offsetTop;
          } else if (highlighted.offsetTop + highlighted.offsetHeight > listEl.scrollTop + listEl.offsetHeight) {
            listEl.scrollTop = highlighted.offsetTop + highlighted.offsetHeight - listEl.offsetHeight;
          }
        }
      } else if (e.key === 'Enter' && currentIndex >= 0) {
        e.preventDefault();
        onSelect(items[currentIndex].textContent);
      } else if (e.key === 'Escape') {
        listEl.style.display = 'none';
        inputEl.blur();
      }
    });

    // Close list when clicking outside
    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
        listEl.style.display = 'none';
      }
    });

    // Mark as touched on blur for validation
    inputEl.addEventListener('blur', () => {
      inputEl.classList.add('touched');
    });
  }

  // 1) Employee autocomplete
  setupAutocomplete(empInput, empList, employees, val => {
    empInput.value = val;
    empList.style.display = 'none';
    empInput.classList.add('touched');
  });

  // 2) Fetch items & setup autocomplete
  window.itemsData = [];
  showMessage('Loading items...', 'info');
  
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
        itemInput.classList.add('touched');
        
        const found = data.find(i => i.name === val);
        if (found) {
          unitSelect.value = found.defaultUnit;
          unitSelect.classList.add('touched');
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

  // Mark fields as touched on interaction
  const formControls = form.querySelectorAll('.form-control');
  formControls.forEach(control => {
    control.addEventListener('blur', () => {
      control.classList.add('touched');
    });
  });

  // 3) Toggle "Other" reason
  reasonSelect.addEventListener('change', () => {
    reasonSelect.classList.add('touched');
    if (reasonSelect.value === 'other') {
      reasonOther.style.display = 'block';
      reasonOther.required = true;
    } else {
      reasonOther.style.display = 'none';
      reasonOther.required = false;
      reasonOther.value = '';
    }
  });

  // 4) Form submit with validation
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';

    // Mark all fields as touched for validation
    formControls.forEach(control => control.classList.add('touched'));

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

    // Validate quantity
    const quantity = parseFloat(quantityInput.value);
    if (isNaN(quantity) || quantity <= 0) {
      showMessage('Please enter a valid quantity', 'error');
      quantityInput.focus();
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
      quantity: quantity,
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
        showMessage('✅ Wastage logged successfully!', 'success');
        form.reset();
        formControls.forEach(control => control.classList.remove('touched'));
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

  // Reset form handler
  const resetBtn = form.querySelector('.reset-button');
  resetBtn.addEventListener('click', () => {
    form.reset();
    formControls.forEach(control => control.classList.remove('touched'));
    msg.textContent = '';
    msg.className = '';
    unitSelect.value = '';
    Array.from(unitSelect.options).forEach(opt => opt.disabled = false);
    reasonOther.style.display = 'none';
  });
});
