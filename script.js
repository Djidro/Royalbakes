// script.js
import { db, auth } from './firebase.js';
import { 
  collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, 
  query, where, addDoc, onSnapshot 
} from "firebase/firestore";
import { 
  signInWithEmailAndPassword, onAuthStateChanged 
} from "firebase/auth";

// Authentication check
async function checkAuth() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      showLoginModal();
    }
  });
}

// Show login modal
function showLoginModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'block';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
      <h2><i class="fas fa-lock"></i> Login</h2>
      <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
        <input type="email" id="login-email" placeholder="Email" style="padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
        <input type="password" id="login-password" placeholder="Password" style="padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="login-btn" class="btn" style="margin-top: 10px;">
          <i class="fas fa-sign-in-alt"></i> Login
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      modal.remove();
    } catch (error) {
      alert("Login failed: " + error.message);
    }
  });
}

// Set up real-time listeners
function setupRealtimeUpdates() {
  // Products
  onSnapshot(collection(db, "products"), () => {
    if (document.getElementById('products-grid')) {
      loadProducts();
    }
    checkLowStock();
  });
  
  // Sales
  onSnapshot(collection(db, "sales"), () => {
    if (document.getElementById('receipts-list')) {
      loadReceipts();
    }
    if (document.getElementById('summary-content')) {
      loadSummary();
    }
  });
  
  // Active shift
  onSnapshot(doc(db, "shifts", "active"), () => {
    checkActiveShift();
    if (document.getElementById('shift-summary')) {
      updateShiftDisplay();
    }
  });
}

async function initApp() {
  // Initialize Firebase real-time listeners
  setupRealtimeUpdates();
  
  // Check authentication
  await checkAuth();
  
  // Original init code
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  initPOSTab();
  initReceiptsTab();
  initSummaryTab();
  initStockTab();
  initShiftTab();
  checkActiveShift();
  checkLowStock();
}

function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all tab buttons
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.classList.remove('active');
  });

  // Activate the selected tab
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

  // Refresh the tab content if needed
  switch(tabId) {
    case 'pos':
      loadProducts();
      updateCartDisplay();
      break;
    case 'receipts':
      loadReceipts();
      break;
    case 'summary':
      loadSummary();
      break;
    case 'stock':
      loadStockItems();
      checkLowStock();
      break;
    case 'shift':
      updateShiftDisplay();
      break;
  }
}

// POS Tab Functions
function initPOSTab() {
  // Load products
  loadProducts();

  // Set up checkout button
  document.getElementById('checkout-btn').addEventListener('click', checkout);
}

async function loadProducts() {
  const productsGrid = document.getElementById('products-grid');
  productsGrid.innerHTML = '';

  const products = await getProducts();
  
  if (products.length === 0) {
    productsGrid.innerHTML = '<p class="no-products">No products available. Add some in the Stock tab.</p>';
    return;
  }
  
  products.forEach(product => {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    
    // Handle unlimited stock display
    const stockDisplay = product.quantity === 'unlimited' ? 'Unlimited' : product.quantity;
    const stockClass = product.quantity !== 'unlimited' && product.quantity < 5 ? 'low-stock' : '';
    const lowStockWarning = product.quantity !== 'unlimited' && product.quantity < 5 ? '(Low Stock!)' : '';
    
    productCard.innerHTML = `
      <h3>${product.name}</h3>
      <p>${product.price} RWF</p>
      <p class="stock-info ${stockClass}">Stock: ${stockDisplay} ${lowStockWarning}</p>
    `;
    
    productCard.addEventListener('click', () => addToCart(product.id));
    productsGrid.appendChild(productCard);
  });
}

async function addToCart(productId) {
  const activeShift = await getActiveShift();
  if (!activeShift) {
    alert('Please start a shift before making sales!');
    return;
  }

  const products = await getProducts();
  const product = products.find(p => p.id === productId);
  
  // Check if product exists and has stock (unless unlimited)
  if (!product || (product.quantity !== 'unlimited' && product.quantity <= 0)) {
    alert('This item is out of stock!');
    return;
  }

  let cart = getCart();
  const existingItem = cart.find(item => item.productId === productId);

  if (existingItem) {
    // Only check stock if not unlimited
    if (product.quantity !== 'unlimited' && existingItem.quantity >= product.quantity) {
      alert('Not enough stock available!');
      return;
    }
    existingItem.quantity += 1;
  } else {
    cart.push({
      productId: productId,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  saveCart(cart);
  updateCartDisplay();
}

function getCart() {
  const cart = localStorage.getItem('bakeryPosCart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('bakeryPosCart', JSON.stringify(cart));
}

async function updateCartDisplay() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalElement = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const cart = getCart();
  const products = await getProducts();

  cartItemsContainer.innerHTML = '';

  let total = 0;

  cart.forEach(item => {
    const product = products.find(p => p.id == item.productId);
    if (!product) return;

    const itemTotal = item.price * item.quantity;
    total += itemTotal;

    const cartItemElement = document.createElement('div');
    cartItemElement.className = 'cart-item';
    cartItemElement.innerHTML = `
      <div>
        <h4>${item.name}</h4>
        <p>${item.price} RWF × ${item.quantity} = ${itemTotal} RWF</p>
      </div>
      <div class="cart-item-controls">
        <button class="decrease-btn" data-id="${item.productId}"><i class="fas fa-minus"></i></button>
        <span>${item.quantity}</span>
        <button class="increase-btn" data-id="${item.productId}"><i class="fas fa-plus"></i></button>
        <button class="remove-btn" data-id="${item.productId}"><i class="fas fa-times"></i></button>
      </div>
    `;

    cartItemsContainer.appendChild(cartItemElement);
  });

  // Update event listeners
  document.querySelectorAll('.decrease-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.currentTarget.getAttribute('data-id');
      updateCartItemQuantity(productId, -1);
    });
  });

  document.querySelectorAll('.increase-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.currentTarget.getAttribute('data-id');
      updateCartItemQuantity(productId, 1);
    });
  });

  document.querySelectorAll('.remove-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.currentTarget.getAttribute('data-id');
      removeFromCart(productId);
    });
  });

  cartTotalElement.textContent = total;
  checkoutBtn.disabled = cart.length === 0 || !(await getActiveShift());
}

