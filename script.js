const REPORTS_STORAGE_KEY = 'smartwarga.reports';
const REPORT_STATUSES = ['Diterima', 'Diproses', 'Ditindaklanjuti', 'Selesai'];
const NOMINATIM_MIN_INTERVAL_MS = 1100;
let lastNominatimRequestAt = 0;
let nominatimRequestQueue = Promise.resolve();
let backendAvailable = false;
let adminAuthenticated = false;

async function apiRequest(path, options = {}) {
    const requestOptions = {
        ...options,
        credentials: 'same-origin',
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    };
    if (requestOptions.body && typeof requestOptions.body !== 'string') {
        requestOptions.body = JSON.stringify(requestOptions.body);
    }

    const response = await fetch(path, requestOptions);
    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        throw new Error('Server mengirim respons yang tidak dapat dibaca.');
    }
    if (!response.ok) {
        throw new Error(payload.error || 'Permintaan ke server gagal.');
    }
    return payload;
}

async function initializeBackendMode() {
    const heroNote = document.querySelector('.hero-note');
    const formStorageNotice = document.getElementById('formStorageNotice');
    if (window.location.protocol === 'file:') {
        if (heroNote) heroNote.lastChild.textContent = ' Laporan tersimpan di browser dan perangkat ini.';
        if (formStorageNotice) {
            formStorageNotice.textContent =
                'Mode lokal: laporan tersimpan hanya di browser dan perangkat ini. Login Admin tidak tersedia.';
        }
        return;
    }
    try {
        const session = await apiRequest('/api/auth/session', { cache: 'no-store' });
        backendAvailable = true;
        adminAuthenticated = session.authenticated === true;
    } catch (error) {
        console.warn('Backend SmartWarga tidak tersedia; mode lokal digunakan:', error);
        if (heroNote) heroNote.lastChild.textContent = ' Laporan tersimpan lokal di browser ini.';
        if (formStorageNotice) {
            formStorageNotice.textContent =
                'Backend tidak tersedia: laporan akan tersimpan di browser ini dan tidak dapat dilihat Admin.';
        }
        showRequestError(new Error(
            'Backend tidak tersedia. Data akan tersimpan lokal dan fitur Admin hanya aktif melalui server.py.'
        ));
    }
}

const backendReady = initializeBackendMode();

function requestNominatim(url) {
    const request = nominatimRequestQueue.then(async function() {
        const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimRequestAt);
        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }
        lastNominatimRequestAt = Date.now();
        return fetch(url);
    });
    nominatimRequestQueue = request.then(() => undefined, () => undefined);
    return request;
}

function getStoredReports() {
    const stored = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (stored === null) return [];
    const reports = JSON.parse(stored);
    if (!Array.isArray(reports)) throw new Error('Data laporan lokal tidak valid.');
    return reports;
}

function saveLocalReport(report) {
    const reports = getStoredReports();
    const id = reports.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const today = new Date();
    const tanggal = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    reports.unshift({
        ...report,
        id,
        status: 'Diterima',
        tanggal,
        has_foto: Boolean(report.foto)
    });
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
    return { id };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', () => reject(reader.error || new Error('Foto tidak dapat dibaca.')));
        reader.readAsDataURL(file);
    });
}

function showRequestError(error) {
    console.error('Penyimpanan lokal SmartWarga gagal:', error);
    const notice = document.getElementById('apiErrorNotice');
    const message = document.getElementById('apiErrorMessage');
    if (!notice || !message) return;

    message.textContent = error.message || 'Data laporan lokal tidak dapat diakses. Silakan coba lagi.';
    notice.hidden = false;
}

const BANDAR_LAMPUNG_CENTER = { lat: -5.4290, lng: 105.2620 };
const BANDAR_LAMPUNG_BOUNDS = {
    north: -5.35,
    south: -5.60,
    east: 105.38,
    west: 105.15
};

function isWithinBandarLampung(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= BANDAR_LAMPUNG_BOUNDS.south && lat <= BANDAR_LAMPUNG_BOUNDS.north &&
        lng >= BANDAR_LAMPUNG_BOUNDS.west && lng <= BANDAR_LAMPUNG_BOUNDS.east;
}

const WEATHER_CODES = {
    0: { description: 'Cerah', icon: '☀️' },
    1: { description: 'Cerah berawan', icon: '🌤️' },
    2: { description: 'Berawan sebagian', icon: '⛅' },
    3: { description: 'Mendung', icon: '☁️' },
    45: { description: 'Berkabut', icon: '🌫️' },
    48: { description: 'Berkabut tebal', icon: '🌫️' },
    51: { description: 'Gerimis ringan', icon: '🌦️' },
    53: { description: 'Gerimis', icon: '🌦️' },
    55: { description: 'Gerimis lebat', icon: '🌧️' },
    56: { description: 'Gerimis beku ringan', icon: '🌧️' },
    57: { description: 'Gerimis beku lebat', icon: '🌧️' },
    61: { description: 'Hujan ringan', icon: '🌦️' },
    63: { description: 'Hujan sedang', icon: '🌧️' },
    65: { description: 'Hujan lebat', icon: '🌧️' },
    66: { description: 'Hujan beku ringan', icon: '🌧️' },
    67: { description: 'Hujan beku lebat', icon: '🌧️' },
    71: { description: 'Salju ringan', icon: '🌨️' },
    73: { description: 'Salju sedang', icon: '🌨️' },
    75: { description: 'Salju lebat', icon: '❄️' },
    77: { description: 'Butiran salju', icon: '❄️' },
    80: { description: 'Hujan lokal ringan', icon: '🌦️' },
    81: { description: 'Hujan lokal sedang', icon: '🌧️' },
    82: { description: 'Hujan lokal lebat', icon: '🌧️' },
    85: { description: 'Hujan salju ringan', icon: '🌨️' },
    86: { description: 'Hujan salju lebat', icon: '🌨️' },
    95: { description: 'Badai petir', icon: '⛈️' },
    96: { description: 'Badai petir dengan hujan es ringan', icon: '⛈️' },
    99: { description: 'Badai petir dengan hujan es lebat', icon: '⛈️' }
};

const WEATHER_DISTRICTS = [
    'Bumi Waras',
    'Enggal',
    'Kedamaian',
    'Kedaton',
    'Kemiling',
    'Labuhan Ratu',
    'Langkapura',
    'Panjang',
    'Rajabasa',
    'Sukabumi',
    'Sukarame',
    'Tanjung Karang Barat',
    'Tanjung Karang Pusat',
    'Tanjung Karang Timur',
    'Tanjung Senang',
    'Teluk Betung Barat',
    'Teluk Betung Selatan',
    'Teluk Betung Timur',
    'Teluk Betung Utara',
    'Way Halim'
];
const WEATHER_DISTRICT_CACHE_KEY = 'smartwarga.weatherDistrictLocations';
const WEATHER_AUTO_REFRESH_MS = 10 * 60 * 1000;
const WEATHER_DISTRICT_LOCATION_FALLBACKS = {
    'Langkapura': { lat: -5.4020859, lng: 105.2280673 },
    'Tanjung Karang Barat': { lat: -5.4012154, lng: 105.2451158 },
    'Tanjung Karang Pusat': { lat: -5.4207533, lng: 105.2539827 },
    'Teluk Betung Utara': { lat: -5.4400196, lng: 105.2622609 }
};

