// admin.js
// This script loads all reports and displays them on the admin/municipal dashboard map and list.

let adminMap;
let reports = [];
let realtimeInitialized = false;
let markersLayer = null;
let municipalFilterValue = '__all__';
let statusFilterValue = 'active'; // active | done | archived | all
const AUTO_CLEAR_DAYS = 30; // auto archive after 30 days
let notificationConfig = { email: '', phone: '' };

async function loadReports() {
    // Try Supabase first
    if (window.supabaseClient) {
        try {
            const { data, error } = await window.supabaseClient
                .from('reports')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(200);
            if (!error && data) {
                console.log('[ADMIN] Supabase returned rows:', data.length);
                reports = data.map(r => ({
                    lat: r.latitude,
                    lon: r.longitude,
                    imageUrl: r.image_url,
                    timestamp: r.timestamp,
                    municipal_name: r.municipal_name,
                    municipal_lat: r.municipal_lat,
                    municipal_lon: r.municipal_lon,
                    status: r.status || 'pending',
                    id: r.id
                }));
                if (data.length === 0) {
                    console.warn('[ADMIN] No rows from Supabase. Check RLS policies or that inserts succeeded. Falling back to localStorage.');
                }
                return;
            } else if (error) {
                console.warn('Supabase fetch error, fallback to localStorage:', error.message);
            }
        } catch (e) {
            console.warn('Supabase fetch exception, fallback to localStorage:', e);
        }
    }
    // Fallback localStorage
    const stored = localStorage.getItem('garbageReports');
    if (stored) {
        reports = JSON.parse(stored);
        console.log('[ADMIN] Loaded reports from localStorage:', reports.length);
    }
}

function activeReports() {
    return reports.filter(r => !['done','archived'].includes(r.status));
}

function historyReports() {
    return reports.filter(r => ['done','archived'].includes(r.status));
}

function filteredReports() { // for legacy uses (active context)
    return activeReports().filter(r => {
        const municipalOk = municipalFilterValue === '__all__' || r.municipal_name === municipalFilterValue;
        return municipalOk;
    });
}