async function updateCartItemQuantity(productId, change) {
  let cart = getCart();
  const itemIndex = cart.findIndex(item => item.productId === productId);
  
  if (itemIndex !== -1) {
    const newQuantity = cart[itemIndex].quantity + change;
    
    if (newQuantity <= 0) {
      cart.splice(itemIndex, 1);
    } else {
      // Check stock availability (only if not unlimited)
      const products = await getProducts();
      const product = products.find(p => p.id === productId);
      
      if (product && product.quantity !== 'unlimited' && newQuantity > product.quantity) {
        alert('Not enough stock available!');
        return;
      }
      
      cart[itemIndex].quantity = newQuantity;
    }
    
    saveCart(cart);
    updateCartDisplay();
  }
}

function removeFromCart(productId) {
  const cart = getCart();
  const item = cart.find(item => item.productId === productId);
  
  if (!item) return;
  
  if (confirm(`Are you sure you want to remove ${item.name} from the cart?`)) {
    const updatedCart = cart.filter(item => item.productId !== productId);
    saveCart(updatedCart);
    updateCartDisplay();
    
    // Show a brief notification
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.textContent = `${item.name} removed from cart`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 2000);
  }
}

async function checkout() {
  const activeShift = await getActiveShift();
  if (!activeShift) {
    alert('Please start a shift before making sales!');
    return;
  }

  const cart = getCart();
  if (cart.length === 0) {
    alert('Cart is empty!');
    return;
  }

  const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
  const products = await getProducts();
  
  // Check stock availability (skip unlimited items)
  for (const item of cart) {
    const product = products.find(p => p.id === item.productId);
    if (product && product.quantity !== 'unlimited' && product.quantity < item.quantity) {
      alert(`Not enough stock for ${item.name}!`);
      return;
    }
  }

  // Process the sale
  const sale = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    items: cart.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    })),
    total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    paymentMethod: paymentMethod,
    shiftId: activeShift.id,
    refunded: false
  };

  // Update stock (skip unlimited items)
  const updatedProducts = products.map(product => {
    const cartItem = cart.find(item => item.productId === product.id);
    if (cartItem && product.quantity !== 'unlimited') {
      return {
        ...product,
        quantity: product.quantity - cartItem.quantity
      };
    }
    return product;
  });

  // Save updated products
  await saveProducts(updatedProducts);

  // Record the sale
  const sales = await getSales();
  sales.push(sale);
  await saveSales(sales);

  // Record for current shift
  activeShift.sales.push(sale.id);
  activeShift.total += sale.total;
  if (paymentMethod === 'cash') {
    activeShift.cashTotal += sale.total;
  } else {
    activeShift.momoTotal += sale.total;
  }
  await saveActiveShift(activeShift);

  // Clear the cart
  saveCart([]);
  updateCartDisplay();

  // Show receipt
  showReceipt(sale);
  
  // Check for low stock
  checkLowStock();
}

// Receipt Tab Functions
function initReceiptsTab() {
  // Set up date filter
  document.getElementById('filter-receipts-btn').addEventListener('click', loadReceipts);
  
  // Set today's date as default filter
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('receipt-date-filter').value = today;

  // Add refund button to receipt modal
  document.getElementById('receipt-modal').addEventListener('click', function(e) {
    if (e.target.id === 'refund-receipt-btn') {
      const receiptId = e.target.getAttribute('data-id');
      processRefund(receiptId);
    }
  });
}

async function processRefund(receiptId) {
  if (!confirm('Are you sure you want to process a refund for this receipt?')) return;
  
  const activeShift = await getActiveShift();
  if (!activeShift) {
    alert('Please start a shift before processing refunds!');
    return;
  }
  
  const sales = await getSales();
  const receiptIndex = sales.findIndex(s => s.id === receiptId);
  
  if (receiptIndex === -1) {
    alert('Receipt not found!');
    return;
  }
  
  const receipt = sales[receiptIndex];
  
  if (receipt.refunded) {
    alert('This receipt has already been refunded!');
    return;
  }
  
  // Mark as refunded
  receipt.refunded = true;
  receipt.refundDate = new Date().toISOString();
  receipt.refundShiftId = activeShift.id;
  
  // Update stock
  const products = await getProducts();
  const updatedProducts = products.map(product => {
    const refundItem = receipt.items.find(item => item.productId === product.id);
    if (refundItem) {
      return {
        ...product,
        quantity: product.quantity + refundItem.quantity
      };
    }
    return product;
  });
  
  // Update shift totals
  if (receipt.paymentMethod === 'cash') {
    activeShift.cashTotal -= receipt.total;
  } else {
    activeShift.momoTotal -= receipt.total;
  }
  activeShift.total -= receipt.total;
  
  // Remove from shift sales if it exists
  const shiftSaleIndex = activeShift.sales.indexOf(receiptId);
  if (shiftSaleIndex !== -1) {
    activeShift.sales.splice(shiftSaleIndex, 1);
  }
  
  // Add to refunds
  if (!activeShift.refunds) activeShift.refunds = [];
  activeShift.refunds.push(receiptId);
  
  // Save all changes
  await saveProducts(updatedProducts);
  await saveSales(sales);
  await saveActiveShift(activeShift);
  
  // Update displays
  loadReceipts();
  loadProducts();
  updateShiftDisplay();
  checkLowStock();
  
  alert('Refund processed successfully!');
  document.getElementById('receipt-modal').style.display = 'none';
}