function initWeatherWidget() {
    const trigger = document.getElementById('btnCuaca');
    const modal = document.getElementById('weatherModal');
    const content = document.getElementById('weatherContent');
    const refreshButton = document.getElementById('btnMuatCuaca');
    const locationButton = document.getElementById('btnCuacaLokasi');
    const districtSelect = document.getElementById('weatherDistrict');
    const title = document.getElementById('weatherTitle');
    const closeButton = document.getElementById('btnTutupCuaca');
    const districtButton = document.getElementById('btnCuacaKecamatan');
    const allDistrictsGrid = document.getElementById('districtWeatherGrid');
    const allDistrictsUpdated = document.getElementById('districtWeatherUpdated');
    const allDistrictsRefreshButton = document.getElementById('btnMuatSemuaCuaca');
    if (!trigger || !modal || !content || !refreshButton || !locationButton ||
        !districtButton || !districtSelect || !title || !closeButton ||
        !allDistrictsGrid || !allDistrictsUpdated || !allDistrictsRefreshButton) return;
    let currentWeatherLocation = BANDAR_LAMPUNG_CENTER;
    let currentWeatherLabel = 'Bandar Lampung';
    let districtWeatherRefreshTimer;
    let districtWeatherLoading = false;
    const districtWeatherCards = new Map();

    WEATHER_DISTRICTS.forEach(district => {
        const card = document.createElement('article');
        card.className = 'district-weather-card';
        card.innerHTML = '<div class="district-weather-card-heading"></div>' +
            '<div class="district-weather-temperature">—</div>' +
            '<p class="district-weather-condition">Menunggu data cuaca</p>' +
            '<small class="district-weather-time"></small>';
        const heading = document.createElement('h4');
        heading.textContent = district;
        const status = document.createElement('span');
        status.className = 'district-weather-status';
        status.textContent = 'Menunggu';
        card.querySelector('.district-weather-card-heading').append(heading, status);
        districtWeatherCards.set(district, card);
        allDistrictsGrid.append(card);
    });

    function normalizeDistrictName(value) {
        return value.toLocaleLowerCase('id-ID')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function getCachedDistrictLocations() {
        try {
            const cached = JSON.parse(localStorage.getItem(WEATHER_DISTRICT_CACHE_KEY) || '{}');
            return cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : {};
        } catch (error) {
            console.error('Cache lokasi kecamatan SmartWarga tidak dapat dibaca:', error);
            return {};
        }
    }

    function saveCachedDistrictLocations(locations) {
        try {
            localStorage.setItem(WEATHER_DISTRICT_CACHE_KEY, JSON.stringify(locations));
        } catch (error) {
            console.error('Cache lokasi kecamatan SmartWarga tidak dapat disimpan:', error);
        }
    }

    function setDistrictCardState(district, status, temperature = '—', description = 'Menunggu data cuaca', time = '') {
        const card = districtWeatherCards.get(district);
        if (!card) return;
        card.querySelector('.district-weather-status').textContent = status;
        card.querySelector('.district-weather-temperature').textContent = temperature;
        card.querySelector('.district-weather-condition').textContent = description;
        card.querySelector('.district-weather-time').textContent = time;
        card.classList.toggle('has-error', status === 'Gagal');
    }

    async function findDistrictLocation(district, locationCache) {
        const cached = locationCache[district];
        if (cached && isWithinBandarLampung(Number(cached.lat), Number(cached.lng))) {
            return { lat: Number(cached.lat), lng: Number(cached.lng) };
        }
        const fallback = WEATHER_DISTRICT_LOCATION_FALLBACKS[district];
        if (fallback) {
            locationCache[district] = fallback;
            return fallback;
        }

        const params = new URLSearchParams({
            q: `${district}, Bandar Lampung, Lampung, Indonesia`,
            format: 'jsonv2',
            limit: '5',
            countrycodes: 'id',
            viewbox: [
                BANDAR_LAMPUNG_BOUNDS.west,
                BANDAR_LAMPUNG_BOUNDS.north,
                BANDAR_LAMPUNG_BOUNDS.east,
                BANDAR_LAMPUNG_BOUNDS.south
            ].join(','),
            bounded: '1',
            'accept-language': 'id'
        });
        const response = await requestNominatim(
            `https://nominatim.openstreetmap.org/search?${params}`
        );
        if (!response.ok) {
            throw new Error(`Layanan pencarian lokasi merespons HTTP ${response.status}.`);
        }

        const districtName = normalizeDistrictName(district);
        const results = await response.json();
        const match = Array.isArray(results) && results.find(result => {
            const latitude = Number(result.lat);
            const longitude = Number(result.lon);
            const resultName = normalizeDistrictName(String(result.display_name || ''));
            return isWithinBandarLampung(latitude, longitude) &&
                resultName.includes(districtName);
        });
        if (!match) {
            throw new Error(`Lokasi Kecamatan ${district} tidak ditemukan di Bandar Lampung.`);
        }

        const location = { lat: Number(match.lat), lng: Number(match.lon) };
        locationCache[district] = location;
        return location;
    }

    function getWeatherTimestamp(current) {
        return current.time
            ? new Date(current.time).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta'
            })
            : '';
    }

    async function loadAllDistrictWeather() {
        if (districtWeatherLoading) return;
        districtWeatherLoading = true;
        allDistrictsRefreshButton.disabled = true;
        allDistrictsRefreshButton.textContent = 'Memperbarui cuaca...';
        allDistrictsUpdated.textContent = 'Mencari lokasi dan memperbarui cuaca...';

        WEATHER_DISTRICTS.forEach(district =>
            setDistrictCardState(district, 'Memuat', '—', 'Mengambil data cuaca...')
        );

        const locationCache = getCachedDistrictLocations();
        let locationsResolved = 0;
        const locations = await Promise.all(WEATHER_DISTRICTS.map(async district => {
            try {
                setDistrictCardState(district, 'Memuat', '—', 'Menentukan titik kecamatan...');
                const location = await findDistrictLocation(district, locationCache);
                setDistrictCardState(district, 'Memuat', '—', 'Mengambil data cuaca...');
                return { district, location };
            } catch (error) {
                console.error(`Gagal mencari lokasi Kecamatan ${district}:`, error);
                setDistrictCardState(district, 'Gagal', '—', 'Lokasi kecamatan tidak ditemukan');
                return null;
            } finally {
                locationsResolved += 1;
                allDistrictsUpdated.textContent =
                    `Menentukan lokasi kecamatan (${locationsResolved}/${WEATHER_DISTRICTS.length})...`;
            }
        }));
        saveCachedDistrictLocations(locationCache);

        const availableLocations = locations.filter(Boolean);
        if (availableLocations.length === 0) {
            allDistrictsUpdated.textContent = 'Data lokasi kecamatan tidak tersedia. Coba lagi nanti.';
            districtWeatherLoading = false;
            allDistrictsRefreshButton.disabled = false;
            allDistrictsRefreshButton.textContent = 'Perbarui Cuaca Semua Kecamatan';
            return;
        }

        const params = new URLSearchParams({
            latitude: availableLocations.map(item => String(item.location.lat)).join(','),
            longitude: availableLocations.map(item => String(item.location.lng)).join(','),
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
            timezone: 'Asia/Jakarta'
        });

        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) throw new Error(`Layanan cuaca merespons HTTP ${response.status}.`);

            const data = await response.json();
            const forecasts = Array.isArray(data) ? data : [data];
            if (forecasts.length !== availableLocations.length) {
                throw new Error('Jumlah data cuaca tidak sesuai dengan jumlah kecamatan.');
            }

            let loadedCount = 0;
            forecasts.forEach((forecast, index) => {
                const { district } = availableLocations[index];
                const current = forecast.current;
                if (!current || !Number.isFinite(current.temperature_2m) ||
                    !Number.isFinite(current.weather_code)) {
                    setDistrictCardState(district, 'Gagal', '—', 'Data cuaca tidak tersedia');
                    return;
                }

                loadedCount += 1;
                const weather = WEATHER_CODES[current.weather_code] || {
                    description: 'Kondisi cuaca tidak diketahui',
                    icon: '🌡️'
                };
                const timestamp = getWeatherTimestamp(current);
                setDistrictCardState(
                    district,
                    weather.icon,
                    `${Math.round(current.temperature_2m)}°C`,
                    weather.description,
                    timestamp ? `Data ${timestamp} WIB` : ''
                );
                districtWeatherCards.get(district).classList.remove('has-error');
            });

            allDistrictsUpdated.textContent = `Diperbarui untuk ${loadedCount} dari ${WEATHER_DISTRICTS.length} kecamatan, ${new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta'
            })} WIB`;
        } catch (error) {
            console.error('Gagal memuat cuaca semua kecamatan:', error);
            availableLocations.forEach(({ district }) =>
                setDistrictCardState(district, 'Gagal', '—', 'Cuaca tidak dapat dimuat')
            );
            allDistrictsUpdated.textContent = 'Cuaca gagal diperbarui. Periksa koneksi lalu coba lagi.';
        } finally {
            districtWeatherLoading = false;
            allDistrictsRefreshButton.disabled = false;
            allDistrictsRefreshButton.textContent = 'Perbarui Cuaca Semua Kecamatan';
        }
    }

    function startDistrictWeatherRefresh() {
        window.clearInterval(districtWeatherRefreshTimer);
        districtWeatherRefreshTimer = window.setInterval(
            loadAllDistrictWeather,
            WEATHER_AUTO_REFRESH_MS
        );
    }

    function closeModal() {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        window.clearInterval(districtWeatherRefreshTimer);
        trigger.focus();
    }

    function showMessage(message) {
        const paragraph = document.createElement('p');
        paragraph.textContent = message;
        content.replaceChildren(paragraph);
    }

    function addWeatherDetail(container, label, value) {
        const detail = document.createElement('div');
        detail.className = 'weather-detail';
        detail.append(document.createTextNode(label));
        const strong = document.createElement('strong');
        strong.textContent = value;
        detail.append(strong);
        container.append(detail);
    }

    async function loadWeather(location = BANDAR_LAMPUNG_CENTER, locationLabel = 'Bandar Lampung') {
        currentWeatherLocation = location;
        currentWeatherLabel = locationLabel;
        refreshButton.disabled = true;
        refreshButton.textContent = 'Memuat...';
        locationButton.disabled = true;
        title.textContent = locationLabel;
        showMessage(`Mengambil data cuaca ${locationLabel}...`);

        const params = new URLSearchParams({
            latitude: String(location.lat),
            longitude: String(location.lng),
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
            timezone: 'Asia/Jakarta'
        });

        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) throw new Error(`Layanan cuaca merespons HTTP ${response.status}.`);

            const data = await response.json();
            const current = data.current;
            if (!current || !Number.isFinite(current.temperature_2m) ||
                !Number.isFinite(current.weather_code)) {
                throw new Error('Data cuaca yang diterima tidak lengkap.');
            }

            const weather = WEATHER_CODES[current.weather_code] || {
                description: 'Kondisi cuaca tidak diketahui',
                icon: '🌡️'
            };
            const icon = document.createElement('div');
            icon.className = 'weather-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = weather.icon;

            const temperature = document.createElement('div');
            temperature.className = 'weather-temperature';
            temperature.textContent = `${Math.round(current.temperature_2m)}°C`;

            const description = document.createElement('div');
            description.className = 'weather-description';
            description.textContent = weather.description;

            const details = document.createElement('div');
            details.className = 'weather-details';
            addWeatherDetail(details, 'Terasa seperti', `${Math.round(current.apparent_temperature)}°C`);
            addWeatherDetail(details, 'Kelembapan', `${current.relative_humidity_2m}%`);
            addWeatherDetail(details, 'Angin', `${current.wind_speed_10m} km/jam`);

            const observedAt = document.createElement('small');
            observedAt.textContent = `Data: ${new Date(current.time).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Jakarta'
            })}`;

            const forecastArea = document.createElement('small');
            forecastArea.textContent = Number.isFinite(data.latitude) && Number.isFinite(data.longitude)
                ? `Prakiraan untuk area sekitar ${data.latitude.toFixed(3)}, ${data.longitude.toFixed(3)} (grid cuaca terdekat).`
                : 'Prakiraan merupakan estimasi untuk area sekitar, bukan pengukuran di setiap titik.';
            content.replaceChildren(icon, temperature, description, details, observedAt, forecastArea);
        } catch (error) {
            console.error(`Gagal memuat cuaca ${locationLabel}:`, error);
            showMessage('Cuaca tidak dapat dimuat. Periksa koneksi internet lalu coba lagi.');
        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = 'Muat Ulang Cuaca';
            locationButton.disabled = false;
        }
    }

    async function loadWeatherForDistrict() {
        const district = districtSelect.value;
        if (!district) {
            showMessage('Pilih kecamatan terlebih dahulu.');
            districtSelect.focus();
            return;
        }

        districtButton.disabled = true;
        districtButton.textContent = 'Mencari kecamatan...';
        showMessage(`Mencari lokasi Kecamatan ${district}...`);

        try {
            const locationCache = getCachedDistrictLocations();
            const location = await findDistrictLocation(district, locationCache);
            saveCachedDistrictLocations(locationCache);
            await loadWeather(location, `Kecamatan ${district}`);
        } catch (error) {
            console.error(`Gagal mencari lokasi Kecamatan ${district}:`, error);
            showMessage(`${error.message} Periksa koneksi internet atau coba lagi.`);
        } finally {
            districtButton.disabled = false;
            districtButton.textContent = 'Lihat Cuaca Kecamatan';
        }
    }

    async function loadWeatherAtCurrentLocation() {
        if (!navigator.geolocation) {
            showMessage('Browser tidak mendukung geolokasi. Cuaca Bandar Lampung tetap tersedia.');
            return;
        }

        locationButton.disabled = true;
        showMessage('Meminta izin lokasi perangkat...');
        navigator.geolocation.getCurrentPosition(async function(position) {
            const location = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            let locationLabel = `Lokasi Anda (${location.lat.toFixed(3)}, ${location.lng.toFixed(3)})`;

            try {
                const params = new URLSearchParams({
                    format: 'jsonv2',
                    lat: String(location.lat),
                    lon: String(location.lng),
                    zoom: '14',
                    addressdetails: '1'
                });
                const response = await requestNominatim(`https://nominatim.openstreetmap.org/reverse?${params}`);
                if (!response.ok) {
                    throw new Error(`Layanan lokasi merespons HTTP ${response.status}.`);
                }
                const result = await response.json();
                const address = result.address || {};
                const district = districtSelect.value || address.city_district;
                const nearbyArea = district || address.suburb || address.neighbourhood ||
                    address.village || address.town || address.city;
                if (nearbyArea) locationLabel = district ? `Kecamatan ${nearbyArea}` : nearbyArea;
            } catch (error) {
                console.warn('Nama kecamatan tidak dapat ditemukan:', error);
            }

            await loadWeather(location, locationLabel);
        }, function(error) {
            locationButton.disabled = false;
            const message = error.code === error.PERMISSION_DENIED
                ? 'Izin lokasi ditolak. Izinkan akses lokasi atau muat cuaca Bandar Lampung.'
                : 'Lokasi perangkat tidak dapat ditemukan. Muat cuaca Bandar Lampung sebagai gantinya.';
            showMessage(message);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        });
    }

    trigger.addEventListener('click', function() {
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        allDistrictsRefreshButton.focus();
        loadWeather();
        loadAllDistrictWeather();
        startDistrictWeatherRefresh();
    });
    refreshButton.addEventListener('click', () =>
        loadWeather(currentWeatherLocation, currentWeatherLabel)
    );
    districtButton.addEventListener('click', loadWeatherForDistrict);
    allDistrictsRefreshButton.addEventListener('click', loadAllDistrictWeather);
    locationButton.addEventListener('click', loadWeatherAtCurrentLocation);
    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
}