function renderMap() {
    if (adminMap) {
        adminMap.remove();
    }
    adminMap = L.map('admin-map').setView([26.8467, 80.9462], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(adminMap);
    markersLayer = L.layerGroup().addTo(adminMap);
    filteredReports().forEach(addReportMarker);
}

function renderList() {
    const list = document.getElementById('reports-list');
    const historyList = document.getElementById('history-list');
    list.innerHTML = '';
    historyList.innerHTML = '';

    const actives = filteredReports();
    const history = historyReports();

    actives.forEach(report => {
        const li = document.createElement('li');
        li.className = 'bg-slate-800 p-4 rounded flex items-center gap-4';
        const statusBadgeColor = 'bg-yellow-700 text-yellow-200';
        li.innerHTML = `
            <img src="${report.imageUrl}" alt="Garbage photo" class="w-24 h-16 object-cover rounded"/>
            <div>
                <div><b>Location:</b> ${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}</div>
                <div><b>Reported At:</b> ${report.timestamp ? new Date(report.timestamp).toLocaleString() : 'N/A'}</div>
                <div class="text-xs text-slate-400">${report.municipal_name || '—'}</div>
                <span class="inline-block mt-1 px-2 py-0.5 text-[10px] rounded ${statusBadgeColor}">pending</span>
                <div class="mt-2 flex gap-2">
                    <button data-action="mark-cleared" data-id="${report.id}" class="text-xs bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded">Mark Cleared</button>
                    <button data-action="archive" data-id="${report.id}" class="text-xs bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded">Archive</button>
                </div>
            </div>`;
        list.appendChild(li);
    });
    if (!actives.length) {
        const empty = document.createElement('li');
        empty.className = 'text-slate-500 text-sm';
        empty.textContent = 'No active reports.';
        list.appendChild(empty);
    }

    history.forEach(report => {
        const li = document.createElement('li');
        li.className = 'bg-slate-800/60 p-4 rounded flex items-center gap-4';
        const badge = report.status === 'archived' ? 'bg-slate-600 text-slate-200' : 'bg-emerald-700 text-emerald-200';
        const label = report.status === 'archived' ? 'archived' : 'done';
        li.innerHTML = `
            <img src="${report.imageUrl}" alt="Garbage photo" class="w-16 h-12 object-cover rounded opacity-70"/>
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="inline-block px-2 py-0.5 text-[10px] rounded ${badge}">${label}</span>
                    <span class="text-xs text-slate-500">${report.timestamp ? new Date(report.timestamp).toLocaleString() : ''}</span>
                </div>
                <div class="text-xs text-slate-400">${report.municipal_name || '—'}</div>
                <div class="mt-2 flex gap-2">
                    <button data-action="reopen" data-id="${report.id}" class="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded">Reopen</button>
                </div>
            </div>`;
        historyList.appendChild(li);
    });
    if (!history.length) {
        const empty = document.createElement('li');
        empty.className = 'text-slate-500 text-xs';
        empty.textContent = 'No history yet.';
        historyList.appendChild(empty);
    }

    const activeCount = document.getElementById('active-count');
    const historyCount = document.getElementById('history-count');
    if (activeCount) activeCount.textContent = actives.length;
    if (historyCount) historyCount.textContent = history.length;
}

function prependReportToList(report) {
    const list = document.getElementById('reports-list');
    const li = document.createElement('li');
    li.className = 'bg-emerald-800/40 border border-emerald-500 p-4 rounded flex items-center gap-4 animate-pulse';
    li.innerHTML = `
        <img src="${report.imageUrl}" alt="Garbage photo" class="w-24 h-16 object-cover rounded"/>
        <div>
            <div><b>Location:</b> ${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}</div>
            <div><b>Reported At:</b> ${report.timestamp ? new Date(report.timestamp).toLocaleString() : 'N/A'}</div>
            <div class="text-xs text-emerald-300">Live update</div>
        </div>
    `;
    if (municipalFilterValue === '__all__' || report.municipal_name === municipalFilterValue) {
        list.prepend(li);
    }
    setTimeout(()=> li.classList.remove('animate-pulse'), 2000);
}

function addReportMarker(report) {
    if (!markersLayer) return;
    if (!(municipalFilterValue === '__all__' || report.municipal_name === municipalFilterValue)) return;
    const popupContent = `
        <img src="${report.imageUrl}" alt="Garbage photo" style="width:120px;border-radius:8px;"/>
        <p>Location: ${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}</p>
        <p class="text-xs">${report.municipal_name || ''}</p>
        <p class="text-xs font-semibold">Status: ${report.status}</p>
    `;
    L.marker([report.lat, report.lon]).addTo(markersLayer).bindPopup(popupContent);
}

function notifyNewReport(report) {
    // Browser notification (optional)
    if ("Notification" in window) {
        if (Notification.permission === 'granted') {
            new Notification('New Garbage Report', { body: `${report.lat.toFixed(3)}, ${report.lon.toFixed(3)}` });
        } else if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

function setupRealtime() {
    if (realtimeInitialized || !window.supabaseClient) return;
    try {
        window.supabaseClient
            .channel('public:reports')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, payload => {
                const r = payload.new;
                // Avoid duplicates (simple check based on timestamp + coords)
                if (reports.find(ex => ex.timestamp === r.timestamp && ex.latitude === r.latitude && ex.longitude === r.longitude)) return;
                const report = {
                    lat: r.latitude,
                    lon: r.longitude,
                    imageUrl: r.image_url,
                    timestamp: r.timestamp,
                    municipal_name: r.municipal_name,
                    municipal_lat: r.municipal_lat,
                    municipal_lon: r.municipal_lon,
                    status: r.status || 'pending',
                    id: r.id
                };
                reports.unshift(report);
                addReportMarker(report);
                prependReportToList(report);
                notifyNewReport(report);
                maybeSendExternalAlerts(report);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, payload => {
                const r = payload.new;
                const idx = reports.findIndex(rep => rep.id === r.id);
                if (idx !== -1) {
                    reports[idx] = {
                        ...reports[idx],
                        lat: r.latitude,
                        lon: r.longitude,
                        imageUrl: r.image_url,
                        timestamp: r.timestamp,
                        municipal_name: r.municipal_name,
                        municipal_lat: r.municipal_lat,
                        municipal_lon: r.municipal_lon,
                        status: r.status || 'pending',
                            // archived_at removed
                    };
                    renderMap();
                    renderList();
                }
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    console.log('Realtime subscribed to reports');
                }
            });
        realtimeInitialized = true;
    } catch (e) {
        console.warn('Realtime subscription failed:', e);
    }
}

async function refresh() {
    await loadReports();
    renderMap();
    renderList();
    setupRealtime();
}

function populateMunicipalFilter() {
    const sel = document.getElementById('municipal-filter');
    if (!sel) return;
    const unique = Array.from(new Set(reports.map(r => r.municipal_name).filter(Boolean)));
    // Clear except first
    for (let i = sel.options.length - 1; i >= 1; i--) sel.remove(i);
    unique.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
    // Status filter dynamic creation if not present
    if (!document.getElementById('status-filter')) {
        const statusSel = document.createElement('select');
        statusSel.id = 'status-filter';
        statusSel.className = 'bg-slate-700 text-white px-3 py-2 rounded';
        statusSel.innerHTML = `
            <option value="active">Active (Pending)</option>
            <option value="cleared">Cleared</option>
            <option value="all">All</option>
        `;
        sel.parentElement.parentElement.appendChild(statusSel);
        statusSel.addEventListener('change', () => {
            statusFilterValue = statusSel.value;
            renderMap();
            renderList();
        });
    }
}

function saveNotificationConfig() {
    const email = document.getElementById('notify-email').value.trim();
    const phone = document.getElementById('notify-phone').value.trim();
    notificationConfig = { email, phone };
    localStorage.setItem('notificationConfig', JSON.stringify(notificationConfig));
    const status = document.getElementById('notify-status');
    status.textContent = 'Notification preferences saved locally.';
    setTimeout(()=> status.textContent = '', 4000);
}

function loadNotificationConfig() {
    const stored = localStorage.getItem('notificationConfig');
    if (stored) {
        notificationConfig = JSON.parse(stored);
        const emailInput = document.getElementById('notify-email');
        const phoneInput = document.getElementById('notify-phone');
        if (emailInput) emailInput.value = notificationConfig.email;
        if (phoneInput) phoneInput.value = notificationConfig.phone;
    }
}

function maybeSendExternalAlerts(report) {
    // Placeholder: here you'd call an Edge Function / webhook for email/SMS
    if (!notificationConfig.email && !notificationConfig.phone) return;
    console.log('Would send external alerts to:', notificationConfig, 'for report', report);
}

// (Archival logic removed due to missing column. Reintroduce after adding column to DB.)

function exportCsv() {
    const rows = [
        ['id','latitude','longitude','timestamp','municipal_name','status','image_url']
    ];
    filteredReports().forEach(r => {
        rows.push([
            r.id,
            r.lat,
            r.lon,
            r.timestamp,
            r.municipal_name || '',
            r.status,
            r.imageUrl
        ]);
    });
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reports.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function wireUI() {
    const sel = document.getElementById('municipal-filter');
    if (sel) {
        sel.addEventListener('change', () => {
            municipalFilterValue = sel.value;
            renderMap();
            renderList();
        });
    }
    const saveBtn = document.getElementById('save-notify-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveNotificationConfig);
    // Add CSV export button if not present
    if (!document.getElementById('export-csv-btn')) {
        const btn = document.createElement('button');
        btn.id = 'export-csv-btn';
        btn.textContent = 'Export CSV';
        btn.className = 'bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold px-3 py-2 rounded';
        const filterSection = document.getElementById('municipal-filter')?.closest('section');
        if (filterSection) filterSection.appendChild(btn);
        btn.addEventListener('click', exportCsv);
    }
    const container = document.body;
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const target = reports.find(r => String(r.id) === String(id));
        if (!target) return;
        let newStatus = target.status;
        if (action === 'mark-cleared') newStatus = 'done';
        else if (action === 'archive') newStatus = 'archived';
        else if (action === 'reopen') newStatus = 'pending';
        else return;
        const prev = target.status;
        target.status = newStatus;
        renderMap();
        renderList();
        try {
            if (window.supabaseClient && id) {
                const { error } = await window.supabaseClient.from('reports').update({ status: newStatus }).eq('id', id);
                if (error) {
                    console.warn('Failed to update status, reverting', error.message);
                    target.status = prev;
                    renderMap();
                    renderList();
                }
            }
        } catch (err) {
            console.warn('Status update error', err);
            target.status = prev;
            renderMap();
            renderList();
        }
    });

    const toggleBtn = document.getElementById('toggle-history-visibility');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const hist = document.getElementById('history-list');
            if (!hist) return;
            const hidden = hist.classList.toggle('hidden');
            toggleBtn.textContent = hidden ? 'Show' : 'Hide';
        });
    }
}

async function initDashboard() {
    await refresh();
    populateMunicipalFilter();
    loadNotificationConfig();
    wireUI();
}

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    setInterval(async () => {
        await refresh();
        populateMunicipalFilter();
    }, 60000);
});
