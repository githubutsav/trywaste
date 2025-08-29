    
        lucide.createIcons();

        // --- DOM Element References ---
        const mainContent = document.getElementById('main-content');
        const cameraUI = document.getElementById('camera-ui');
        const submissionUI = document.getElementById('submission-ui');
        const verificationUI = document.getElementById('verification-ui');
        const video = document.getElementById('camera-feed');
        const canvas = document.getElementById('photo-canvas');
        const photoPreview = document.getElementById('photo-preview');
        const placeholder = document.getElementById('placeholder');
        const startCameraBtn = document.getElementById('start-camera-btn');
        const captureBtn = document.getElementById('capture-btn');
        const retakeBtn = document.getElementById('retake-btn');
        const submitReportBtn = document.getElementById('submit-report-btn');
        const mapPreviewContainer = document.getElementById('map-preview');
        const mapView = document.getElementById('map-view');
    const viewMapBtn = document.getElementById('view-map-btn');
    const refreshMapBtn = document.getElementById('refresh-map-btn');
        const backToCameraBtn = document.getElementById('back-to-camera-btn');
        const marketplaceView = document.getElementById('marketplace-view');
        const viewMarketplaceBtn = document.getElementById('view-marketplace-btn');
        const backToCameraFromMarketBtn = document.getElementById('back-to-camera-from-market-btn');
        const collectorList = document.getElementById('collector-list');

        // --- State Variables ---
        let stream = null;
        let capturedImageDataUrl = null;
        let userLocation = null;
        let previewMap = null;
        let fullMap = null;
        
        // --- Reports Store (loaded dynamically) ---
        let garbageReports = [];
    // Runtime capability flags (auto-adjust when backend schema / RLS not ready)
    let storageUploadAllowed = true; // disabled if RLS blocks
    let statusColumnAvailable = true; // disabled if inserts complain

        // --- Toast Notifications ---
        function showToast(message, type = 'info') {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                Object.assign(container.style, { position: 'fixed', bottom: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '.5rem', zIndex: 3000 });
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.className = 'text-sm px-4 py-2 rounded shadow font-medium';
            const palette = { info: 'bg-slate-700 text-white', success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', warn: 'bg-amber-600 text-white' };
            toast.className += ' ' + (palette[type] || palette.info);
            toast.style.opacity = '0';
            toast.style.transition = 'opacity .25s ease';
            container.appendChild(toast);
            requestAnimationFrame(()=> toast.style.opacity = '1');
            setTimeout(()=> { toast.style.opacity = '0'; setTimeout(()=> toast.remove(), 400); }, 3500);
        }

        function mergeReports(existing, incoming) {
            const key = r => (r.id ? 'id:'+r.id : `t:${r.timestamp}|${r.lat}|${r.lon}`);
            const map = new Map();
            existing.forEach(r => map.set(key(r), r));
            incoming.forEach(r => map.set(key(r), r));
            return Array.from(map.values());
        }

        async function loadReportsUser() {
            // Start with localStorage
            const local = JSON.parse(localStorage.getItem('garbageReports') || '[]');
            garbageReports = mergeReports(garbageReports, local);
            // Try Supabase
            if (supabaseReady()) {
                try {
                    const { data, error } = await window.supabaseClient.from('reports')
                        .select('*')
                        .order('timestamp', { ascending: false })
                        .limit(500);
                    if (!error && data) {
                        const remote = data.map(r => ({
                            id: r.id,
                            lat: r.latitude,
                            lon: r.longitude,
                            imageUrl: r.image_url,
                            timestamp: r.timestamp,
                            municipal_name: r.municipal_name,
                            municipal_lat: r.municipal_lat,
                            municipal_lon: r.municipal_lon,
                            status: r.status
                        }));
                        garbageReports = mergeReports(garbageReports, remote);
                    } else if (error) {
                        console.warn('[USER] Supabase select error (using local only):', error.message);
                    }
                } catch (e) {
                    console.warn('[USER] Supabase select exception:', e);
                }
            }
            // Persist merged back to local for quick reload
            localStorage.setItem('garbageReports', JSON.stringify(garbageReports));
            console.log('[USER] Loaded reports count:', garbageReports.length);
        }

        const collectors = [
            { name: 'GreenCycle Solutions', rating: 4.8, specialties: ['Plastic', 'Paper', 'Glass'], phone: '555-0101', image: 'https://placehold.co/100x100/166534/ffffff?text=GS' },
            { name: 'EcoSavers Inc.', rating: 4.5, specialties: ['E-Waste', 'Batteries'], phone: '555-0102', image: 'https://placehold.co/100x100/1d4ed8/ffffff?text=EI' },
            { name: 'City Recyclers', rating: 4.9, specialties: ['Scrap Metal', 'Cardboard'], phone: '555-0103', image: 'https://placehold.co/100x100/be123c/ffffff?text=CR' },
            { name: 'Urban Miners', rating: 4.6, specialties: ['All Recyclables'], phone: '555-0104', image: 'https://placehold.co/100x100/a16207/ffffff?text=UM' },
            { name: 'Junk Haulers Lucknow', rating: 4.7, specialties: ['Furniture', 'Appliances'], phone: '555-0105', image: 'https://placehold.co/100x100/4a044e/ffffff?text=JH' },
            { name: 'Green Planet Traders', rating: 4.4, specialties: ['Plastic Bottles', 'Newspaper'], phone: '555-0106', image: 'https://placehold.co/100x100/064e3b/ffffff?text=GP' }
        ];

        async function startCamera() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                video.srcObject = stream;
                video.classList.remove('hidden');
                placeholder.classList.add('hidden');
                captureBtn.disabled = false;
                startCameraBtn.classList.add('hidden');
                retakeBtn.classList.add('hidden');
            } catch (err) {
                console.error("Error accessing camera: ", err);
                alert("Could not access the camera. Please ensure you have granted permission.");
            }
        }

        function getUserLocation() {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error("Geolocation is not supported."));
                } else {
                    navigator.geolocation.getCurrentPosition(
                        (position) => resolve(position.coords),
                        (error) => reject(error)
                    );
                }
            });
        }

        async function capturePhoto() {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            capturedImageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            stopCameraStream();

            cameraUI.classList.add('hidden');
            verificationUI.classList.remove('hidden');

            try {
                const location = await getUserLocation();
                const isGarbage = await verifyImageWithGemini(capturedImageDataUrl);

                verificationUI.classList.add('hidden');

                if (isGarbage) {
                    userLocation = location;
                    photoPreview.src = capturedImageDataUrl;
                    submissionUI.classList.remove('hidden');
                    retakeBtn.classList.remove('hidden');
                    captureBtn.classList.add('hidden');
                    initializeMapPreview(userLocation.latitude, userLocation.longitude);
                } else {
                    alert("Image rejected. Please take a clear photo of garbage.");
                    retakePhoto();
                }
            } catch (error) {
                console.error("Error during capture process:", error);
                alert("Could not get location or verify image. Please enable location services and try again.");
                verificationUI.classList.add('hidden');
                retakePhoto();
            }
        }

        async function verifyImageWithGemini(dataUrl) {
            const base64ImageData = dataUrl.split(',')[1];
            const apiKey = "AIzaSyBE3eXv_bDyl3lkOo7zf1LgR50GKYzA-S4"; 
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{
                    parts: [
                        { text: "Is this an image of garbage, trash, or illegally dumped waste? Answer with only 'yes' or 'no'." }, 
                        { inlineData: { mimeType: "image/jpeg", data: base64ImageData } }
                    ]
                }],
            };

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    console.error("API Error:", response.status, await response.text());
                    return false;
                }
                const result = await response.json();
                const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
                console.log("Gemini API Response:", text);
                return text === 'yes';
            } catch (error) {
                console.error("Error calling Gemini API:", error);
                return false;
            }
        }

        function initializeMapPreview(lat, lon) {
            if (previewMap) previewMap.remove();
            previewMap = L.map('map-preview').setView([lat, lon], 16);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(previewMap);
            L.marker([lat, lon]).addTo(previewMap);
        }

        function stopCameraStream() {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                video.classList.add('hidden');
                placeholder.classList.remove('hidden');
                captureBtn.disabled = true;
            }
        }
        
        function retakePhoto() {
            submissionUI.classList.add('hidden');
            cameraUI.classList.remove('hidden');
            captureBtn.classList.remove('hidden');
            startCamera(); 
        }

        // Ensure Supabase readiness
        function supabaseReady() {
            return !!window.supabaseClient;
        }

        function showSupabaseWarning(flag) {
            const el = document.getElementById('supabase-warn');
            if (!el) return;
            if (flag) el.classList.remove('hidden'); else el.classList.add('hidden');
        }

        async function syncLocalReportsToSupabase() {
            if (!supabaseReady()) return;
            const local = JSON.parse(localStorage.getItem('garbageReports') || '[]');
            const unsynced = local.filter(r => !r.id); // no id means never inserted
            if (!unsynced.length) return;
            for (const r of unsynced) {
                try {
                    // Attempt storage upload if still base64
                    if (r.imageUrl && r.imageUrl.startsWith('data:')) {
                        const upgraded = await uploadImageToStorage(r.imageUrl);
                        if (upgraded) r.imageUrl = upgraded;
                    }
                    let payload = {
                        image_url: r.imageUrl,
                        latitude: r.lat,
                        longitude: r.lon,
                        timestamp: r.timestamp,
                        municipal_name: r.municipal_name,
                        municipal_lat: r.municipal_lat,
                        municipal_lon: r.municipal_lon
                    };
                    if (statusColumnAvailable) payload.status = r.status || 'pending';
                    let { data, error } = await window.supabaseClient.from('reports').insert(payload).select('id');
                    if (error && statusColumnAvailable && /status/i.test(error.message)) {
                        console.warn('[SYNC] Status column missing remotely, disabling status in inserts (will still track locally).');
                        statusColumnAvailable = false;
                        delete payload.status;
                        ({ data, error } = await window.supabaseClient.from('reports').insert(payload).select('id'));
                    }
                    if (!error && data && data[0]) {
                        r.id = data[0].id;
                    }
                } catch (e) {
                    console.warn('Sync insert failed:', e);
                }
            }
            localStorage.setItem('garbageReports', JSON.stringify(local));
        }

        // Central image upload helper
        async function uploadImageToStorage(base64) {
            if (!window.supabaseClient || !storageUploadAllowed) return null;
            try {
                const match = base64.match(/^data:(.*?);base64,(.*)$/);
                if (!match) return null;
                const mime = match[1];
                if (!/^image\//i.test(mime)) return null;
                const raw = atob(match[2]);
                const bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                const ext = (mime.split('/')[1] || 'jpg').toLowerCase();
                const filename = `report-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                const { data, error } = await window.supabaseClient.storage.from('report-images').upload(filename, bytes, { contentType: mime, upsert: false });
                if (error) {
                    console.warn('Storage upload failed', error.message);
                    if (/row-level security/i.test(error.message)) {
                        storageUploadAllowed = false; // don't keep retrying
                        showToast('Image storage blocked by RLS; using inline images', 'warn');
                    }
                    return null;
                }
                const { data: pub } = window.supabaseClient.storage.from('report-images').getPublicUrl(data.path);
                return pub?.publicUrl || null;
            } catch (e) { console.warn('Storage upload exception', e); return null; }
        }

        document.addEventListener('DOMContentLoaded', () => {
            showSupabaseWarning(!supabaseReady());
            setTimeout(async () => {
                showSupabaseWarning(!supabaseReady());
                await syncLocalReportsToSupabase();
                await loadReportsUser();
            }, 800); // slight delay to allow CDN script load
        });

    async function submitReport() {
            if (userLocation && capturedImageDataUrl) {
                const { latitude, longitude } = userLocation;
                const nearestMunicipal = findNearestMunicipal(latitude, longitude);
                const timestamp = new Date().toISOString();
        // Upload image to storage (global helper)

                let finalImageUrl = capturedImageDataUrl; // fallback
                const storageUrl = await uploadImageToStorage(capturedImageDataUrl);
                if (storageUrl) finalImageUrl = storageUrl;

                const report = {
                    lat: latitude,
                    lon: longitude,
                    imageUrl: finalImageUrl,
                    timestamp,
                    municipal_name: nearestMunicipal.name,
                    municipal_lat: nearestMunicipal.lat,
                    municipal_lon: nearestMunicipal.lon,
                    status: 'pending'
                };

                // Local memory + localStorage fallback
                garbageReports.push(report);
                localStorage.setItem('garbageReports', JSON.stringify(garbageReports));

                // Supabase insert (graceful failure)
                try {
                    if (supabaseReady()) {
                        let payload = {
                            image_url: report.imageUrl,
                            latitude: report.lat,
                            longitude: report.lon,
                            timestamp: report.timestamp,
                            municipal_name: report.municipal_name,
                            municipal_lat: report.municipal_lat,
                            municipal_lon: report.municipal_lon
                        };
                        if (statusColumnAvailable) payload.status = report.status;
                        let { data, error } = await window.supabaseClient.from('reports').insert(payload).select('id, image_url');
                        if (error && statusColumnAvailable && /status/i.test(error.message)) {
                            console.warn('[SUBMIT] Status column missing remotely, retrying without it.');
                            statusColumnAvailable = false;
                            delete payload.status;
                            ({ data, error } = await window.supabaseClient.from('reports').insert(payload).select('id, image_url'));
                        }
                        if (data && data[0]) {
                            report.id = data[0].id;
                            if (data[0].image_url) report.imageUrl = data[0].image_url;
                            showToast('Report uploaded', 'success');
                        }
                        if (error) {
                            console.warn('Supabase insert failed, using localStorage only:', error.message);
                            showToast('Remote save failed (local only)', 'warn');
                        }
                    } else {
                        showSupabaseWarning(true);
                        console.warn('Supabase client not loaded; skipping remote insert');
                        showToast('Saved locally (offline)', 'info');
                    }
                } catch (e) {
                    console.warn('Unexpected Supabase error:', e);
                    showToast('Unexpected error, local only', 'error');
                }

                alert(`Thank you! Your report has been submitted.\nNearest Municipal Corporation: ${nearestMunicipal.name}`);
                sendReportToAdmin(report, nearestMunicipal);
            }

            submissionUI.classList.add('hidden');
            cameraUI.classList.remove('hidden');
            startCameraBtn.classList.remove('hidden');
            captureBtn.classList.remove('hidden');
            retakeBtn.classList.add('hidden');
            photoPreview.src = '';
            capturedImageDataUrl = null;
            userLocation = null;
            if (previewMap) {
                previewMap.remove();
                previewMap = null;
            }
        }

        // Mocked municipal corporations
        const municipalCorporations = [
            { name: 'Lucknow Municipal Corporation', lat: 26.8467, lon: 80.9462 },
            { name: 'Kanpur Municipal Corporation', lat: 26.4499, lon: 80.3319 },
            { name: 'Varanasi Municipal Corporation', lat: 25.3176, lon: 82.9739 },
        ];

        function findNearestMunicipal(lat, lon) {
            let minDist = Infinity;
            let nearest = municipalCorporations[0];
            for (const corp of municipalCorporations) {
                const dist = Math.sqrt(Math.pow(lat - corp.lat, 2) + Math.pow(lon - corp.lon, 2));
                if (dist < minDist) {
                    minDist = dist;
                    nearest = corp;
                }
            }
            return nearest;
        }

        function sendReportToAdmin(report, municipal) {
            // Simulate sending report to admin/municipal (could be an API call)
            // For now, just log it
            console.log('Report sent to admin/municipal:', report, municipal);
        }

        async function showFullMap() {
            mainContent.classList.add('hidden');
            mapView.classList.remove('hidden');
            // If no reports loaded yet, attempt a load (user opened map quickly)
            if (!garbageReports.length) {
                await loadReportsUser();
            }
            
            if (!fullMap) {
                fullMap = L.map('full-map').setView([26.8467, 80.9462], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(fullMap);
            } else {
                fullMap.invalidateSize();
            }
            
            fullMap.eachLayer(layer => {
                if (layer instanceof L.Marker) {
                    fullMap.removeLayer(layer);
                }
            });

            garbageReports.forEach(report => {
                const popupContent = `
                    <img src="${report.imageUrl}" alt="Garbage report photo" class="popup-image"/>
                    <p class="text-xs text-slate-400">Location: ${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}</p>
                `;
                L.marker([report.lat, report.lon]).addTo(fullMap)
                    .bindPopup(popupContent);
            });
        }

        function hideFullMap() {
            mapView.classList.add('hidden');
            mainContent.classList.remove('hidden');
        }

        function renderCollectors() {
            collectorList.innerHTML = '';
            collectors.forEach(collector => {
                const specialtiesHtml = collector.specialties.map(s => `<span class="bg-slate-600 text-slate-300 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">${s}</span>`).join('');
                const cardHtml = `
                    <div class="collector-card rounded-lg p-4 flex flex-col items-center text-center">
                        <img src="${collector.image}" alt="${collector.name}" class="w-24 h-24 rounded-full mb-4 border-4 border-slate-500">
                        <h3 class="font-bold text-lg text-white">${collector.name}</h3>
                        <div class="flex items-center my-2">
                            <i data-lucide="star" class="w-4 h-4 text-yellow-400 fill-current"></i>
                            <span class="ml-1 text-slate-300">${collector.rating}</span>
                        </div>
                        <div class="flex flex-wrap justify-center my-2">
                            ${specialtiesHtml}
                        </div>
                        <button class="contact-btn mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-full w-full" data-phone="${collector.phone}">
                            Contact
                        </button>
                    </div>
                `;
                collectorList.innerHTML += cardHtml;
            });
            lucide.createIcons();
        }

        function showMarketplace() {
            mainContent.classList.add('hidden');
            marketplaceView.classList.remove('hidden');
            renderCollectors();
        }

        function hideMarketplace() {
            marketplaceView.classList.add('hidden');
            mainContent.classList.remove('hidden');
        }

        // --- Event Listeners ---
        startCameraBtn.addEventListener('click', () => {
            showSupabaseWarning(!supabaseReady());
            startCamera();
        });
        captureBtn.addEventListener('click', capturePhoto);
        retakeBtn.addEventListener('click', retakePhoto);
        submitReportBtn.addEventListener('click', submitReport);
        viewMapBtn.addEventListener('click', showFullMap);
        if (refreshMapBtn) {
            refreshMapBtn.addEventListener('click', async () => {
                await loadReportsUser();
                if (fullMap) {
                    fullMap.eachLayer(layer => { if (layer instanceof L.Marker) fullMap.removeLayer(layer); });
                    garbageReports.forEach(report => {
                        const popupContent = `
                            <img src="${report.imageUrl}" alt="Garbage report photo" class="popup-image"/>
                            <p class="text-xs text-slate-400">Location: ${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}</p>
                        `;
                        L.marker([report.lat, report.lon]).addTo(fullMap).bindPopup(popupContent);
                    });
                }
            });
        }
        backToCameraBtn.addEventListener('click', hideFullMap);
        viewMarketplaceBtn.addEventListener('click', showMarketplace);
        backToCameraFromMarketBtn.addEventListener('click', hideMarketplace);
        
        collectorList.addEventListener('click', (e) => {
            if (e.target.classList.contains('contact-btn')) {
                const phone = e.target.dataset.phone;
                alert(`You can contact this collector at: ${phone}`);
            }
        });
    