function initChatbot() {
    const launcher = document.getElementById('chatLauncher');
    const panel = document.getElementById('chatPanel');
    const closeButton = document.getElementById('chatClose');
    const resetButton = document.getElementById('chatReset');
    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    const sendButton = document.getElementById('chatSend');
    const messagesContainer = document.getElementById('chatMessages');
    const suggestions = document.getElementById('chatSuggestions');
    if (!launcher || !panel || !closeButton || !form || !input || !sendButton || !messagesContainer) return;

    function getTimeBasedGreeting() {
        const hour = new Date().getHours();
        if (hour >= 4 && hour < 11) return 'Selamat pagi! ☀️';
        if (hour >= 11 && hour < 15) return 'Selamat siang! ☀️';
        if (hour >= 15 && hour < 18) return 'Selamat sore! ⛅';
        return 'Selamat malam! 🌙';
    }

    function updateGreeting() {
        const greetingEl = document.getElementById('welcomeGreeting');
        if (greetingEl) {
            greetingEl.textContent = `${getTimeBasedGreeting()} Selamat Datang! 👋`;
        }
    }

    function addMessage(role, text, className = '') {
        const message = document.createElement('p');
        message.className = `chat-message ${role}${className ? ` ${className}` : ''}`;
        message.textContent = text;
        messagesContainer.append(message);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return message;
    }

    function openChat() {
        panel.hidden = false;
        launcher.setAttribute('aria-expanded', 'true');
        updateGreeting();
        input.focus();
    }

    function closeChat() {
        panel.hidden = true;
        launcher.setAttribute('aria-expanded', 'false');
        launcher.focus();
    }

    launcher.addEventListener('click', function() {
        if (panel.hidden) openChat();
        else closeChat();
    });
    closeButton.addEventListener('click', closeChat);

    if (resetButton) {
        resetButton.addEventListener('click', function() {
            const chatMessages = messagesContainer.querySelectorAll('.chat-message');
            chatMessages.forEach(msg => msg.remove());
            if (suggestions) suggestions.hidden = false;
            updateGreeting();
            input.value = '';
            input.focus();
            messagesContainer.scrollTop = 0;
        });
    }

    if (suggestions) {
        suggestions.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', function() {
                const prompt = button.getAttribute('data-prompt') || button.textContent.trim();
                input.value = prompt;
                form.requestSubmit();
            });
        });
    }

    input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    function getLocalAnswer(question) {
        const text = question.toLocaleLowerCase('id-ID')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        if (/\b(halo|hai|hi|hello|selamat pagi|selamat siang|selamat sore|selamat malam)\b/.test(text)) {
            return `${getTimeBasedGreeting()} Halo! Saya Asisten SmartWarga. Senang bisa membantu Anda. Tanyakan seputar cara membuat laporan, pelacakan status, titik lokasi peta, atau aturan foto aduan warga.`;
        }
        if (/(bantuan|panduan|menu|fitur|bisa apa)/.test(text)) {
            return 'Saya dapat memandu Anda mengenai:\n• 📝 Cara Buat Laporan Baru\n• 🔍 Cara Melacak Status Aduan\n• 📍 Penentuan Titik Lokasi Peta\n• 📸 Aturan Unggah Foto Bukti\n• 💾 Penyimpanan & Privasi Data\n\nSilakan pilih topik atau ketik pertanyaan langsung!';
        }
        if (/(lacak|tracking|melacak|cek status|status laporan|cari laporan)/.test(text)) {
            return 'Buka bagian Lacak, masukkan ID laporan atau email yang digunakan saat mengirim laporan, lalu tekan Cari. Status dan keterangan tindak lanjut diperbarui oleh Admin.';
        }
        if (/(buat|bikin|kirim|cara).*(lapor|aduan)|lapor.*(cara|bagaimana)/.test(text)) {
            return 'Untuk membuat laporan, buka bagian Lapor, isi nama, email, kategori, alamat, dan deskripsi. Pilih titik lokasi di peta atau gunakan GPS, lalu tekan Kirim Laporan. Simpan ID yang muncul untuk melacak laporan.';
        }
        if (/(simpan|tersimpan|penyimpanan|database|data laporan|hilang|perangkat|browser|privasi)/.test(text)) {
            return backendAvailable
                ? 'Laporan disimpan di database SQLite pada server aplikasi. Admin yang masuk dapat melihat semua laporan dan memperbarui statusnya.'
                : 'Dalam mode file langsung, laporan disimpan di penyimpanan browser perangkat ini. Jalankan server.py untuk mengaktifkan database bersama dan fitur Admin.';
        }
        if (/(foto|gambar|upload|unggah)/.test(text)) {
            return 'Foto bukti bersifat opsional namun sangat membantu verifikasi petugas. Gunakan gambar berformat JPG atau PNG dengan ukuran maksimal 2 MB.';
        }
        if (/(lokasi|alamat|peta|gps|koordinat|pin|titik)/.test(text)) {
            return 'Lokasi harus berada di wilayah Bandar Lampung. Anda dapat memilih titik langsung di peta atau menggunakan tombol GPS. Periksa kembali tanda pin lokasi sebelum menekan Kirim Laporan.';
        }
        if (/(kategori|jenis laporan|kerusakan)/.test(text)) {
            return 'Pilih kategori yang paling sesuai: Jalan Rusak, Lampu Mati, Drainase, Taman, Sampah, atau Lainnya. Jelaskan kondisi dan lokasi spesifik pada deskripsi.';
        }
        if (/(diterima|diproses|selesai|arti status|status)/.test(text)) {
            return 'Status Diterima berarti laporan tersimpan, Diproses berarti sedang ditangani, dan Selesai berarti penanganan ditandai rampung. Anda dapat melihat progresnya di menu Lacak.';
        }
        if (/(ai|gemini|internet|offline|api key|api-key|server|python)/.test(text)) {
            return 'Panduan chatbot ini berjalan lokal. Backend Python menyimpan laporan dan menyediakan login Admin; chatbot server opsional memerlukan GEMINI_API_KEY.';
        }
        if (/(169 target|target spesifik|target sdg|indikator sdg)/.test(text)) {
            return 'Dalam 17 SDGs, terdapat 169 Target Terukur yang disepakati PBB dan dikelompokkan oleh Bappenas RI ke dalam 4 Pilar: Lingkungan (57 target), Sosial (46 target), Ekonomi (54 target), dan Tata Kelola (12 target). SmartWarga berfokus pada 10 Target SDG 11 (Kota Berkelanjutan). Anda dapat mengklik tombol "169 Target spesifik" di bagian statistik untuk membuka rincian lengkapnya!';
        }
        if (/(sdg|edukasi|kota berkelanjutan)/.test(text)) {
            return 'SDG 11 bertujuan menjadikan kota dan permukiman inklusif, aman, tangguh, dan berkelanjutan. SmartWarga berfokus membantu penanganan sampah (target 11.6), perbaikan jalan & transportasi (target 11.2), dan ruang publik hijau (target 11.7). Anda dapat melihat rincian 169 target dengan mengklik kartu target di beranda.';
        }
        if (/(hapus|reset|bersihkan).*(laporan|riwayat|data)|(riwayat|laporan).*(hapus|reset|bersihkan)/.test(text)) {
            return 'Penghapusan data laporan tidak tersedia untuk warga. Hubungi pengelola aplikasi jika ada laporan yang perlu ditinjau.';
        }
        if (/(terima kasih|makasih|thanks)/.test(text)) {
            return 'Sama-sama! Senang bisa membantu Anda. Jika ada hal lain yang ingin ditanyakan seputar SmartWarga, silakan ketik kapan saja.';
        }
        return 'Maaf, saya belum memahami pertanyaan itu. Coba tanyakan tentang cara membuat laporan, pelacakan status, titik lokasi peta, aturan foto, atau penyimpanan data.';
    }

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        const text = input.value.trim();
        if (!text || sendButton.disabled) return;

        input.value = '';
        if (suggestions) suggestions.hidden = true;
        addMessage('user', text);
        addMessage('assistant', getLocalAnswer(text));
        input.focus();
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && !panel.hidden) closeChat();
    });

    // Inisialisasi teks sapaan awal
    updateGreeting();
}

