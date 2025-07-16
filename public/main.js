// public/main.js
window.addEventListener('DOMContentLoaded', () => {
  const empInput = document.getElementById('employee');
  const empList = document.getElementById('employee-list');
  const itemInput = document.getElementById('item');
  const itemList = document.getElementById('item-list');
  const reasonSelect = document.getElementById('reason-select');
  const reasonOther = document.getElementById('reason-other');
  const form = document.getElementById('wastage-form');
  const msg = document.getElementById('message');
  const submitBtn = form.querySelector('button[type="submit"]');
  const quantityInput = document.getElementById('quantity');

  // Employee data
  const employees = ["Guy", "Dean", "Henry", "Bethany", "Pero", "Paddy", "Vaile", "Nora", "Melissa", "Josh"];

  // Store items data globally
  let itemsData = [];

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

  // New Item Modal functionality
  const newItemModal = document.getElementById('new-item-modal');
  const newItemForm = document.getElementById('new-item-form');
  const addItemBtn = document.getElementById('add-item-btn');
  const cancelNewItemBtn = document.getElementById('cancel-new-item');
  const newItemNameInput = document.getElementById('new-item-name');
  const newItemUnitSelect = document.getElementById('new-item-unit');

  // Show modal
  addItemBtn.addEventListener('click', () => {
    newItemModal.classList.add('show');
    newItemNameInput.value = itemInput.value; // Pre-fill with current input
    newItemNameInput.focus();
  });

  // Hide modal
  function hideNewItemModal() {
    newItemModal.classList.remove('show');
    newItemForm.reset();
  }

  cancelNewItemBtn.addEventListener('click', hideNewItemModal);

  // Close modal when clicking outside
  newItemModal.addEventListener('click', (e) => {
    if (e.target === newItemModal) {
      hideNewItemModal();
    }
  });

  // Handle new item submission
  newItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = newItemForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    
    try {
      const response = await fetch('/api/suggest-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: newItemNameInput.value.trim(),
          unit: newItemUnitSelect.value
        })
      });

      const result = await response.json();
      
      if (result.success) {
        showMessage('✅ ' + result.message, 'success');
        hideNewItemModal();
        
        // Add the new item to the items list
        const newItem = {
          name: newItemNameInput.value.trim(),
          defaultUnit: newItemUnitSelect.value
        };
        itemsData.push(newItem);
        
        // Update the item input
        itemInput.value = newItem.name;
        itemInput.classList.add('touched');
      } else {
        showMessage('❌ ' + (result.error || 'Failed to submit item'), 'error');
      }
    } catch (err) {
      console.error('Network error:', err);
      showMessage('❌ Network error. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Setup autocomplete
  function setupAutocomplete(input, list, options, onSelect) {
    let currentFocus = -1;

    input.addEventListener('input', () => {
      const val = input.value.toLowerCase();
      list.innerHTML = '';
      list.style.display = 'none';
      currentFocus = -1;

      if (!val) return;

      const matches = options.filter(opt => 
        opt.toLowerCase().includes(val)
      );

      if (matches.length > 0) {
        list.style.display = 'block';
        matches.forEach(match => {
          const li = document.createElement('li');
          // Highlight matching part
          const matchIndex = match.toLowerCase().indexOf(val);
          li.innerHTML = match.slice(0, matchIndex) +
            '<strong>' + match.slice(matchIndex, matchIndex + val.length) + '</strong>' +
            match.slice(matchIndex + val.length);
          
          li.addEventListener('click', () => onSelect(match));
          list.appendChild(li);
        });
      }
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', e => {
      const items = list.getElementsByTagName('li');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        currentFocus++;
        if (currentFocus >= items.length) currentFocus = 0;
        setActive(items);
        e.preventDefault();
      }
      else if (e.key === 'ArrowUp') {
        currentFocus--;
        if (currentFocus < 0) currentFocus = items.length - 1;
        setActive(items);
        e.preventDefault();
      }
      else if (e.key === 'Enter' && currentFocus > -1) {
        if (items[currentFocus]) {
          onSelect(items[currentFocus].textContent);
          e.preventDefault();
        }
      }
    });

    // Highlight active item
    function setActive(items) {
      if (!items) return false;
      removeActive(items);
      if (currentFocus >= items.length) currentFocus = 0;
      if (currentFocus < 0) currentFocus = items.length - 1;
      items[currentFocus].classList.add('active');
    }

    function removeActive(items) {
      for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
      }
    }

    // Close list when clicking outside
    document.addEventListener('click', e => {
      if (e.target !== input) {
        list.style.display = 'none';
      }
    });
  }

  // Setup employee autocomplete
  setupAutocomplete(empInput, empList, employees, val => {
    empInput.value = val;
    empList.style.display = 'none';
    empInput.classList.add('touched');
  });

  // Load items and setup autocomplete
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
        itemInput.classList.add('touched');
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

  // Toggle "Other" reason
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

  // Form submit with validation
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

    // Validate item and get its unit
    const selectedItem = itemsData.find(i => i.name === itemInput.value);
    if (!selectedItem) {
      showMessage('Please select a valid item from the list', 'error');
      itemInput.focus();
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

    // Prepare payload using the item's default unit
    const payload = {
      employeeName: empInput.value,
      itemName: itemInput.value,
      quantity: quantity,
      unit: selectedItem.defaultUnit,
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
    reasonOther.style.display = 'none';
  });
});
