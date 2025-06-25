// Initialize Supabase
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_KEY';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Connection status
let isOnline = navigator.onLine;
let pendingSyncs = JSON.parse(localStorage.getItem('pendingSyncs') || [];

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the app
    initApp();
    
    // Set up online/offline event listeners
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    updateConnectionStatus();
});

function initApp() {
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Initialize all tabs
    initPOSTab();
    initReceiptsTab();
    initSummaryTab();
    initStockTab();
    initShiftTab();

    // Check if there's an active shift
    checkActiveShift();

    // Load low stock alerts
    checkLowStock();
    
    // Set up sync button
    document.getElementById('force-sync-btn')?.addEventListener('click', syncPendingChanges);
    document.getElementById('sync-stock-btn')?.addEventListener('click', syncStock);
}

function handleConnectionChange() {
    isOnline = navigator.onLine;
    updateConnectionStatus();
    
    if (isOnline) {
        syncPendingChanges();
        showNotification('Back online - syncing data', 'success');
    } else {
        showNotification('Working offline - changes will sync when back online', 'warning');
    }
}

function updateConnectionStatus() {
    const syncStatus = document.getElementById('sync-status');
    const offlineAlert = document.getElementById('offline-alert');
    
    if (isOnline) {
        syncStatus.className = 'sync-online';
        syncStatus.innerHTML = '<i class="fas fa-cloud"></i> Online';
        if (offlineAlert) offlineAlert.style.display = 'none';
    } else {
        syncStatus.className = 'sync-offline';
        syncStatus.innerHTML = '<i class="fas fa-cloud-slash"></i> Offline';
        if (offlineAlert) offlineAlert.style.display = 'block';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('sync-notification');
    if (!notification) return;
    
    notification.innerHTML = `<span id="sync-message">${message}</span>`;
    notification.className = `notification ${type}`;
    notification.style.display = 'flex';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Data Access Functions with Supabase Integration
async function getProducts() {
    // Try Supabase first if online
    if (isOnline) {
        try {
            const { data, error } = await supabase
                .from('Product Inventory')
                .select('*');
            
            if (!error && data) {
                // Cache in localStorage
                localStorage.setItem('bakeryPosProducts', JSON.stringify(data));
                return data;
            }
        } catch (e) {
            console.error('Supabase error:', e);
        }
    }
    
    // Fallback to localStorage
    const localProducts = localStorage.getItem('bakeryPosProducts');
    return localProducts ? JSON.parse(localProducts) : [];
}

async function saveProducts(products) {
    // Save to localStorage first for immediate UI update
    localStorage.setItem('bakeryPosProducts', JSON.stringify(products));
    
    // Sync to Supabase if online
    if (isOnline) {
        try {
            // First delete all existing products
            const { error: deleteError } = await supabase
                .from('Product Inventory')
                .delete()
                .neq('id', 0); // Delete all records
            
            if (deleteError) throw deleteError;
            
            // Then insert all current products
            const { error: insertError } = await supabase
                .from('Product Inventory')
                .insert(products);
            
            if (insertError) throw insertError;
            
            return true;
        } catch (e) {
            console.error('Failed to sync products to Supabase:', e);
            // Queue for later sync
            addPendingSync('products', { products });
            return false;
        }
    } else {
        // Queue for later sync
        addPendingSync('products', { products });
        return true;
    }
}

async function getSales() {
    // Try Supabase first if online
    if (isOnline) {
        try {
            const { data, error } = await supabase
                .from('Sales Records Table')
                .select('*');
            
            if (!error && data) {
                // Cache in localStorage
                localStorage.setItem('bakeryPosSales', JSON.stringify(data));
                return data;
            }
        } catch (e) {
            console.error('Supabase error:', e);
        }
    }
    
    // Fallback to localStorage
    const localSales = localStorage.getItem('bakeryPosSales');
    return localSales ? JSON.parse(localSales) : [];
}

async function saveSales(sales) {
    // Save to localStorage first for immediate UI update
    localStorage.setItem('bakeryPosSales', JSON.stringify(sales));
    
    // Sync to Supabase if online
    if (isOnline) {
        try {
            // First delete all existing sales
            const { error: deleteError } = await supabase
                .from('Sales Records Table')
                .delete()
                .neq('id', 0); // Delete all records
            
            if (deleteError) throw deleteError;
            
            // Then insert all current sales
            const { error: insertError } = await supabase
                .from('Sales Records Table')
                .insert(sales);
            
            if (insertError) throw insertError;
            
            return true;
        } catch (e) {
            console.error('Failed to sync sales to Supabase:', e);
            // Queue for later sync
            addPendingSync('sales', { sales });
            return false;
        }
    } else {
        // Queue for later sync
        addPendingSync('sales', { sales });
        return true;
    }
}

async function recordSale(sale) {
    // Save to localStorage first
    const sales = getSales();
    sales.push(sale);
    await saveSales(sales);
    
    // Sync to Supabase if online
    if (isOnline) {
        try {
            const { error } = await supabase
                .from('Sales Records Table')
                .insert(sale);
            
            if (error) throw error;
            
            return true;
        } catch (e) {
            console.error('Failed to sync sale to Supabase:', e);
            addPendingSync('sale', sale);
            return false;
        }
    } else {
        addPendingSync('sale', sale);
        return true;
    }
}

// Shift Management with Supabase
async function getActiveShift() {
    // Try Supabase first if online
    if (isOnline) {
        try {
            const { data, error } = await supabase
                .from('Shifts')
                .select('*')
                .is('endTime', null)
                .single();
            
            if (!error && data) {
                // Cache in localStorage
                localStorage.setItem('bakeryPosActiveShift', JSON.stringify(data));
                return data;
            }
        } catch (e) {
            console.error('Supabase error:', e);
        }
    }
    
    // Fallback to localStorage
    const localShift = localStorage.getItem('bakeryPosActiveShift');
    return localShift ? JSON.parse(localShift) : null;
}

async function saveActiveShift(shift) {
    // Save to localStorage first
    localStorage.setItem('bakeryPosActiveShift', JSON.stringify(shift));
    
    // Sync to Supabase if online
    if (isOnline) {
        try {
            if (shift.id) {
                // Update existing shift
                const { error } = await supabase
                    .from('Shifts')
                    .upsert(shift);
                
                if (error) throw error;
            } else {
                // Create new shift
                const { data, error } = await supabase
                    .from('Shifts')
                    .insert(shift)
                    .select()
                    .single();
                
                if (error) throw error;
                
                // Update local ID
                shift.id = data.id;
                localStorage.setItem('bakeryPosActiveShift', JSON.stringify(shift));
            }
            
            return true;
        } catch (e) {
            console.error('Failed to sync shift to Supabase:', e);
            addPendingSync('shift', shift);
            return false;
        }
    } else {
        addPendingSync('shift', shift);
        return true;
    }
}

async function getShiftHistory() {
    // Try Supabase first if online
    if (isOnline) {
        try {
            const { data, error } = await supabase
                .from('Shifts')
                .select('*')
                .not('endTime', 'is', null)
                .order('startTime', { ascending: false });
            
            if (!error && data) {
                // Cache in localStorage
                localStorage.setItem('bakeryPosShiftHistory', JSON.stringify(data));
                return data;
            }
        } catch (e) {
            console.error('Supabase error:', e);
        }
    }
    
    // Fallback to localStorage
    const localHistory = localStorage.getItem('bakeryPosShiftHistory');
    return localHistory ? JSON.parse(localHistory) : [];
}

async function saveShiftHistory(history) {
    // Save to localStorage first
    localStorage.setItem('bakeryPosShiftHistory', JSON.stringify(history));
    
    // Sync to Supabase if online
    if (isOnline) {
        try {
            // Note: In a real app, you'd want a more sophisticated sync strategy
            const { error } = await supabase
                .from('Shifts')
                .upsert(history);
            
            if (error) throw error;
            
            return true;
        } catch (e) {
            console.error('Failed to sync shift history to Supabase:', e);
            addPendingSync('shiftHistory', { history });
            return false;
        }
    } else {
        addPendingSync('shiftHistory', { history });
        return true;
    }
}

// Pending Syncs Management
function addPendingSync(type, data) {
    const syncItem = {
        id: Date.now(),
        type,
        data,
        timestamp: new Date().toISOString(),
        attempts: 0
    };
    
    pendingSyncs.push(syncItem);
    localStorage.setItem('pendingSyncs', JSON.stringify(pendingSyncs));
    updatePendingSyncsDisplay();
}

async function syncPendingChanges() {
    if (!isOnline) {
        showNotification('Cannot sync - offline', 'warning');
        return;
    }
    
    showNotification('Syncing data...', 'info');
    
    // Process each pending sync
    for (let i = 0; i < pendingSyncs.length; i++) {
        const sync = pendingSyncs[i];
        try {
            let success = false;
            
            switch (sync.type) {
                case 'sale':
                    success = await recordSale(sync.data);
                    break;
                case 'products':
                    success = await saveProducts(sync.data.products);
                    break;
                case 'sales':
                    success = await saveSales(sync.data.sales);
                    break;
                case 'shift':
                    success = await saveActiveShift(sync.data);
                    break;
                case 'shiftHistory':
                    success = await saveShiftHistory(sync.data.history);
                    break;
            }
            
            if (success) {
                // Remove from pending syncs
                pendingSyncs.splice(i, 1);
                i--; // Adjust index after removal
            } else {
                // Increment attempt count
                sync.attempts++;
                if (sync.attempts >= 3) {
                    // Remove after too many attempts
                    pendingSyncs.splice(i, 1);
                    i--;
                }
            }
        } catch (e) {
            console.error('Sync error:', e);
            sync.attempts++;
        }
    }
    
    // Save updated pending syncs
    localStorage.setItem('pendingSyncs', JSON.stringify(pendingSyncs));
    updatePendingSyncsDisplay();
    
    if (pendingSyncs.length === 0) {
        showNotification('All data synced successfully!', 'success');
    } else {
        showNotification(`Synced with ${pendingSyncs.length} pending items remaining`, 'warning');
    }
    
    // Refresh data displays
    loadProducts();
    loadReceipts();
    loadSummary();
    loadStockItems();
    updateShiftDisplay();
}

function updatePendingSyncsDisplay() {
    const pendingSyncsList = document.getElementById('pending-syncs-list');
    const pendingSyncsSection = document.getElementById('pending-syncs');
    
    if (!pendingSyncsList || !pendingSyncsSection) return;
    
    pendingSyncsList.innerHTML = '';
    
    if (pendingSyncs.length === 0) {
        pendingSyncsSection.style.display = 'none';
        return;
    }
    
    pendingSyncsSection.style.display = 'block';
    
    pendingSyncs.forEach(sync => {
        const item = document.createElement('li');
        item.innerHTML = `
            <span>${sync.type} (${new Date(sync.timestamp).toLocaleString()})</span>
            <span>Attempts: ${sync.attempts}</span>
        `;
        pendingSyncsList.appendChild(item);
    });
}

// Stock Sync Function
async function syncStock() {
    if (!isOnline) {
        showNotification('Cannot sync stock - offline', 'warning');
        return;
    }
    
    showNotification('Syncing stock...', 'info');
    
    try {
        // Get current products from Supabase
        const { data: remoteProducts, error } = await supabase
            .from('Product Inventory')
            .select('*');
        
        if (error) throw error;
        
        // Get local products
        const localProducts = getProducts();
        
        // Merge strategy - in a real app you'd want more sophisticated conflict resolution
        const mergedProducts = [...localProducts];
        
        remoteProducts.forEach(remoteProduct => {
            const existingIndex = mergedProducts.findIndex(p => p.id === remoteProduct.id);
            if (existingIndex === -1) {
                mergedProducts.push(remoteProduct);
            }
        });
        
        // Save merged products
        await saveProducts(mergedProducts);
        
        showNotification('Stock synced successfully!', 'success');
        loadStockItems();
    } catch (e) {
        console.error('Stock sync failed:', e);
        showNotification('Failed to sync stock', 'error');
    }
}

// Rest of your existing functions (switchTab, initPOSTab, loadProducts, etc.) remain the same
// Just replace localStorage operations with the new data access functions

// Initialize with sample data if empty
async function initializeSampleData() {
    if (localStorage.getItem('bakeryPosInitialized')) return;

    const sampleProducts = [
        { id: 1, name: "Bread", price: 1000, quantity: 20 },
        { id: 2, name: "Croissant", price: 1500, quantity: 15 },
        { id: 3, name: "Cake", price: 5000, quantity: 5 },
        { id: 4, name: "Donut", price: 800, quantity: 30 },
        { id: 5, name: "Cookie", price: 300, quantity: 50 }
    ];

    await saveProducts(sampleProducts);
    localStorage.setItem('bakeryPosInitialized', 'true');
}

// Call initialization
initializeSampleData();