let refreshMapMarkers = function() {};

// ============ HALAMAN INDEX ============
async function updateStats() {
    const totalEl = document.getElementById('totalLaporan');
    if (!totalEl) return;
    await backendReady;
    if (backendAvailable) {
        const stats = await apiRequest('/api/stats');
        totalEl.textContent = stats.total;
        document.getElementById('totalSelesai').textContent = stats.selesai;
        document.getElementById('totalProses').textContent = stats.diproses;
        document.getElementById('totalWarga').textContent = stats.warga;
        return;
    }

    const reports = getStoredReports();
    totalEl.textContent = reports.length;
    document.getElementById('totalSelesai').textContent =
        reports.filter(report => report.status === 'Selesai').length;
    document.getElementById('totalProses').textContent =
        reports.filter(report => ['Diproses', 'Ditindaklanjuti'].includes(report.status)).length;
    document.getElementById('totalWarga').textContent =
        new Set(reports.map(report => report.email.toLowerCase())).size;
}

// ============ HALAMAN LAPOR ============
function initFormLaporan() {
    const form = document.getElementById('formLaporan');
    if (!form) return;
    const photoInput = document.getElementById('foto');
    const photoPreview = document.getElementById('photoPreview');
    const photoPreviewImage = document.getElementById('photoPreviewImage');
    const photoPreviewName = document.getElementById('photoPreviewName');
    const photoStatus = document.getElementById('photoStatus');
    const description = document.getElementById('deskripsi');
    const descriptionCount = document.getElementById('descriptionCount');
    const removePhotoButton = document.getElementById('btnHapusFoto');
    let photoPreviewUrl = '';

    function clearPhotoPreview() {
        if (photoPreviewUrl) {
            URL.revokeObjectURL(photoPreviewUrl);
            photoPreviewUrl = '';
        }
        photoPreview.hidden = true;
        photoPreviewImage.removeAttribute('src');
        photoPreviewName.textContent = '';
    }

    photoInput.addEventListener('change', function() {
        clearPhotoPreview();
        photoStatus.classList.remove('is-error');
        photoStatus.textContent = '';
        const file = photoInput.files[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
            photoStatus.classList.add('is-error');
            photoStatus.textContent = 'Pilih foto JPG atau PNG dengan ukuran maksimal 2 MB.';
            photoInput.value = '';
            return;
        }

        photoPreviewUrl = URL.createObjectURL(file);
        photoPreviewImage.src = photoPreviewUrl;
        photoPreviewName.textContent = file.name;
        photoPreview.hidden = false;
        photoStatus.textContent = 'Foto berhasil dipilih.';
    });

    removePhotoButton.addEventListener('click', function() {
        photoInput.value = '';
        photoStatus.textContent = 'Foto dihapus dari laporan.';
        clearPhotoPreview();
        photoInput.focus();
    });

    form.addEventListener('reset', function() {
        clearPhotoPreview();
        photoStatus.classList.remove('is-error');
        photoStatus.textContent = '';
        descriptionCount.textContent = '0 karakter';
    });

    description.addEventListener('input', function() {
        const count = description.value.length;
        descriptionCount.textContent = `${count} karakter`;
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitButton = form.querySelector('[type="submit"]');
        const latitude = document.getElementById('lat').value;
        const longitude = document.getElementById('lng').value;
        const lat = Number(latitude);
        const lng = Number(longitude);
        const photoFile = document.getElementById('foto').files[0];
        if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            document.getElementById('addressMapStatus').textContent =
                'Pilih hasil alamat atau titik langsung di peta, lalu pastikan pin muncul sebelum mengirim laporan.';
            document.getElementById('mapForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        if (!isWithinBandarLampung(lat, lng)) {
            alert('Lokasi laporan harus berada di wilayah Bandar Lampung.');
            return;
        }
        if (photoFile && (!['image/jpeg', 'image/png'].includes(photoFile.type) ||
            photoFile.size > 2 * 1024 * 1024)) {
            alert('Foto bukti harus JPG atau PNG dengan ukuran maksimal 2 MB.');
            return;
        }
        submitButton.disabled = true;
        try {
            const foto = photoFile ? await readFileAsDataUrl(photoFile) : null;
            const report = {
                nama: document.getElementById('nama').value.trim(),
                email: document.getElementById('email').value.trim(),
                kategori: document.getElementById('kategori').value,
                alamat: document.getElementById('alamat').value.trim(),
                deskripsi: document.getElementById('deskripsi').value.trim(),
                lat,
                lng,
                foto
            };
            await backendReady;
            const result = backendAvailable
                ? await apiRequest('/api/reports', { method: 'POST', body: report })
                : saveLocalReport(report);
            const refreshResults = await Promise.allSettled([
                updateStats(),
                refreshMapMarkers()
            ]);
            const refreshFailed = refreshResults.some(result => result.status === 'rejected');
            refreshResults.forEach(result => {
                if (result.status === 'rejected') {
                    console.error('Laporan tersimpan, tetapi tampilan gagal diperbarui:', result.reason);
                }
            });
            await Swal.fire({
                icon: refreshFailed ? 'warning' : 'success',
                title: refreshFailed ? 'Laporan tersimpan' : 'Laporan Berhasil Disimpan!',
                text: `ID Laporan Anda: ${result.id}. Simpan ID ini untuk melacak status.` +
                    (backendAvailable
                        ? ' Laporan tersimpan di database server.'
                        : ' Laporan hanya tersimpan di browser dan perangkat ini.') +
                    (refreshFailed ? ' Beberapa tampilan belum diperbarui; muat ulang halaman.' : ''),
                confirmButtonColor: '#10b981',
                background: '#fff',
                color: '#1e293b'
            });
            form.reset();
            document.getElementById('searchLaporan').value = result.id;
            document.getElementById('btnCari').click();
            window.location.hash = 'lacak';
        } catch (error) {
            showRequestError(error);
        } finally {
            submitButton.disabled = false;
        }
    });
}