async function loadReceipts() {
  const receiptsList = document.getElementById('receipts-list');
  receiptsList.innerHTML = '';

  const dateFilter = document.getElementById('receipt-date-filter').value;
  const sales = await getSales();

  // Filter sales by date if filter is set
  const filteredSales = dateFilter 
    ? sales.filter(sale => sale.date.split('T')[0] === dateFilter)
    : sales;

  if (filteredSales.length === 0) {
    receiptsList.innerHTML = '<p class="no-receipts">No receipts found for this date.</p>';
    return;
  }

  // Display receipts in reverse chronological order
  filteredSales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sale => {
    const receiptItem = document.createElement('div');
    receiptItem.className = `receipt-item ${sale.refunded ? 'refunded' : ''}`;
    receiptItem.innerHTML = `
      <h3>Receipt #${sale.id} ${sale.refunded ? '(Refunded)' : ''}</h3>
      <p><i class="far fa-clock"></i> ${new Date(sale.date).toLocaleString()}</p>
      <p><i class="fas fa-money-bill-wave"></i> ${sale.total} RWF (${sale.paymentMethod.toUpperCase()})</p>
      <p><i class="fas fa-boxes"></i> ${sale.items.reduce((sum, item) => sum + item.quantity, 0)} items</p>
    `;
    
    receiptItem.addEventListener('click', () => showReceipt(sale));
    receiptsList.appendChild(receiptItem);
  });
}