function initFormMap() {
    const mapEl = document.getElementById('mapForm');
    if (!mapEl) return;

    const map = new google.maps.Map(mapEl, {
        center: BANDAR_LAMPUNG_CENTER,
        zoom: 13,
        restriction: {
            latLngBounds: BANDAR_LAMPUNG_BOUNDS,
            strictBounds: true
        }
    });
    let marker;
    let addressLookupId = 0;
    let lastAddressQuery = '';
    const addressInput = document.getElementById('alamat');
    const addressStatus = document.getElementById('addressMapStatus');
    const addressCandidates = document.getElementById('addressCandidates');

    function setMarker(position) {
        if (!isWithinBandarLampung(position.lat(), position.lng())) {
            alert('Pilih lokasi di dalam wilayah Bandar Lampung.');
            return;
        }
        if (marker) marker.setMap(null);
        marker = new google.maps.Marker({ map, position });
        document.getElementById('lat').value = position.lat();
        document.getElementById('lng').value = position.lng();
    }

    addressInput.addEventListener('input', function() {
        addressLookupId += 1;
        lastAddressQuery = '';
        addressCandidates.replaceChildren();
        document.getElementById('lat').value = '';
        document.getElementById('lng').value = '';
        if (marker) {
            marker.setMap(null);
            marker = null;
        }
        const address = this.value.trim();

        if (address.length < 5) {
            addressStatus.textContent = '';
            return;
        }

        addressStatus.textContent = 'Selesai mengetik? Klik di luar kolom untuk mencari lokasi di peta.';
    });

    addressInput.addEventListener('blur', async function() {
        const address = this.value.trim();
        if (address.length < 5 || address === lastAddressQuery) return;

        const queryTerms = address.toLocaleLowerCase('id-ID')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter(term => term.length > 1 && ![
                'jalan', 'jl', 'nomor', 'no', 'bandar', 'lampung', 'indonesia',
                'kecamatan', 'kec', 'kelurahan', 'kel'
            ].includes(term));
        if (queryTerms.length === 0) {
            addressStatus.textContent =
                'Tambahkan nama jalan, nomor, gedung, atau patokan lokasi selain nama kota.';
            return;
        }

        const lookupId = addressLookupId;
        lastAddressQuery = address;
        addressStatus.textContent = 'Mencari alamat di peta...';
        const params = new URLSearchParams({
            q: `${address}, Bandar Lampung, Indonesia`,
            format: 'jsonv2',
            limit: '5',
            countrycodes: 'id',
            viewbox: [
                BANDAR_LAMPUNG_BOUNDS.west,
                BANDAR_LAMPUNG_BOUNDS.north,
                BANDAR_LAMPUNG_BOUNDS.east,
                BANDAR_LAMPUNG_BOUNDS.south
            ].join(','),
            bounded: '1',
            'accept-language': 'id'
        });

        try {
            const response = await requestNominatim(
                `https://nominatim.openstreetmap.org/search?${params}`
            );
            if (!response.ok) {
                throw new Error(`Layanan pencarian alamat merespons HTTP ${response.status}.`);
            }
            const results = await response.json();
            if (lookupId !== addressLookupId) return;
            if (!Array.isArray(results) || results.length === 0) {
                addressStatus.textContent = 'Alamat tidak ditemukan. Coba tambahkan nama jalan atau kelurahan.';
                return;
            }

            const minimumMatchedTerms = Math.ceil(queryTerms.length / 2);
            const candidates = results.filter(result => {
                if (!isWithinBandarLampung(Number(result.lat), Number(result.lon))) return false;
                const resultTerms = new Set(result.display_name.toLocaleLowerCase('id-ID')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .split(/[^a-z0-9]+/));
                const matchedTerms = queryTerms.filter(term => resultTerms.has(term)).length;
                return matchedTerms >= minimumMatchedTerms;
            });
            if (candidates.length === 0) {
                addressStatus.textContent =
                    'Tidak ada hasil yang cukup cocok dengan kata kunci alamat di Bandar Lampung. Periksa ejaan atau coba nama jalan/patokan lain.';
                return;
            }

            addressStatus.textContent =
                'Pilih alamat yang paling cocok. Hasil pencarian belum dipasang sebagai pin.';
            const fragment = document.createDocumentFragment();
            candidates.forEach(candidate => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'address-candidate';
                button.textContent = candidate.display_name;
                button.setAttribute('aria-pressed', 'false');
                button.addEventListener('click', function() {
                    const latitude = Number(candidate.lat);
                    const longitude = Number(candidate.lon);
                    if (!isWithinBandarLampung(latitude, longitude)) {
                        addressStatus.textContent = 'Alamat yang dipilih berada di luar Bandar Lampung.';
                        return;
                    }

                    const position = new google.maps.LatLng(latitude, longitude);
                    map.setCenter(position);
                    map.setZoom(17);
                    setMarker(position);
                    addressCandidates.querySelectorAll('.address-candidate').forEach(item => {
                        item.setAttribute('aria-pressed', String(item === button));
                    });
                    addressStatus.textContent =
                        `Pin dipasang pada: ${candidate.display_name}. Periksa kembali posisi pin di peta.`;
                });
                fragment.append(button);
            });
            addressCandidates.replaceChildren(fragment);
        } catch (error) {
            if (lookupId !== addressLookupId) return;
            lastAddressQuery = '';
            addressStatus.textContent = 'Pencarian alamat gagal. Periksa koneksi internet atau pilih titik di peta.';
            console.error('Pencarian alamat dengan Nominatim gagal:', error);
        }
    });

    map.addListener('click', event => {
        if (event.latLng) {
            setMarker(event.latLng);
            addressStatus.textContent = 'Titik lokasi dipilih secara manual di peta.';
        }
    });

    document.getElementById('btnLokasi').addEventListener('click', function() {
        if (!navigator.geolocation) {
            alert('Browser Anda tidak mendukung fitur lokasi.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function(pos) {
                const position = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
                if (!isWithinBandarLampung(position.lat(), position.lng())) {
                    alert('Lokasi Anda berada di luar wilayah Bandar Lampung.');
                    return;
                }
                map.setCenter(position);
                map.setZoom(15);
                setMarker(position);
                addressStatus.textContent = 'Lokasi Anda dipilih di peta.';
            },
            function(error) {
                alert(`Lokasi tidak dapat diakses: ${error.message}`);
            }
        );
    });
}

// ============ HALAMAN LACAK ============
function initLacak() {
    const btnCari = document.getElementById('btnCari');
    if (!btnCari) return;
    const hasil = document.getElementById('hasilLacak');

    btnCari.addEventListener('click', async function() {
        const query = document.getElementById('searchLaporan').value.trim();
        if (!query) { alert('Masukkan ID atau Email!'); return; }

        btnCari.disabled = true;
        try {
            await backendReady;
            const found = backendAvailable
                ? (await apiRequest(`/api/reports/lookup?q=${encodeURIComponent(query)}`)).reports
                : (() => {
                    const reports = getStoredReports();
                    return query.match(/^\d+$/)
                        ? reports.filter(report => report.id === Number(query))
                        : reports.filter(report => report.email.toLowerCase() === query.toLowerCase());
                })();
            if (found.length === 0) {
                hasil.style.display = 'block';
                hasil.innerHTML = '<p style="text-align:center;color:#ef4444;">❌ Laporan tidak ditemukan.</p>';
                return;
            }

            hasil.style.display = 'block';
            hasil.innerHTML = found.map(renderTrackedReport).join('');
        } catch (error) {
            showRequestError(error);
        } finally {
            btnCari.disabled = false;
        }
    });

    function renderTrackedReport(report) {
        const status = REPORT_STATUSES.includes(report.status) ? report.status : 'Diterima';
        const hasBeenVerified = ['Diproses', 'Ditindaklanjuti', 'Selesai'].includes(status);
        const hasBeenActedOn = ['Ditindaklanjuti', 'Selesai'].includes(status);
        const updatedAt = report.status_updated_at
            ? new Date(report.status_updated_at).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short'
            })
            : '';
        const statusNote = report.status_keterangan
            ? `<div class="report-status-note"><strong>Keterangan:</strong> ${escapeHtml(report.status_keterangan)}</div>`
            : '<div class="report-status-note is-empty">Belum ada keterangan tindak lanjut.</div>';
        const updateTime = updatedAt
            ? `<small class="report-status-updated">Status diperbarui ${escapeHtml(updatedAt)}</small>`
            : '';

        return `
            <article class="tracked-report status-card-${status}">
                <header class="tracked-report-header">
                    <h3>Laporan #${escapeHtml(report.id)}</h3>
                    <span class="status-badge status-${status}">${status}</span>
                </header>
                <div class="tracked-report-details">
                    <p><strong>Kategori:</strong> ${escapeHtml(report.kategori)}</p>
                    <p><strong>Alamat:</strong> ${escapeHtml(report.alamat)}</p>
                    <p><strong>Tanggal:</strong> ${escapeHtml(report.tanggal)}</p>
                    <p><strong>Deskripsi:</strong> ${escapeHtml(report.deskripsi)}</p>
                </div>
                ${statusNote}
                ${updateTime}
                <div class="timeline">
                    <div class="timeline-item active">✓ Diterima</div>
                    <div class="timeline-item ${hasBeenVerified ? 'active' : ''}">✓ Diverifikasi</div>
                    <div class="timeline-item ${['Diproses', 'Ditindaklanjuti', 'Selesai'].includes(status) ? 'active' : ''}">🔧 Sedang ditangani</div>
                    <div class="timeline-item ${hasBeenActedOn ? 'active' : ''}">🔵 Ditindaklanjuti</div>
                    <div class="timeline-item ${status === 'Selesai' ? 'active' : ''}">✅ Selesai</div>
                </div>
            </article>
        `;
    }
}

function renderAdminReports(reports) {
    const container = document.getElementById('adminReports');
    if (!reports.length) {
        container.innerHTML = '<p class="admin-empty">Belum ada laporan yang masuk.</p>';
        return;
    }

    container.innerHTML = reports.map(report => {
        const statusOptions = REPORT_STATUSES.map(status =>
            `<option value="${status}" ${status === report.status ? 'selected' : ''}>${status}</option>`
        ).join('');
        const updatedAt = report.status_updated_at
            ? new Date(report.status_updated_at).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short'
            })
            : '';
        return `
            <article class="admin-report-card">
                <header class="tracked-report-header">
                    <h3>Laporan #${escapeHtml(report.id)} · ${escapeHtml(report.kategori)}</h3>
                    <span class="status-badge status-${escapeHtml(report.status)}">${escapeHtml(report.status)}</span>
                </header>
                <div class="tracked-report-details">
                    <p><strong>Pelapor:</strong> ${escapeHtml(report.nama)} · ${escapeHtml(report.email)}</p>
                    <p><strong>Alamat:</strong> ${escapeHtml(report.alamat)}</p>
                    <p><strong>Tanggal:</strong> ${escapeHtml(report.tanggal)}</p>
                    <p><strong>Deskripsi:</strong> ${escapeHtml(report.deskripsi)}</p>
                    <p><strong>Bukti foto:</strong> ${report.has_foto ? 'Terlampir' : 'Tidak ada'}</p>
                </div>
                ${report.has_foto ? `
                    <button type="button" class="btn btn-outline admin-photo-button"
                        data-report-id="${escapeHtml(report.id)}" aria-expanded="false">
                        Lihat foto bukti
                    </button>
                    <img class="admin-evidence-photo" alt="Foto bukti laporan #${escapeHtml(report.id)}" hidden>
                ` : ''}
                ${updatedAt ? `<small class="report-status-updated">Diperbarui ${escapeHtml(updatedAt)}</small>` : ''}
                <form class="admin-status-form" data-report-id="${escapeHtml(report.id)}">
                    <label for="adminStatus-${escapeHtml(report.id)}">Status</label>
                    <select id="adminStatus-${escapeHtml(report.id)}" name="status" required>${statusOptions}</select>
                    <label for="adminNote-${escapeHtml(report.id)}">Keterangan tindak lanjut</label>
                    <textarea id="adminNote-${escapeHtml(report.id)}" name="status_keterangan"
                        maxlength="500" rows="3" placeholder="Tambahkan keterangan untuk warga">${escapeHtml(report.status_keterangan || '')}</textarea>
                    <small>Keterangan wajib diisi untuk status Ditindaklanjuti atau Selesai.</small>
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </form>
                <button type="button" class="btn btn-outline-danger admin-delete-button" data-report-id="${escapeHtml(report.id)}">
                    🗑️ Hapus Laporan
                </button>
            </article>
        `;
    }).join('');
}