function showReceipt(sale) {
  const modal = document.getElementById('receipt-modal');
  const receiptContent = document.getElementById('receipt-content');
  
  // Format receipt content
  let itemsHtml = '';
  sale.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${item.price} RWF</td>
        <td>${item.price * item.quantity} RWF</td>
      </tr>
    `;
  });

  receiptContent.innerHTML = `
    <h2><i class="fas fa-receipt"></i> Receipt #${sale.id}</h2>
    <p><i class="far fa-clock"></i> ${new Date(sale.date).toLocaleString()}</p>
    <p><i class="fas fa-money-bill-wave"></i> Payment Method: ${sale.paymentMethod.toUpperCase()}</p>
    <p><i class="fas fa-user-clock"></i> Shift ID: ${sale.shiftId || 'N/A'}</p>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align: right;"><strong>Grand Total:</strong></td>
          <td><strong>${sale.total} RWF</strong></td>
        </tr>
      </tfoot>
    </table>
  `;

  // Add refund button if not already refunded
  if (!sale.refunded) {
    receiptContent.innerHTML += `
      <button id="refund-receipt-btn" class="btn btn-danger" data-id="${sale.id}" style="margin-top: 20px;">
        <i class="fas fa-undo"></i> Process Refund
      </button>
    `;
  } else {
    receiptContent.innerHTML += `
      <div class="alert alert-warning" style="margin-top: 20px;">
        <i class="fas fa-exclamation-triangle"></i> This receipt was refunded on ${new Date(sale.refundDate).toLocaleString()}
        ${sale.refundShiftId ? `(Shift ID: ${sale.refundShiftId})` : ''}
      </div>
    `;
  }

  // Set up copy receipt button
  document.getElementById('copy-receipt-btn').onclick = function() {
    const receiptText = `Receipt #${sale.id}\nDate: ${new Date(sale.date).toLocaleString()}\nPayment Method: ${sale.paymentMethod.toUpperCase()}\nShift ID: ${sale.shiftId || 'N/A'}\n\nItems:\n${
      sale.items.map(item => `${item.name} - ${item.quantity} × ${item.price} RWF = ${item.price * item.quantity} RWF`).join('\n')
    }\n\nGrand Total: ${sale.total} RWF`;
    
    navigator.clipboard.writeText(receiptText).then(() => {
      alert('Receipt copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy receipt: ', err);
      alert('Failed to copy receipt. Please try again.');
    });
  };

  modal.style.display = 'block';
}

// Close modal when clicking the X
document.querySelector('.close').addEventListener('click', function() {
  document.getElementById('receipt-modal').style.display = 'none';
});

// Close modal when clicking outside
window.addEventListener('click', function(event) {
  const modal = document.getElementById('receipt-modal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});

// Summary Tab Functions
function initSummaryTab() {
  // Set up date range filter
  document.getElementById('filter-summary-btn').addEventListener('click', loadSummary);
  
  // Set default date range (today)
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date').value = today;
  document.getElementById('end-date').value = today;
}

async function loadSummary() {
  const summaryContent = document.getElementById('summary-content');
  summaryContent.innerHTML = '';

  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const sales = await getSales();

  // Filter sales by date range and exclude refunded sales
  const filteredSales = sales.filter(sale => {
    if (sale.refunded) return false;
    const saleDate = sale.date.split('T')[0];
    return (!startDate || saleDate >= startDate) && (!endDate || saleDate <= endDate);
  });

  if (filteredSales.length === 0) {
    summaryContent.innerHTML = '<p class="no-summary">No sales found for this date range.</p>';
    return;
  }

  // Calculate summary data (excluding refunded sales)
  const cashTotal = filteredSales
    .filter(sale => sale.paymentMethod === 'cash')
    .reduce((sum, sale) => sum + sale.total, 0);

  const momoTotal = filteredSales
    .filter(sale => sale.paymentMethod === 'momo')
    .reduce((sum, sale) => sum + sale.total, 0);

  const grandTotal = cashTotal + momoTotal;
  const transactionCount = filteredSales.length;

  // Calculate item breakdown
  const itemBreakdown = {};
  filteredSales.forEach(sale => {
    sale.items.forEach(item => {
      if (!itemBreakdown[item.name]) {
        itemBreakdown[item.name] = {
          quantity: 0,
          total: 0,
          price: item.price
        };
      }
      itemBreakdown[item.name].quantity += item.quantity;
      itemBreakdown[item.name].total += item.quantity * item.price;
    });
  });

  // Format item breakdown table with current stock levels
  const products = await getProducts();
  let itemsHtml = '';
  for (const [name, data] of Object.entries(itemBreakdown)) {
    const product = products.find(p => p.name === name);
    const remainingStock = product ? product.quantity : 'N/A';
    
    itemsHtml += `
      <tr>
        <td>${name}</td>
        <td>${data.quantity}</td>
        <td>${remainingStock}</td>
        <td>${data.price} RWF</td>
        <td>${data.total} RWF</td>
      </tr>
    `;
  }

  // Display summary with enhanced item breakdown
  summaryContent.innerHTML = `
    <div class="summary-item">
      <h3><i class="fas fa-chart-pie"></i> Sales Summary</h3>
      <p><i class="far fa-calendar-alt"></i> Date Range: ${startDate || 'No start date'} to ${endDate || 'No end date'}</p>
      <p><i class="fas fa-exchange-alt"></i> Total Transactions: ${transactionCount}</p>
      <p><i class="fas fa-money-bill-wave"></i> Cash Total: ${cashTotal} RWF</p>
      <p><i class="fas fa-mobile-alt"></i> MoMo Total: ${momoTotal} RWF</p>
      <p><i class="fas fa-coins"></i> Grand Total: ${grandTotal} RWF</p>
    </div>
    
    <div class="summary-item">
      <h3><i class="fas fa-box-open"></i> Daily Item Breakdown</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity Sold</th>
            <th>Stock Left</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>
    
    <div class="summary-item">
      <h3><i class="fas fa-calendar-day"></i> Daily Sales</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Transactions</th>
            <th>Cash</th>
            <th>MoMo</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${getDailySalesBreakdown(startDate, endDate).map(day => `
            <tr>
              <td>${day.date}</td>
              <td>${day.transactions}</td>
              <td>${day.cash} RWF</td>
              <td>${day.momo} RWF</td>
              <td>${day.total} RWF</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function getDailySalesBreakdown(startDate, endDate) {
  const sales = (await getSales()).filter(sale => !sale.refunded);
  const dailySales = {};
  
  sales.forEach(sale => {
    const saleDate = sale.date.split('T')[0];
    
    // Skip if outside date range
    if ((startDate && saleDate < startDate) || (endDate && saleDate > endDate)) {
      return;
    }
    
    if (!dailySales[saleDate]) {
      dailySales[saleDate] = {
        date: saleDate,
        transactions: 0,
        cash: 0,
        momo: 0,
        total: 0
      };
    }
    
    dailySales[saleDate].transactions += 1;
    dailySales[saleDate].total += sale.total;
    
    if (sale.paymentMethod === 'cash') {
      dailySales[saleDate].cash += sale.total;
    } else {
      dailySales[saleDate].momo += sale.total;
    }
  });
  
  // Convert to array and sort by date
  return Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));
}

// Stock Management Tab Functions
function initStockTab() {
  // Set up add item button
  document.getElementById('add-item-btn').addEventListener('click', addStockItem);
  
  // Load stock items
  loadStockItems();
}

async function loadStockItems() {
  const stockItemsContainer = document.getElementById('stock-items');
  stockItemsContainer.innerHTML = '';

  const products = await getProducts();
  
  if (products.length === 0) {
    stockItemsContainer.innerHTML = '<p class="no-items">No items in stock. Add some items to get started.</p>';
    return;
  }

  products.forEach(product => {
    const stockItem = document.createElement('div');
    stockItem.className = 'stock-item';
    
    // Handle unlimited stock display
    const stockDisplay = product.quantity === 'unlimited' ? 'Unlimited' : product.quantity;
    const stockClass = product.quantity !== 'unlimited' && product.quantity < 5 ? 'low-stock' : '';
    const lowStockWarning = product.quantity !== 'unlimited' && product.quantity < 5 ? '(Low)' : '';
    
    stockItem.innerHTML = `
      <span>${product.name}</span>
      <span>${product.price} RWF</span>
      <span class="${stockClass}">${stockDisplay} ${lowStockWarning}</span>
      <button class="edit-btn" data-id="${product.id}"><i class="fas fa-edit"></i> Edit</button>
      <button class="delete-btn" data-id="${product.id}"><i class="fas fa-trash"></i> Delete</button>
    `;
    
    stockItemsContainer.appendChild(stockItem);
  });

  // Add event listeners to edit and delete buttons
  document.querySelectorAll('.edit-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.target.closest('button').getAttribute('data-id');
      editStockItem(productId);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.target.closest('button').getAttribute('data-id');
      deleteStockItem(productId);
    });
  });
}

async function checkLowStock() {
  const lowStockAlerts = document.getElementById('low-stock-alerts');
  lowStockAlerts.innerHTML = '';
  
  const products = await getProducts();
  const lowStockItems = products.filter(p => p.quantity !== 'unlimited' && p.quantity < 5);
  
  if (lowStockItems.length === 0) {
    return;
  }
  
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-warning';
  
  if (lowStockItems.length === 1) {
    alertDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Low stock alert: ${lowStockItems[0].name} has only ${lowStockItems[0].quantity} left!`;
  } else {
    const itemsList = lowStockItems.map(item => `${item.name} (${item.quantity})`).join(', ');
    alertDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Low stock alert for ${lowStockItems.length} items: ${itemsList}`;
  }
  
  lowStockAlerts.appendChild(alertDiv);
}

async function addStockItem() {
  const nameInput = document.getElementById('item-name');
  const priceInput = document.getElementById('item-price');
  const quantityInput = document.getElementById('item-quantity');
  
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);
  let quantity = quantityInput.value.trim().toLowerCase(); // Changed to accept text
  
  // Handle unlimited stock case
  const isUnlimited = quantity === 'unlimited';
  
  if (!name || isNaN(price)) {
    alert('Please fill in all fields with valid values!');
    return;
  }

  if (price <= 0) {
    alert('Price must be a positive number!');
    return;
  }

  // Convert quantity to number if not unlimited
  if (!isUnlimited) {
    quantity = parseInt(quantity);
    if (isNaN(quantity)) {
      alert('Quantity must be a number or "unlimited"!');
      return;
    }
    if (quantity <= 0) {
      alert('Quantity must be positive or "unlimited"!');
      return;
    }
  }

  const products = await getProducts();
  
  // Check if item already exists
  const existingItem = products.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existingItem) {
    if (confirm('Item already exists. Do you want to update it instead?')) {
      existingItem.price = price;
      existingItem.quantity = isUnlimited ? 'unlimited' : quantity;
      await saveProducts(products);
      loadStockItems();
      checkLowStock();
      
      // Clear inputs
      nameInput.value = '';
      priceInput.value = '';
      quantityInput.value = '';
      return;
    } else {
      return;
    }
  }

  // Add new item
  const newProduct = {
    id: Date.now().toString(),
    name: name,
    price: price,
    quantity: isUnlimited ? 'unlimited' : quantity
  };

  await saveProducts([...products, newProduct]);
  loadStockItems();
  checkLowStock();
  
  // Clear inputs
  nameInput.value = '';
  priceInput.value = '';
  quantityInput.value = '';
}

async function editStockItem(productId) {
  const products = await getProducts();
  const product = products.find(p => p.id === productId);
  
  if (!product) return;

  const newName = prompt('Enter new name:', product.name);
  if (newName === null) return;
  
  const newPrice = parseFloat(prompt('Enter new price:', product.price));
  if (isNaN(newPrice)) {
    alert('Price must be a number!');
    return;
  }
  if (newPrice <= 0) {
    alert('Price must be positive!');
    return;
  }
  
  let newQuantity = prompt('Enter new quantity (or "unlimited"):', 
                         product.quantity === 'unlimited' ? 'unlimited' : product.quantity);
  if (newQuantity === null) return;
  
  newQuantity = newQuantity.trim().toLowerCase();
  const isUnlimited = newQuantity === 'unlimited';
  
  if (!isUnlimited) {
    newQuantity = parseInt(newQuantity);
    if (isNaN(newQuantity)) {
      alert('Quantity must be a number or "unlimited"!');
      return;
    }
    if (newQuantity < 0) {
      alert('Quantity must be positive or "unlimited"!');
      return;
    }
  }

  product.name = newName;
  product.price = newPrice;
  product.quantity = isUnlimited ? 'unlimited' : newQuantity;

  await saveProducts(products);
  loadStockItems();
  loadProducts(); // Update POS display
  checkLowStock();
}

async function deleteStockItem(productId) {
  if (!confirm('Are you sure you want to delete this item? This cannot be undone.')) return;

  const products = await getProducts();
  const updatedProducts = products.filter(p => p.id !== productId);
  
  await saveProducts(updatedProducts);
  loadStockItems();
  loadProducts(); // Update POS display
  checkLowStock();
}

async function getProducts() {
  try {
    const querySnapshot = await getDocs(collection(db, "products"));
    const products = [];
    querySnapshot.forEach((doc) => {
      products.push({ id: doc.id, ...doc.data() });
    });
    return products;
  } catch (error) {
    console.error("Error getting products: ", error);
    return [];
  }
}

async function saveProducts(products) {
  try {
    const batch = [];
    const productsCollection = collection(db, "products");
    
    // First delete all existing products
    const querySnapshot = await getDocs(productsCollection);
    querySnapshot.forEach((doc) => {
      batch.push(deleteDoc(doc.ref));
    });
    
    // Then add all new products
    products.forEach(product => {
      const productRef = doc(productsCollection, product.id.toString());
      batch.push(setDoc(productRef, {
        name: product.name,
        price: product.price,
        quantity: product.quantity
      }));
    });
    
    await Promise.all(batch);
  } catch (error) {
    console.error("Error saving products: ", error);
  }
}

// Shift Management Tab Functions
function initShiftTab() {
  // Set up shift buttons
  document.getElementById('start-shift-btn').addEventListener('click', startShift);
  document.getElementById('end-shift-btn').addEventListener('click', endShift);
  document.getElementById('send-whatsapp-btn').addEventListener('click', sendWhatsAppSummary);
}

async function checkActiveShift() {
  const activeShift = await getActiveShift();
  const shiftStatus = document.getElementById('shift-status');
  const startBtn = document.getElementById('start-shift-btn');
  const endBtn = document.getElementById('end-shift-btn');
  const checkoutBtn = document.getElementById('checkout-btn');
  const shiftAlert = document.getElementById('shift-closed-alert');
  
  if (activeShift) {
    shiftStatus.className = 'shift-status shift-on';
    shiftStatus.innerHTML = `<i class="fas fa-user-clock"></i> Shift: Active (Started ${new Date(activeShift.startTime).toLocaleTimeString()})`;
    startBtn.disabled = true;
    endBtn.disabled = false;
    checkoutBtn.disabled = getCart().length === 0;
    shiftAlert.style.display = 'none';
  } else {
    shiftStatus.className = 'shift-status shift-off';
    shiftStatus.innerHTML = '<i class="fas fa-user-clock"></i> Shift: Not Started';
    startBtn.disabled = false;
    endBtn.disabled = true;
    checkoutBtn.disabled = true;
    if (getCart().length > 0) {
      shiftAlert.style.display = 'block';
    }
  }
}

async function startShift() {
  const cashierName = prompt("Enter cashier name:", "") || "Cashier";
  const startingCash = parseFloat(prompt("Starting cash amount:", "0")) || 0;

  const activeShift = {
    id: Date.now().toString(),
    startTime: new Date().toISOString(),
    endTime: null,
    sales: [],
    cashTotal: 0,
    momoTotal: 0,
    total: 0,
    Cashier: cashierName,
    startingCash: startingCash
  };

  await saveActiveShift(activeShift);
  checkActiveShift();
  updateShiftDisplay();
  
  // Show notification
  alert(`Shift #${activeShift.id} started at ${new Date(activeShift.startTime).toLocaleTimeString()}\nCashier: ${activeShift.Cashier}`);
}

async function endShift() {
  const activeShift = await getActiveShift();
  if (!activeShift) return;

  if (getCart().length > 0) {
    if (!confirm('You have items in the cart. Are you sure you want to end the shift?')) {
      return;
    }
  }

  activeShift.endTime = new Date().toISOString();
  await saveActiveShift(activeShift);

  // Save to shift history
  const shiftHistory = await getShiftHistory();
  shiftHistory.push(activeShift);
  await saveShiftHistory(shiftHistory);

  // Clear active shift
  await deleteDoc(doc(db, "shifts", "active"));

  checkActiveShift();
  updateShiftDisplay();
  
  // Show WhatsApp button
  document.getElementById('whatsapp-section').style.display = 'block';
  
  // Show notification
  alert(`Shift #${activeShift.id} ended at ${new Date(activeShift.endTime).toLocaleTimeString()}\nTotal Sales: ${activeShift.total} RWF`);
}

async function updateShiftDisplay() {
  const shiftSummary = document.getElementById('shift-summary');
  const activeShift = await getActiveShift();
  const shiftHistory = await getShiftHistory();

  if (activeShift) {
    const sales = (await getSales()).filter(sale => activeShift.sales.includes(sale.id));
    const products = await getProducts();
    
    // Calculate item breakdown
    const itemBreakdown = {};
    sales.forEach(sale => {
      sale.items.forEach(item => {
        if (!itemBreakdown[item.name]) {
          itemBreakdown[item.name] = {
            quantity: 0,
            total: 0
          };
        }
        itemBreakdown[item.name].quantity += item.quantity;
        itemBreakdown[item.name].total += item.quantity * item.price;
      });
    });

    // Format item breakdown table
    let itemsHtml = '';
    for (const [name, data] of Object.entries(itemBreakdown)) {
      const product = products.find(p => p.name === name);
      const remainingStock = product ? product.quantity : 'N/A';
      
      itemsHtml += `
        <tr>
          <td>${name}</td>
          <td>${data.quantity}</td>
          <td>${remainingStock}</td>
          <td>${data.total} RWF</td>
        </tr>
      `;
    }

    shiftSummary.innerHTML = `
      <h3><i class="fas fa-clipboard-list"></i> Current Shift Summary</h3>
      <p><i class="fas fa-id-badge"></i> Shift ID: ${activeShift.id}</p>
      <p><i class="fas fa-user"></i> Cashier: ${activeShift.Cashier || 'Unknown'}</p>
      <p><i class="fas fa-play"></i> Started: ${new Date(activeShift.startTime).toLocaleString()}</p>
      <p><i class="fas fa-coins"></i> Total Sales: ${activeShift.total} RWF</p>
      <p><i class="fas fa-money-bill-wave"></i> Cash: ${activeShift.cashTotal} RWF</p>
      <p><i class="fas fa-mobile-alt"></i> MoMo: ${activeShift.momoTotal} RWF</p>
      <p><i class="fas fa-exchange-alt"></i> Transactions: ${activeShift.sales.length}</p>
      <p><i class="fas fa-wallet"></i> Starting Cash: ${activeShift.startingCash || 0} RWF</p>
      <p><i class="fas fa-undo"></i> Refunds: ${activeShift.refunds ? activeShift.refunds.length : 0}</p>
      
      <h4><i class="fas fa-box-open"></i> Item Breakdown</h4>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity Sold</th>
            <th>Stock Left</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    `;
  } else {
    shiftSummary.innerHTML = '<h3><i class="fas fa-history"></i> Shift History</h3>';
    
    if (shiftHistory.length > 0) {
      // Show last shift summary
      const lastShift = shiftHistory[shiftHistory.length - 1];
      shiftSummary.innerHTML += `
        <div class="last-shift-summary">
          <h4><i class="fas fa-clipboard-list"></i> Last Shift Summary</h4>
          <p><i class="fas fa-id-badge"></i> Shift ID: ${lastShift.id}</p>
          <p><i class="fas fa-user"></i> Cashier: ${lastShift.Cashier || 'Cashier'}</p>
          <p><i class="fas fa-calendar-day"></i> Date: ${lastShift.date}</p>
          <p><i class="fas fa-play"></i> Started: ${new Date(lastShift.startTime).toLocaleTimeString()}</p>
          <p><i class="fas fa-stop"></i> Ended: ${new Date(lastShift.endTime).toLocaleTimeString()}</p>
          <p><i class="fas fa-clock"></i> Duration: ${lastShift.duration}</p>
          <p><i class="fas fa-coins"></i> Total Sales: ${lastShift.total} RWF</p>
          <p><i class="fas fa-money-bill-wave"></i> Cash: ${lastShift.cashTotal} RWF</p>
          <p><i class="fas fa-mobile-alt"></i> MoMo: ${lastShift.momoTotal} RWF</p>
          <p><i class="fas fa-exchange-alt"></i> Transactions: ${lastShift.sales ? lastShift.sales.length : 0}</p>
          <p><i class="fas fa-undo"></i> Refunds: ${lastShift.refunds ? lastShift.refunds.length : 0}</p>
        </div>
      `;
      
      // Add enhanced history table
      shiftSummary.innerHTML += `
        <h4><i class="fas fa-table"></i> Shift History (Last 30 Days)</h4>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Cashier</th>
              <th>Duration</th>
              <th>Total</th>
              <th>Transactions</th>
              <th>Refunds</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${shiftHistory.slice().reverse().slice(0, 30).map(shift => `
              <tr class="shift-row" data-id="${shift.id}">
                <td>${shift.date}</td>
                <td>${shift.Cashier || 'Cashier'}</td>
                <td>${shift.duration}</td>
                <td>${shift.total} RWF</td>
                <td>${shift.sales ? shift.sales.length : 0}</td>
                <td>${shift.refunds ? shift.refunds.length : 0}</td>
                <td><button class="btn-small view-shift-btn" data-id="${shift.id}">View</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      
      // Add click handler for view buttons
      document.querySelectorAll('.view-shift-btn').forEach(button => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const shiftId = button.getAttribute('data-id');
          viewShiftDetails(shiftId);
        });
      });
    } else {
      shiftSummary.innerHTML += '<p class="no-shift">No shift history found.</p>';
    }
  }
}