async function loadAdminDashboard() {
    if (!backendAvailable || !adminAuthenticated) return;
    const [reportData, stats] = await Promise.all([
        apiRequest('/api/reports'),
        apiRequest('/api/stats')
    ]);
    document.getElementById('adminTotal').textContent = stats.total;
    document.getElementById('adminWarga').textContent = stats.warga;
    document.getElementById('adminProses').textContent = stats.diproses;
    document.getElementById('adminSelesai').textContent = stats.selesai;
    renderAdminReports(reportData.reports);
}

function initAdmin() {
    const accessButton = document.getElementById('adminAccess');
    const loginDialog = document.getElementById('adminLoginDialog');
    const loginForm = document.getElementById('adminLoginForm');
    const loginError = document.getElementById('adminLoginError');
    const dashboard = document.getElementById('adminDashboard');
    const logoutButton = document.getElementById('adminLogout');
    const cancelButton = document.getElementById('adminLoginCancel');
    if (!accessButton || !loginDialog || !loginForm || !dashboard) return;

    function updateAccessState() {
        dashboard.hidden = !adminAuthenticated;
        accessButton.textContent = adminAuthenticated ? 'Dashboard Admin' : 'Admin';
    }

    accessButton.addEventListener('click', async function() {
        await backendReady;
        if (!backendAvailable) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'info',
                    title: 'Admin memerlukan backend',
                    text: 'Jalankan server dengan perintah python server.py untuk mengaktifkan login Admin.'
                });
            }
            return;
        }
        if (adminAuthenticated) {
            dashboard.scrollIntoView({ behavior: 'smooth' });
        } else {
            loginError.textContent = '';
            loginDialog.showModal();
            loginForm.elements.password.focus();
        }
    });

    cancelButton.addEventListener('click', () => loginDialog.close());

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const submitButton = loginForm.querySelector('[type="submit"]');
        submitButton.disabled = true;
        loginError.textContent = '';
        try {
            await apiRequest('/api/auth/login', {
                method: 'POST',
                body: { password: loginForm.elements.password.value }
            });
            adminAuthenticated = true;
            loginForm.reset();
            loginDialog.close();
            updateAccessState();
            await loadAdminDashboard();
            dashboard.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            loginError.textContent = error.message;
        } finally {
            submitButton.disabled = false;
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', async function() {
            logoutButton.disabled = true;
            try {
                await apiRequest('/api/auth/logout', { method: 'POST', body: {} });
                adminAuthenticated = false;
                document.getElementById('adminReports').replaceChildren();
                updateAccessState();
            } catch (error) {
                showRequestError(error);
            } finally {
                logoutButton.disabled = false;
            }
        });
    }

    dashboard.addEventListener('submit', async function(event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.matches('.admin-status-form')) return;
        event.preventDefault();
        const status = form.elements.status.value;
        const note = form.elements.status_keterangan.value.trim();
        if (['Ditindaklanjuti', 'Selesai'].includes(status) && !note) {
            form.elements.status_keterangan.setCustomValidity('Keterangan wajib diisi untuk status ini.');
            form.elements.status_keterangan.reportValidity();
            return;
        }
        form.elements.status_keterangan.setCustomValidity('');

        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            await apiRequest(`/api/reports/${encodeURIComponent(form.dataset.reportId)}`, {
                method: 'PATCH',
                body: { status, status_keterangan: note }
            });
            await Promise.all([loadAdminDashboard(), updateStats(), refreshMapMarkers()]);
        } catch (error) {
            showRequestError(error);
        } finally {
            if (form.isConnected) button.disabled = false;
        }
    });
    dashboard.addEventListener('click', async function(event) {
        const button = event.target instanceof Element
            ? event.target.closest('.admin-photo-button, .admin-delete-button')
            : null;
        if (!(button instanceof HTMLButtonElement)) return;
        const isDelete = button.classList.contains('admin-delete-button');

        if (isDelete) {
            if (!window.confirm('Yakin ingin menghapus laporan ini? Tindakan tidak dapat dibatalkan.')) return;
            button.disabled = true;
            try {
                await apiRequest(`/api/reports/${encodeURIComponent(button.dataset.reportId)}`, { method: 'DELETE' });
                await loadAdminDashboard();
                await Promise.all([updateStats(), refreshMapMarkers()]);
            } catch (error) {
                showRequestError(error);
            } finally {
                if (button.isConnected) button.disabled = false;
            }
            return;
        }

        const image = button.nextElementSibling;
        if (!(image instanceof HTMLImageElement)) return;
        if (!image.hidden) {
            image.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            button.textContent = 'Lihat foto bukti';
            return;
        }

        button.disabled = true;
        try {
            const photo = await apiRequest(
                `/api/reports/${encodeURIComponent(button.dataset.reportId)}/photo`
            );
            image.src = photo.dataUrl;
            image.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            button.textContent = 'Sembunyikan foto';
        } catch (error) {
            showRequestError(error);
        } finally {
            button.disabled = false;
        }
    });
    dashboard.addEventListener('input', function(event) {
        if (event.target instanceof HTMLTextAreaElement) {
            event.target.setCustomValidity('');
        }
    });

    updateAccessState();
    if (adminAuthenticated) {
        loadAdminDashboard().catch(showRequestError);
    }
}

// ============ HALAMAN PETA ============
function initPeta() {
    const mapEl = document.getElementById('mapFull');
    if (!mapEl) return;

    const map = new google.maps.Map(mapEl, {
        center: BANDAR_LAMPUNG_CENTER,
        zoom: 13,
        restriction: {
            latLngBounds: BANDAR_LAMPUNG_BOUNDS,
            strictBounds: true
        }
    });

    let markers = [];
    const infoWindow = new google.maps.InfoWindow();
    let currentFilter = 'all';

    async function renderMarkers(filter = 'all') {
        currentFilter = filter;
        markers.forEach(marker => marker.setMap(null));
        markers = [];
        await backendReady;
        const reports = backendAvailable
            ? (await apiRequest('/api/reports/map')).reports
            : getStoredReports();
        const filtered = reports.filter(l =>
            isWithinBandarLampung(Number(l.lat), Number(l.lng)) &&
            (filter === 'all' || l.status === filter)
        );
        const markerColors = {
            Diterima: '#fbbf24',
            Diproses: '#f97316',
            Ditindaklanjuti: '#3b82f6',
            Selesai: '#10b981'
        };

        filtered.forEach(l => {
            const color = markerColors[l.status] || '#fbbf24';
            const marker = new google.maps.Marker({
                map,
                position: { lat: Number(l.lat), lng: Number(l.lng) },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3,
                    scale: 9
                }
            });
            marker.addListener('click', function() {
                infoWindow.setContent(`
                <strong>#${l.id} - ${escapeHtml(l.kategori)}</strong><br>
                ${escapeHtml(l.alamat)}<br>
                <span>Status: <strong>${escapeHtml(l.status)}</strong></span>
                ${l.status_keterangan ? `<br><small>Keterangan: ${escapeHtml(l.status_keterangan)}</small>` : ''}
                `);
                infoWindow.open({ map, anchor: marker });
            });
            markers.push(marker);
        });
    }

    refreshMapMarkers = function() {
        return renderMarkers(currentFilter);
    };

    renderMarkers().catch(showRequestError);

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderMarkers(this.dataset.filter).catch(showRequestError);
        });
    });
}

let googleMapsReady = false;
let documentReady = false;
let mapsInitialized = false;

function initializeMaps() {
    if (!googleMapsReady || !documentReady || mapsInitialized) return;
    mapsInitialized = true;
    initFormMap();
    initPeta();
}

window.initGoogleMaps = function() {
    googleMapsReady = true;
    initializeMaps();
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function() {
    const sdgGoalsTrigger = document.getElementById('sdgGoalsTrigger');
    const sdgGoalsDialog = document.getElementById('sdgGoalsDialog');
    const sdgDialogClose = document.getElementById('sdgDialogClose');
    if (sdgGoalsTrigger && sdgGoalsDialog && sdgDialogClose) {
        sdgGoalsTrigger.addEventListener('click', function() {
            sdgGoalsDialog.showModal();
        });
        sdgDialogClose.addEventListener('click', function() {
            sdgGoalsDialog.close();
            sdgGoalsTrigger.focus();
        });
        sdgGoalsDialog.addEventListener('click', function(event) {
            if (event.target === sdgGoalsDialog) {
                sdgGoalsDialog.close();
                sdgGoalsTrigger.focus();
            }
        });
    }

    // Inisialisasi Dialog 169 Target Spesifik SDGs
    const sdgTargetsTrigger = document.getElementById('sdgTargetsTrigger');
    const sdg11Trigger = document.getElementById('sdg11Trigger');
    const sdgTargetsDialog = document.getElementById('sdgTargetsDialog');
    const sdgTargetsDialogClose = document.getElementById('sdgTargetsDialogClose');

    if (sdgTargetsDialog && sdgTargetsDialogClose) {
        function switchSdgTab(tabId) {
            const tabsNav = sdgTargetsDialog.querySelectorAll('.sdg-tab-btn');
            const contents = sdgTargetsDialog.querySelectorAll('.sdg-tab-content');

            tabsNav.forEach(btn => {
                const isTarget = btn.getAttribute('data-tab') === tabId;
                btn.classList.toggle('active', isTarget);
                btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            });

            contents.forEach(content => {
                const isTarget = content.id === tabId;
                content.hidden = !isTarget;
                content.classList.toggle('active', isTarget);
            });
        }

        if (sdgTargetsTrigger) {
            sdgTargetsTrigger.addEventListener('click', function() {
                switchSdgTab('tab-all-goals');
                sdgTargetsDialog.showModal();
            });
        }

        if (sdg11Trigger) {
            sdg11Trigger.addEventListener('click', function() {
                switchSdgTab('tab-sdg11');
                sdgTargetsDialog.showModal();
            });
        }

        sdgTargetsDialogClose.addEventListener('click', function() {
            sdgTargetsDialog.close();
            const activeTrigger = sdgTargetsTrigger || sdg11Trigger;
            if (activeTrigger) activeTrigger.focus();
        });

        sdgTargetsDialog.addEventListener('click', function(event) {
            if (event.target === sdgTargetsDialog) {
                sdgTargetsDialog.close();
                const activeTrigger = sdgTargetsTrigger || sdg11Trigger;
                if (activeTrigger) activeTrigger.focus();
            }
        });

        // Event Navigasi Tab
        sdgTargetsDialog.querySelectorAll('.sdg-tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const targetTab = btn.getAttribute('data-tab');
                switchSdgTab(targetTab);
            });
        });

        // Filter 4 Pilar Pembangunan Berkelanjutan
        const pillarCards = sdgTargetsDialog.querySelectorAll('.pillar-card');
        const goalCards = sdgTargetsDialog.querySelectorAll('.goal-detail-card');
        pillarCards.forEach(card => {
            card.addEventListener('click', function() {
                const pillar = card.getAttribute('data-pillar');
                pillarCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                // Beralih ke tab 17 goals
                switchSdgTab('tab-all-goals');

                goalCards.forEach(gCard => {
                    if (pillar === 'all' || gCard.getAttribute('data-pilar') === pillar) {
                        gCard.style.display = '';
                    } else {
                        gCard.style.display = 'none';
                    }
                });
            });
        });

        // Pencarian Real-time Target Spesifik
        const searchInput = document.getElementById('targetSearchInput');
        const searchCount = document.getElementById('targetSearchCount');
        if (searchInput && searchCount) {
            searchInput.addEventListener('input', function() {
                const query = searchInput.value.trim().toLowerCase();
                const targetCards11 = sdgTargetsDialog.querySelectorAll('.target-item-card');

                if (!query) {
                    searchCount.textContent = 'Menampilkan semua target';
                    goalCards.forEach(c => c.style.display = '');
                    targetCards11.forEach(c => c.style.display = '');
                    return;
                }

                let matchesCount = 0;
                goalCards.forEach(c => {
                    const text = (c.getAttribute('data-keywords') || '') + ' ' + c.textContent.toLowerCase();
                    const match = text.includes(query);
                    c.style.display = match ? '' : 'none';
                    if (match) matchesCount++;
                });

                targetCards11.forEach(c => {
                    const text = (c.getAttribute('data-keywords') || '') + ' ' + c.textContent.toLowerCase();
                    const match = text.includes(query);
                    c.style.display = match ? '' : 'none';
                    if (match) matchesCount++;
                });

                searchCount.textContent = matchesCount > 0 ? `Ditemukan ${matchesCount} target cocok` : 'Tidak ada target yang cocok';
            });
        }
    }

    document.getElementById('btnCloseApiError').addEventListener('click', function() {
        document.getElementById('apiErrorNotice').hidden = true;
    });
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    function closeNavMenu() {
        navMenu.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Buka menu navigasi');
    }
    navToggle.addEventListener('click', function() {
        const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', String(!isOpen));
        navToggle.setAttribute('aria-label', isOpen ? 'Buka menu navigasi' : 'Tutup menu navigasi');
        navMenu.classList.toggle('is-open', !isOpen);
    });
    navMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNavMenu));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeNavMenu();
    });
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) closeNavMenu();
    });
    updateStats().catch(showRequestError);
    initFormLaporan();
    initLacak();
    initAdmin();
    initWeatherWidget();
    initChatbot();
    documentReady = true;
    initializeMaps();
    const navLinks = document.querySelectorAll('.nav-menu a[href^="#"]');
    function updateActiveNav() {
        const currentHash = window.location.hash || '#beranda';
        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === currentHash));
    }
    window.addEventListener('hashchange', updateActiveNav);
    updateActiveNav();

    const navSections = Array.from(navLinks)
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);
    function updateActiveSection() {
        const navHeight = document.querySelector('.navbar').getBoundingClientRect().height;
        let activeSection = navSections[0];
        navSections.forEach(section => {
            if (section.getBoundingClientRect().top <= navHeight + 120) {
                activeSection = section;
            }
        });
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
            activeSection = navSections[navSections.length - 1];
        }
        const activeHash = `#${activeSection.id}`;
        navLinks.forEach(link =>
            link.classList.toggle('active', link.getAttribute('href') === activeHash)
        );
    }
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    updateActiveSection();

    if ('IntersectionObserver' in window &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const revealItems = document.querySelectorAll(
                '.stat-card, .feature, .step-card, .form-card, .track-box, .map-legend, .faq-item'
            );
            const revealObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                });
            }, { threshold: 0.12 });
            revealItems.forEach(item => {
                item.classList.add('scroll-reveal');
                revealObserver.observe(item);
            });
    }
});
// SAMARA Loading Screen – sembunyikan setelah halaman siap
window.addEventListener('load', function () {
    const loader = document.getElementById('samaraLoader');
    if (!loader) return;
    // Beri sedikit waktu agar animasi progress bar selesai
    setTimeout(function () {
        loader.classList.add('hidden');
        // Hapus dari DOM setelah transisi selesai
        setTimeout(function () {
            loader.remove();
        }, 650);
    }, 1800);
});