async function viewShiftDetails(shiftId) {
  const shiftHistory = await getShiftHistory();
  const shift = shiftHistory.find(s => s.id === shiftId);
  
  if (!shift) return;
  
  const sales = (await getSales()).filter(sale => shift.sales.includes(sale.id));
  const products = await getProducts();
  
  // Calculate item breakdown
  const itemBreakdown = {};
  sales.forEach(sale => {
    sale.items.forEach(item => {
      if (!itemBreakdown[item.name]) {
        itemBreakdown[item.name] = {
          quantity: 0,
          total: 0
        };
      }
      itemBreakdown[item.name].quantity += item.quantity;
      itemBreakdown[item.name].total += item.quantity * item.price;
    });
  });

  // Format details
  let detailsHtml = `
    <h3><i class="fas fa-clipboard-list"></i> Shift Details #${shift.id}</h3>
    <p><i class="fas fa-user"></i> Cashier: ${shift.Cashier || 'Cashier'}</p>
    <p><i class="fas fa-play"></i> Started: ${new Date(shift.startTime).toLocaleString()}</p>
    <p><i class="fas fa-stop"></i> Ended: ${new Date(shift.endTime).toLocaleString()}</p>
    <p><i class="fas fa-clock"></i> Duration: ${formatDuration(shift.startTime, shift.endTime)}</p>
    <p><i class="fas fa-coins"></i> Total Sales: ${shift.total} RWF</p>
    <p><i class="fas fa-money-bill-wave"></i> Cash: ${shift.cashTotal} RWF</p>
    <p><i class="fas fa-mobile-alt"></i> MoMo: ${shift.momoTotal} RWF</p>
    <p><i class="fas fa-exchange-alt"></i> Transactions: ${shift.sales.length}</p>
    <p><i class="fas fa-wallet"></i> Starting Cash: ${shift.startingCash || 0} RWF</p>
    <p><i class="fas fa-undo"></i> Refunds: ${shift.refunds ? shift.refunds.length : 0}</p>
    
    <h4><i class="fas fa-box-open"></i> Item Breakdown</h4>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Quantity Sold</th>
          <th>Stock Left</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(itemBreakdown).map(([name, data]) => {
          const product = products.find(p => p.name === name);
          const remainingStock = product ? product.quantity : 'N/A';
          return `
            <tr>
              <td>${name}</td>
              <td>${data.quantity}</td>
              <td>${remainingStock}</td>
              <td>${data.total} RWF</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    
    <button id="close-details-btn" class="btn" style="margin-top: 20px;">
      <i class="fas fa-times"></i> Close
    </button>
  `;

  // Create a modal for details
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close">&times;</span>
      ${detailsHtml}
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  // Add close handlers
  modal.querySelector('.close').addEventListener('click', () => {
    modal.remove();
  });
  
  modal.querySelector('#close-details-btn').addEventListener('click', () => {
    modal.remove();
  });
  
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
}

async function sendWhatsAppSummary() {
  const shiftHistory = await getShiftHistory();
  if (shiftHistory.length === 0) {
    alert('No shift history found!');
    return;
  }

  const lastShift = shiftHistory[shiftHistory.length - 1];
  const sales = (await getSales()).filter(sale => lastShift.sales.includes(sale.id));
  const products = await getProducts();
  
  // Calculate item breakdown
  const itemBreakdown = {};
  sales.forEach(sale => {
    sale.items.forEach(item => {
      if (!itemBreakdown[item.name]) {
        itemBreakdown[item.name] = {
          quantity: 0,
          total: 0
        };
      }
      itemBreakdown[item.name].quantity += item.quantity;
      itemBreakdown[item.name].total += item.quantity * item.price;
    });
  });

  // Format summary message
  let message = `*Shift Summary*\n\n`;
  message += `*Shift ID:* ${lastShift.id}\n`;
  message += `*Cashier:* ${lastShift.Cashier || 'Cashier'}\n`;
  message += `*Date:* ${lastShift.date}\n`;
  message += `*Start Time:* ${new Date(lastShift.startTime).toLocaleTimeString()}\n`;
  message += `*End Time:* ${new Date(lastShift.endTime).toLocaleTimeString()}\n`;
  message += `*Duration:* ${lastShift.duration}\n\n`;
  message += `*Starting Cash:* ${lastShift.startingCash || 0} RWF\n`;
  message += `*Total Sales:* ${lastShift.total} RWF\n`;
  message += `- 💵 Cash: ${lastShift.cashTotal} RWF\n`;
  message += `- 📱 MoMo: ${lastShift.momoTotal} RWF\n`;
  message += `*Transactions:* ${lastShift.sales ? lastShift.sales.length : 0}\n`;
  message += `*Refunds:* ${lastShift.refunds ? lastShift.refunds.length : 0}\n\n`;
  message += `*Item Breakdown:*\n`;
  
  for (const [name, data] of Object.entries(itemBreakdown)) {
    const product = products.find(p => p.name === name);
    const remainingStock = product ? product.quantity : 'N/A';
    message += `- ${name}: Sold ${data.quantity}, Left ${remainingStock} (Total: ${data.total} RWF)\n`;
  }

  // Calculate cash to deposit (starting cash + cash sales)
  const cashToDeposit = (lastShift.startingCash || 0) + lastShift.cashTotal;
  message += `\n*Cash to Deposit:* ${cashToDeposit} RWF\n`;

  // Encode message for WhatsApp URL
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
  
  // Open WhatsApp in a new tab
  window.open(whatsappUrl, '_blank');
}

// Helper function to format duration
function formatDuration(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate - startDate;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

async function getActiveShift() {
  try {
    const docRef = doc(db, "shifts", "active");
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  } catch (error) {
    console.error("Error getting active shift: ", error);
    return null;
  }
}

async function saveActiveShift(shift) {
  try {
    await setDoc(doc(db, "shifts", "active"), shift);
  } catch (error) {
    console.error("Error saving active shift: ", error);
  }
}

async function getShiftHistory() {
  try {
    const querySnapshot = await getDocs(collection(db, "shiftHistory"));
    const history = [];
    querySnapshot.forEach((doc) => {
      history.push({ id: doc.id, ...doc.data() });
    });
    return history;
  } catch (error) {
    console.error("Error getting shift history: ", error);
    return [];
  }
}

async function saveShiftHistory(history) {
  try {
    const batch = [];
    const historyCollection = collection(db, "shiftHistory");
    
    // First delete all existing history
    const querySnapshot = await getDocs(historyCollection);
    querySnapshot.forEach((doc) => {
      batch.push(deleteDoc(doc.ref));
    });
    
    // Then add all new history
    history.forEach(shift => {
      const shiftRef = doc(historyCollection, shift.id);
      batch.push(setDoc(shiftRef, {
        startTime: shift.startTime,
        endTime: shift.endTime,
        sales: shift.sales || [],
        cashTotal: shift.cashTotal || 0,
        momoTotal: shift.momoTotal || 0,
        total: shift.total || 0,
        Cashier: shift.Cashier || "Cashier",
        startingCash: shift.startingCash || 0,
        refunds: shift.refunds || [],
        date: shift.startTime.split('T')[0],
        duration: formatDuration(shift.startTime, shift.endTime)
      }));
    });
    
    await Promise.all(batch);
  } catch (error) {
    console.error("Error saving shift history: ", error);
  }
}

async function getSales() {
  try {
    const querySnapshot = await getDocs(collection(db, "sales"));
    const sales = [];
    querySnapshot.forEach((doc) => {
      sales.push({ id: doc.id, ...doc.data() });
    });
    return sales;
  } catch (error) {
    console.error("Error getting sales: ", error);
    return [];
  }
}

async function saveSales(sales) {
  try {
    const batch = [];
    const salesCollection = collection(db, "sales");
    
    // First delete all existing sales
    const querySnapshot = await getDocs(salesCollection);
    querySnapshot.forEach((doc) => {
      batch.push(deleteDoc(doc.ref));
    });
    
    // Then add all new sales
    sales.forEach(sale => {
      const saleRef = doc(salesCollection, sale.id);
      batch.push(setDoc(saleRef, {
        date: sale.date,
        items: sale.items,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        shiftId: sale.shiftId,
        refunded: sale.refunded,
        refundDate: sale.refundDate || null,
        refundShiftId: sale.refundShiftId || null
      }));
    });
    
    await Promise.all(batch);
  } catch (error) {
    console.error("Error saving sales: ", error);
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initApp();
});