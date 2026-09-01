import { sql } from './neon-config.js';

// ===================== STATE =====================
let currentUser = JSON.parse(localStorage.getItem('pmii_user') || 'null');
let kasTransactions = [];    // transaksi kas umum
let kegiatanList = [];       // daftar kegiatan
let kegTransactions = [];    // transaksi kegiatan aktif
let beritaList = [];         // daftar berita
let beritaFilter = 'all';    // filter status berita
let usersList = [];          // daftar akun pengguna (super admin)
let aspirasiList = [];       // daftar aspirasi kader
let currentImagesBase64 = [];       // array of images for transaction
let currentNewsImagesBase64 = [];   // array of images for news
let activeKegiatanId = null; // kegiatan yang sedang dibuka
let activeKegiatanData = null;
let currentActiveTxId = null;
let currentActiveTxObj = null;
let currentReadingNews = null;
let kasPeriod = 'all';
let financeChartInstance = null;
let currentChartMode = 'kategori'; // 'kategori' | 'tren'

// Helper for multi-image parsing
const parseImages = (imgData) => {
    if (!imgData) return [];
    if (Array.isArray(imgData)) return imgData;
    if (typeof imgData === 'string') {
        const trimmed = imgData.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                return [imgData];
            }
        }
        return [imgData];
    }
    return [];
};

const compressImageFile = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (ev) => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 800;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => resolve(null);
        };
        reader.onerror = () => resolve(null);
    });
};

// ===================== FORMATTERS =====================
const formatRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatDate = (d) => { if (!d) return '-'; return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };

const filterByPeriod = (list, period) => {
    if (period === 'all') return list;
    const now = new Date(); now.setHours(23,59,59,999);
    let cutoff = new Date();
    if (period === 'week') cutoff.setDate(now.getDate() - 7);
    else if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
    else if (period === 'year') cutoff.setFullYear(now.getFullYear() - 1);
    cutoff.setHours(0,0,0,0);
    return list.filter(tx => { const d = new Date(tx.tanggal); return d >= cutoff && d <= now; });
};

// ===================== DARK MODE =====================
const initDarkMode = () => {
    const isDark = localStorage.getItem('pmii_dark_mode') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark');
        updateDarkIcons(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateDarkIcons(false);
    }
};

const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('pmii_dark_mode', isDark ? 'true' : 'false');
    updateDarkIcons(isDark);
};

const updateDarkIcons = (isDark) => {
    const iconLanding = document.querySelector('#btnToggleDarkLanding i');
    const iconMain = document.querySelector('#btnToggleDarkMain i');
    if (iconLanding) iconLanding.className = isDark ? 'fa-solid fa-sun text-xs text-yellow-400' : 'fa-solid fa-moon text-xs';
    if (iconMain) iconMain.className = isDark ? 'fa-solid fa-sun text-xs text-yellow-300' : 'fa-solid fa-moon text-xs';
};

document.getElementById('btnToggleDarkLanding')?.addEventListener('click', toggleDarkMode);
document.getElementById('btnToggleDarkMain')?.addEventListener('click', toggleDarkMode);

// ===================== NAVIGATION =====================
const views = document.querySelectorAll('.view-section');
const navBtns = document.querySelectorAll('.nav-btn');
const mainHeader = document.getElementById('mainHeader');
const detailHeader = document.getElementById('detailHeader');
const bottomNav = document.getElementById('bottomNav');

const showView = (viewId) => {
    views.forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');

    // Update bottom navigation active status
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.classList.contains('bg-primary') || btn.id === 'fabAdd') return;
        if (btn.getAttribute('data-target') === viewId) {
            btn.classList.add('text-primary');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.remove('text-primary');
            btn.classList.add('text-gray-400');
        }
    });
};

const showMainLayout = () => {
    mainHeader.classList.remove('hidden');
    detailHeader.classList.add('hidden');
    bottomNav.classList.remove('hidden');
};

const showDetailLayout = () => {
    mainHeader.classList.add('hidden');
    detailHeader.classList.remove('hidden');
    bottomNav.classList.add('hidden');
};

navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const navBtn = e.currentTarget;
        const targetId = navBtn.getAttribute('data-target');
        if (!targetId) return;

        // If clicking FAB (+), open form for Kas Umum
        if (targetId === 'viewForm') {
            openFormForKasUmum();
            return;
        }

        showMainLayout();
        showView(targetId);

        navBtns.forEach(n => {
            if (n.classList.contains('bg-primary')) return;
            n.classList.remove('text-primary'); n.classList.add('text-gray-400');
        });
        if (!navBtn.classList.contains('bg-primary')) {
            navBtn.classList.add('text-primary'); navBtn.classList.remove('text-gray-400');
        }
    });
});

// ===================== FILTER BUTTONS =====================
document.querySelectorAll('.kas-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        kasPeriod = e.currentTarget.dataset.period;
        activateFilterBtn(e.currentTarget.parentElement, e.currentTarget);
        renderKasUmum();
    });
});

// ===================== FORM LOGIC =====================
const txForm = document.getElementById('txForm');
const typeBtns = document.querySelectorAll('.type-btn');
const inputType = document.getElementById('inputType');
const inputNominal = document.getElementById('inputNominal');
const inputJudul = document.getElementById('inputJudul');
const inputKategori = document.getElementById('inputKategori');
const inputTanggal = document.getElementById('inputTanggal');
const inputCatatan = document.getElementById('inputCatatan');
const inputKegiatanId = document.getElementById('inputKegiatanId');
const previewContainer = document.getElementById('previewContainer');
const imgPreview = document.getElementById('imgPreview');
const btnRemoveImage = document.getElementById('btnRemoveImage');
const btnSubmitTx = document.getElementById('btnSubmitTx');
const btnSubmitText = document.getElementById('btnSubmitText');
const spinnerSubmit = document.getElementById('spinnerSubmit');

const kategoriPemasukan = ['Iuran Anggota', 'Sponsorship', 'Donasi', 'Pencairan Dana', 'Lainnya'];
const kategoriPengeluaran = ['Konsumsi', 'Perlengkapan', 'Transportasi', 'Jasa/Tukang', 'Operasional', 'Lainnya'];

const updateKategoriOptions = (type) => {
    const options = type === 'in' ? kategoriPemasukan : kategoriPengeluaran;
    inputKategori.innerHTML = '';
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        inputKategori.appendChild(el);
    });
};

typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        inputType.value = type;
        typeBtns.forEach(b => { b.classList.remove('bg-white', 'shadow', 'text-success', 'text-danger'); b.classList.add('text-gray-500'); });
        btn.classList.add('bg-white', 'shadow'); btn.classList.remove('text-gray-500');
        if (type === 'in') btn.classList.add('text-success'); else btn.classList.add('text-danger');
        updateKategoriOptions(type);
    });
});
// Initialize default categories
updateKategoriOptions('in');

inputNominal.addEventListener('input', function() {
    let v = this.value.replace(/[^0-9]/g, '');
    if (v !== '') this.value = new Intl.NumberFormat('id-ID').format(parseInt(v));
});

inputTanggal.valueAsDate = new Date();

// Open form for Kas Umum
const openFormForKasUmum = () => {
    resetForm();
    inputKegiatanId.value = '';
    const titleEl = document.getElementById('formTitle');
    if (titleEl) titleEl.textContent = 'Catat Kas Umum';
    showMainLayout();
    showView('viewForm');
    document.getElementById('mainContainer')?.scrollTo({ top: 0, behavior: 'instant' });
};

// Open form for Kegiatan
const openFormForKegiatan = (kegId, kegNama) => {
    resetForm();
    inputKegiatanId.value = kegId;
    const titleEl = document.getElementById('formTitle');
    if (titleEl) titleEl.textContent = `Catat: ${kegNama}`;
    showDetailLayout();
    showView('viewForm');
    document.getElementById('mainContainer')?.scrollTo({ top: 0, behavior: 'instant' });
};

document.getElementById('fabAdd')?.addEventListener('click', (e) => {
    e.preventDefault();
    openFormForKasUmum();
});

document.getElementById('btnBackFromForm')?.addEventListener('click', () => {
    if (inputKegiatanId.value) {
        // Go back to detail kegiatan
        openDetailKegiatan(inputKegiatanId.value);
    } else {
        showMainLayout();
        showView('viewKasUmum');
    }
});

// ===================== TX MULTI-IMAGE HANDLING =====================
const renderTxImageThumbnails = () => {
    const container = document.getElementById('previewContainer');
    const grid = document.getElementById('txImageThumbnailsGrid');
    const countEl = document.getElementById('txtCountImages');
    if (!container || !grid) return;

    grid.innerHTML = '';
    if (currentImagesBase64.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    if (countEl) countEl.textContent = `${currentImagesBase64.length} Bukti Foto Terpilih`;

    currentImagesBase64.forEach((b64, idx) => {
        const item = document.createElement('div');
        item.className = 'relative group rounded-xl overflow-hidden border border-gray-200 bg-white aspect-square shadow-2xs';
        item.innerHTML = `
            <img src="${b64}" class="w-full h-full object-cover" alt="Thumb ${idx + 1}">
            <button type="button" onclick="window.removeTxImage(${idx})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow text-[10px] hover:bg-red-600">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        grid.appendChild(item);
    });
};

window.removeTxImage = (idx) => {
    currentImagesBase64.splice(idx, 1);
    renderTxImageThumbnails();
};

document.getElementById('btnClearAllImages')?.addEventListener('click', () => {
    currentImagesBase64 = [];
    renderTxImageThumbnails();
    const f1 = document.getElementById('inputFileGallery'); if (f1) f1.value = '';
    const f2 = document.getElementById('inputFileCamera'); if (f2) f2.value = '';
});

const handleTxImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
        const compressed = await compressImageFile(file);
        if (compressed) currentImagesBase64.push(compressed);
    }
    renderTxImageThumbnails();
    e.target.value = '';
};

document.getElementById('inputFileGallery')?.addEventListener('change', handleTxImageSelect);
document.getElementById('inputFileCamera')?.addEventListener('change', handleTxImageSelect);

// ===================== SUBMIT TRANSACTION =====================
txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nominalRaw = parseInt(inputNominal.value.replace(/[^0-9]/g, ''));
    if (isNaN(nominalRaw) || nominalRaw <= 0) { Swal.fire('Error', 'Nominal tidak valid', 'error'); return; }

    const kegId = inputKegiatanId.value || null;
    const serializedImages = currentImagesBase64.length > 0 ? JSON.stringify(currentImagesBase64) : null;

    try {
        btnSubmitTx.disabled = true; btnSubmitText.textContent = 'Menyimpan...'; spinnerSubmit.classList.remove('hidden');

        if (!sql) {
            setTimeout(() => { Swal.fire('Info', 'Simulasi berhasil!', 'info'); resetForm(); }, 1000);
            return;
        }

        await sql`
            INSERT INTO transaksi (type, nominal, judul, kategori, tanggal, catatan, image_base64, kegiatan_id) 
            VALUES (${inputType.value}, ${nominalRaw}, ${inputJudul.value}, ${inputKategori.value}, ${inputTanggal.value}, ${inputCatatan.value}, ${serializedImages}, ${kegId})
        `;

        Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Transaksi berhasil disimpan!', timer: 1500, showConfirmButton: false });
        resetForm();

        if (kegId) {
            await fetchKegiatanTransactions(kegId);
            openDetailKegiatan(kegId);
        } else {
            await fetchKasUmum();
            showMainLayout();
            showView('viewKasUmum');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal menyimpan: ' + (error.message || ''), 'error');
    } finally {
        btnSubmitTx.disabled = false; btnSubmitText.textContent = 'Simpan Transaksi'; spinnerSubmit.classList.add('hidden');
    }
});

const resetForm = () => {
    txForm.reset(); inputNominal.value = ''; inputTanggal.valueAsDate = new Date();
    currentImagesBase64 = [];
    renderTxImageThumbnails();
    const f1 = document.getElementById('inputFileGallery'); if (f1) f1.value = '';
    const f2 = document.getElementById('inputFileCamera'); if (f2) f2.value = '';
    // Reset type buttons
    typeBtns.forEach(b => { b.classList.remove('bg-white', 'shadow', 'text-success', 'text-danger'); b.classList.add('text-gray-500'); });
    typeBtns[0].classList.add('bg-white', 'shadow', 'text-success'); typeBtns[0].classList.remove('text-gray-500');
    inputType.value = 'in';
    updateKategoriOptions('in');
};

// ===================== FETCH DATA =====================
const fetchKasUmum = async () => {
    if (!sql) {
        kasTransactions = [
            { id: '1', type: 'in', nominal: 500000, judul: 'Iuran Bulan Agustus', kategori: 'Iuran Anggota', tanggal: '2026-08-15', catatan: '10 orang' },
            { id: '2', type: 'out', nominal: 150000, judul: 'ATK Sekretariat', kategori: 'Perlengkapan', tanggal: '2026-08-20', catatan: '' },
        ];
        renderKasUmum(); return;
    }
    try {
        // Fetch all transactions so Kas Umum accumulates everything (both general and per-kegiatan)
        kasTransactions = await sql`SELECT t.*, k.nama as nama_kegiatan FROM transaksi t LEFT JOIN kegiatan k ON t.kegiatan_id = k.id ORDER BY t.tanggal DESC, t.created_at DESC` || [];
        renderKasUmum();
    } catch (err) { console.error(err); }
};

const fetchKegiatanList = async () => {
    if (!sql) {
        kegiatanList = [
            { id: 'mock1', nama: 'Seminar Nasional 2026', deskripsi: 'Acara tahunan', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-09-03' },
        ];
        renderKegiatanList(); return;
    }
    try {
        kegiatanList = await sql`SELECT * FROM kegiatan ORDER BY created_at DESC` || [];
        renderKegiatanList();
    } catch (err) { console.error(err); }
};

const fetchKegiatanTransactions = async (kegId) => {
    if (!sql) {
        kegTransactions = [
            { id: 'mock-k1', type: 'in', nominal: 2000000, judul: 'Dana Sponsor', kategori: 'Sponsorship', tanggal: '2026-09-01', catatan: 'PT ABC' },
        ];
        return;
    }
    try {
        kegTransactions = await sql`SELECT * FROM transaksi WHERE kegiatan_id = ${kegId} ORDER BY tanggal DESC, created_at DESC` || [];
    } catch (err) { console.error(err); }
};

const fetchKegiatan = fetchKegiatanList;

// ===================== FINANCE CHART (CHART.JS) =====================
const renderFinanceChart = () => {
    const canvas = document.getElementById('financeChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const filtered = filterByPeriod(kasTransactions, kasPeriod);

    if (financeChartInstance) {
        financeChartInstance.destroy();
        financeChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');

    if (currentChartMode === 'kategori') {
        // Group expenses by category
        const catMap = {};
        filtered.forEach(tx => {
            if (tx.type === 'out') {
                const cat = tx.kategori || 'Lainnya';
                catMap[cat] = (catMap[cat] || 0) + Number(tx.nominal);
            }
        });

        const labels = Object.keys(catMap);
        const data = Object.values(catMap);

        if (labels.length === 0) {
            const totalIn = filtered.reduce((acc, t) => t.type === 'in' ? acc + Number(t.nominal) : acc, 0);
            if (totalIn > 0) {
                labels.push('Pemasukan Masuk');
                data.push(totalIn);
            } else {
                labels.push('Belum Ada Data');
                data.push(1);
            }
        }

        financeChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
                    ],
                    borderWidth: 2,
                    borderColor: isDark ? '#151f38' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 10,
                            font: { size: 10 },
                            color: isDark ? '#cbd5e1' : '#475569'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.raw || 0;
                                return ' Rp ' + Number(val).toLocaleString('id-ID');
                            }
                        }
                    }
                }
            }
        });
    } else {
        // Tren Masuk vs Keluar
        let totalIn = 0, totalOut = 0;
        filtered.forEach(tx => {
            if (tx.type === 'in') totalIn += Number(tx.nominal);
            else totalOut += Number(tx.nominal);
        });

        financeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Pemasukan', 'Pengeluaran'],
                datasets: [{
                    label: 'Nominal (Rp)',
                    data: [totalIn, totalOut],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Rp ' + Number(context.raw).toLocaleString('id-ID');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 9 },
                            color: isDark ? '#94a3b8' : '#64748b',
                            callback: (v) => 'Rp ' + (v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : (v/1000).toFixed(0) + 'K')
                        },
                        grid: {
                            color: isDark ? '#1e293b' : '#f1f5f9'
                        }
                    },
                    x: {
                        ticks: {
                            font: { size: 11, weight: 'bold' },
                            color: isDark ? '#cbd5e1' : '#475569'
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }
};

document.getElementById('btnChartKategori')?.addEventListener('click', () => {
    currentChartMode = 'kategori';
    document.getElementById('btnChartKategori')?.classList.add('bg-white', 'text-primary', 'shadow-xs');
    document.getElementById('btnChartKategori')?.classList.remove('text-gray-500');
    document.getElementById('btnChartTren')?.classList.remove('bg-white', 'text-primary', 'shadow-xs');
    document.getElementById('btnChartTren')?.classList.add('text-gray-500');
    renderFinanceChart();
});

document.getElementById('btnChartTren')?.addEventListener('click', () => {
    currentChartMode = 'tren';
    document.getElementById('btnChartTren')?.classList.add('bg-white', 'text-primary', 'shadow-xs');
    document.getElementById('btnChartTren')?.classList.remove('text-gray-500');
    document.getElementById('btnChartKategori')?.classList.remove('bg-white', 'text-primary', 'shadow-xs');
    document.getElementById('btnChartKategori')?.classList.add('text-gray-500');
    renderFinanceChart();
});

// ===================== RENDER KAS UMUM =====================
const renderKasUmum = () => {
    const filtered = filterByPeriod(kasTransactions, kasPeriod);
    let totalIn = 0, totalOut = 0;
    filtered.forEach(tx => { if (tx.type === 'in') totalIn += Number(tx.nominal); else totalOut += Number(tx.nominal); });

    document.getElementById('txtKasSaldo').textContent = formatRupiah(totalIn - totalOut);
    document.getElementById('txtKasMasuk').textContent = formatRupiah(totalIn);
    document.getElementById('txtKasKeluar').textContent = formatRupiah(totalOut);

    renderFinanceChart();

    const list = document.getElementById('kasUmumTxList');
    list.innerHTML = '';
    if (filtered.length === 0) { list.innerHTML = '<div class="text-center text-gray-400 py-6 italic text-sm">Tidak ada transaksi di periode ini</div>'; return; }
    filtered.forEach(tx => list.appendChild(createTxElement(tx)));
};

// ===================== RENDER KEGIATAN LIST =====================
const renderKegiatanList = () => {
    const container = document.getElementById('kegiatanList');
    container.innerHTML = '';
    if (kegiatanList.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10 italic text-sm">Belum ada kegiatan. Buat kegiatan baru!</div>';
        return;
    }
    kegiatanList.forEach(keg => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition cursor-pointer";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-start space-x-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                        <i class="fa-solid fa-calendar-check"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-800">${keg.nama}</h3>
                        ${keg.deskripsi ? `<p class="text-xs text-gray-400 mt-1 line-clamp-1">${keg.deskripsi}</p>` : ''}
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right text-gray-300 mt-2"></i>
            </div>
        `;
        card.addEventListener('click', () => openDetailKegiatan(keg.id));
        container.appendChild(card);
    });
};

// ===================== DETAIL KEGIATAN =====================
const openDetailKegiatan = async (kegId) => {
    activeKegiatanId = kegId;
    activeKegiatanData = kegiatanList.find(k => k.id === kegId);
    if (!activeKegiatanData) { await fetchKegiatanList(); activeKegiatanData = kegiatanList.find(k => k.id === kegId); }

    document.getElementById('detailHeaderTitle').textContent = activeKegiatanData?.nama || 'Kegiatan';
    document.getElementById('detailHeaderDate').textContent = '';

    const descContainer = document.getElementById('kegDeskripsiContainer');
    if (activeKegiatanData?.deskripsi) {
        document.getElementById('kegDeskripsi').textContent = activeKegiatanData.deskripsi;
        descContainer.classList.remove('hidden');
    } else {
        descContainer.classList.add('hidden');
    }

    await fetchKegiatanTransactions(kegId);
    renderKegiatanDetail();
    showDetailLayout();
    showView('viewDetailKegiatan');
};

const renderKegiatanDetail = () => {
    let totalIn = 0, totalOut = 0;
    kegTransactions.forEach(tx => { if (tx.type === 'in') totalIn += Number(tx.nominal); else totalOut += Number(tx.nominal); });

    document.getElementById('txtKegSaldo').textContent = formatRupiah(totalIn - totalOut);
    document.getElementById('txtKegMasuk').textContent = formatRupiah(totalIn);
    document.getElementById('txtKegKeluar').textContent = formatRupiah(totalOut);

    const list = document.getElementById('kegTxList');
    list.innerHTML = '';
    if (kegTransactions.length === 0) { list.innerHTML = '<div class="text-center text-gray-400 py-6 italic text-sm">Belum ada transaksi di kegiatan ini</div>'; return; }
    kegTransactions.forEach(tx => list.appendChild(createTxElement(tx)));
};

document.getElementById('btnAddTxKegiatan')?.addEventListener('click', () => {
    if (!activeKegiatanId || !activeKegiatanData) return;
    openFormForKegiatan(activeKegiatanId, activeKegiatanData.nama);
});

document.getElementById('btnBackFromDetail')?.addEventListener('click', () => {
    activeKegiatanId = null; activeKegiatanData = null;
    showMainLayout();
    showView('viewKegiatan');
});

// ===================== BUAT KEGIATAN =====================
document.getElementById('btnBuatKegiatan')?.addEventListener('click', async () => {
    const { value: formValues } = await Swal.fire({
        title: 'Buat Kegiatan Baru',
        html: `
            <input id="swalNama" class="swal2-input" placeholder="Nama Kegiatan" style="font-size:14px">
            <input id="swalDesc" class="swal2-input" placeholder="Deskripsi (opsional)" style="font-size:14px">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Buat',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#3b82f6',
        preConfirm: () => {
            const nama = document.getElementById('swalNama').value;
            if (!nama) { Swal.showValidationMessage('Nama kegiatan wajib diisi'); return false; }
            return {
                nama,
                deskripsi: document.getElementById('swalDesc').value,
                tanggal_mulai: null,
                tanggal_selesai: null
            };
        }
    });

    if (!formValues) return;

    if (!sql) { Swal.fire('Info', 'Simulasi berhasil!', 'info'); return; }

    try {
        await sql`INSERT INTO kegiatan (nama, deskripsi, tanggal_mulai, tanggal_selesai) VALUES (${formValues.nama}, ${formValues.deskripsi}, ${formValues.tanggal_mulai}, ${formValues.tanggal_selesai})`;
        Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Kegiatan berhasil dibuat!', timer: 1500, showConfirmButton: false });
        await fetchKegiatanList();
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Gagal membuat kegiatan', 'error');
    }
});

// ===================== HAPUS KEGIATAN =====================
document.getElementById('btnDeleteKegiatan')?.addEventListener('click', async () => {
    if (!activeKegiatanId) return;
    const result = await Swal.fire({
        title: 'Hapus Kegiatan?',
        text: 'Semua transaksi di dalam kegiatan ini juga akan terhapus!',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#ef4444', cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Ya, Hapus!', cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;
    if (!sql) { Swal.fire('Terhapus', 'Simulasi berhasil', 'success'); return; }
    try {
        await sql`DELETE FROM kegiatan WHERE id = ${activeKegiatanId}`;
        Swal.fire('Terhapus!', 'Kegiatan telah dihapus.', 'success');
        activeKegiatanId = null; activeKegiatanData = null;
        showMainLayout(); showView('viewKegiatan');
        await fetchKegiatanList();
    } catch (err) { console.error(err); Swal.fire('Error', 'Gagal menghapus', 'error'); }
});

// ===================== TX ELEMENT =====================
const createTxElement = (tx) => {
    const div = document.createElement('div');
    div.className = "bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center active:bg-gray-50 transition cursor-pointer";
    const isMasuk = tx.type === 'in';
    const iconClass = isMasuk ? 'fa-arrow-down text-success bg-green-50' : 'fa-arrow-up text-danger bg-red-50';
    const sign = isMasuk ? '+' : '-';
    const textColor = isMasuk ? 'text-success' : 'text-gray-800';
    div.innerHTML = `
        <div class="flex items-center space-x-3 overflow-hidden">
            <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconClass}">
                <i class="fa-solid ${iconClass.split(' ')[0]}"></i>
            </div>
            <div class="truncate pr-2">
                <p class="font-bold text-sm text-gray-800 truncate">${tx.judul}</p>
                <p class="text-[10px] text-gray-500">${formatDate(tx.tanggal)} &bull; ${tx.kategori}${tx.nama_kegiatan ? ` &bull; <span class="text-indigo-500 font-semibold">${tx.nama_kegiatan}</span>` : ''}</p>
            </div>
        </div>
        <div class="text-right shrink-0">
            <p class="font-bold text-sm ${textColor}">${sign}${formatRupiah(tx.nominal)}</p>
        </div>
    `;
    div.addEventListener('click', () => openDetailModal(tx));
    return div;
};

// ===================== MODAL DETAIL =====================
const txModal = document.getElementById('txModal');
const txModalContent = document.getElementById('txModalContent');
const modalImageContainer = document.getElementById('modalImageContainer');

const openDetailModal = (tx) => {
    currentActiveTxId = tx.id;
    currentActiveTxObj = tx;
    const isMasuk = tx.type === 'in';

    const btnKuitansi = document.getElementById('btnCetakKuitansi');
    if (btnKuitansi) {
        if (isMasuk) btnKuitansi.classList.remove('hidden');
        else btnKuitansi.classList.add('hidden');
    }

    document.getElementById('modalBadge').textContent = isMasuk ? 'Pemasukan' : 'Pengeluaran';
    document.getElementById('modalBadge').className = `text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide ${isMasuk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    document.getElementById('modalJudul').textContent = tx.judul;
    document.getElementById('modalKategori').innerHTML = `<i class="fa-solid fa-tag"></i> ${tx.kategori}${tx.nama_kegiatan ? ` &bull; <span class="text-indigo-500">${tx.nama_kegiatan}</span>` : ''}`;
    document.getElementById('modalTanggal').textContent = formatDate(tx.tanggal);
    document.getElementById('modalNominal').textContent = formatRupiah(tx.nominal);
    document.getElementById('modalNominal').className = `text-xl font-extrabold ${isMasuk ? 'text-green-600' : 'text-red-600'}`;
    document.getElementById('modalCatatan').textContent = tx.catatan || '-';

    const images = parseImages(tx.image_base64);
    const noImgEl = document.getElementById('modalNoImage');
    const gridEl = document.getElementById('modalImagesGrid');

    if (images.length > 0) {
        noImgEl?.classList.add('hidden');
        gridEl?.classList.remove('hidden');
        if (gridEl) {
            gridEl.innerHTML = '';
            images.forEach((imgB64, i) => {
                const imgCard = document.createElement('div');
                imgCard.className = 'border rounded-xl bg-gray-100 h-28 flex items-center justify-center overflow-hidden cursor-pointer group relative shadow-2xs';
                imgCard.innerHTML = `
                    <img src="${imgB64}" class="w-full h-full object-cover" alt="Bukti ${i + 1}">
                    <div class="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center text-white transition">
                        <i class="fa-solid fa-magnifying-glass-plus text-lg"></i>
                    </div>
                `;
                imgCard.onclick = () => {
                    document.getElementById('zoomedImage').src = imgB64;
                    document.getElementById('btnDownloadImage').href = imgB64;
                    document.getElementById('imageZoomModal').classList.remove('hidden');
                    document.getElementById('imageZoomModal').classList.add('flex');
                };
                gridEl.appendChild(imgCard);
            });
        }
    } else {
        noImgEl?.classList.remove('hidden');
        gridEl?.classList.add('hidden');
        if (gridEl) gridEl.innerHTML = '';
    }

    txModal.classList.add('active');
    setTimeout(() => { txModalContent.classList.remove('scale-95', 'opacity-0'); txModalContent.classList.add('scale-100', 'opacity-100'); }, 10);
};

// ===================== KUITANSI GENERATOR =====================
const angkaTerbilang = (n) => {
    n = Math.abs(Math.floor(n));
    const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    if (n < 12) return satuan[n];
    if (n < 20) return angkaTerbilang(n - 10) + ' Belas';
    if (n < 100) return (angkaTerbilang(Math.floor(n / 10)) + ' Puluh ' + satuan[n % 10]).trim();
    if (n < 200) return ('Seratus ' + angkaTerbilang(n - 100)).trim();
    if (n < 1000) return (angkaTerbilang(Math.floor(n / 100)) + ' Ratus ' + angkaTerbilang(n % 100)).trim();
    if (n < 2000) return ('Seribu ' + angkaTerbilang(n - 1000)).trim();
    if (n < 1000000) return (angkaTerbilang(Math.floor(n / 1000)) + ' Ribu ' + angkaTerbilang(n % 1000)).trim();
    if (n < 1000000000) return (angkaTerbilang(Math.floor(n / 1000000)) + ' Juta ' + angkaTerbilang(n % 1000000)).trim();
    if (n < 1000000000000) return (angkaTerbilang(Math.floor(n / 1000000000)) + ' Miliar ' + angkaTerbilang(n % 1000000000)).trim();
    return n.toString();
};

const generateKuitansiPDF = async (tx) => {
    if (!tx || tx.type !== 'in') {
        Swal.fire('Info', 'Kuitansi hanya dapat dicetak untuk transaksi pemasukan/iuran.', 'info');
        return;
    }

    const shortId = (tx.id || '').substring(0, 8).toUpperCase() || '001';
    const tahun = new Date(tx.tanggal || Date.now()).getFullYear();
    const terbilangText = angkaTerbilang(tx.nominal) + ' Rupiah';

    const container = document.getElementById('kuitansiTemplate');
    if (!container) return;

    const html = `
        <div style="font-family: Arial, Helvetica, sans-serif; width: 100%; max-width: 680px; padding: 20px 24px; color: #1e293b; background: #ffffff; border: 2px solid #1d4ed8; border-radius: 10px; position: relative; box-sizing: border-box; margin: 0 auto;">
            <!-- Watermark Logo -->
            <div style="position: absolute; top: 35px; left: 0; width: 100%; text-align: center; opacity: 0.07; pointer-events: none;">
                <img src="./logo.jpg" style="width: 190px; height: 190px; object-fit: contain; display: inline-block;">
            </div>

            <!-- Kop Surat Kuitansi -->
            <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 12px;">
                <tr>
                    <td style="width: 55px; vertical-align: middle; padding-bottom: 10px;">
                        <img src="./logo.jpg" style="width: 50px; height: 50px; object-fit: contain; border-radius: 50%;">
                    </td>
                    <td style="text-align: center; vertical-align: middle; padding-bottom: 10px;">
                        <h2 style="margin: 0; font-size: 13px; font-weight: 900; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">PENGURUS CABANG PERGERAKAN MAHASISWA ISLAM INDONESIA</h2>
                        <h3 style="margin: 3px 0 0 0; font-size: 12px; font-weight: 800; color: #1d4ed8; letter-spacing: 0.5px;">(PC PMII) KABUPATEN SAMBAS</h3>
                        <p style="margin: 3px 0 0 0; font-size: 8.5px; color: #64748b;">Sekretariat: Jl. Raya Sejangkung, Desa Sebayan, Kec. Sambas &bull; WA: 0831-4006-3145</p>
                    </td>
                </tr>
            </table>

            <!-- Header Title & Nomor -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
                <tr>
                    <td style="text-align: left;">
                        <span style="background: #1d4ed8; color: #ffffff; padding: 4px 12px; border-radius: 5px; font-weight: 800; font-size: 10px; letter-spacing: 1px; display: inline-block;">KUITANSI TANDA TERIMA</span>
                    </td>
                    <td style="text-align: right; font-size: 9.5px; font-weight: bold; color: #475569;">
                        No: KWT/PC-PMII-SBS/${tahun}/${shortId}
                    </td>
                </tr>
            </table>

            <!-- Detail Data Kuitansi -->
            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px;">
                <tr>
                    <td style="width: 140px; padding: 5px 0; color: #475569; font-weight: bold;">Telah Diterima Dari</td>
                    <td style="width: 15px; padding: 5px 0;">:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #0f172a; border-bottom: 1px dotted #94a3b8;">${tx.judul}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #475569; font-weight: bold;">Uang Sejumlah</td>
                    <td style="padding: 5px 0;">:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #1e3a8a; font-style: italic; border-bottom: 1px dotted #94a3b8; background: #f8fafc;">
                        "${terbilangText}"
                    </td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #475569; font-weight: bold;">Untuk Pembayaran</td>
                    <td style="padding: 5px 0;">:</td>
                    <td style="padding: 5px 0; color: #334155; border-bottom: 1px dotted #94a3b8;">${tx.catatan || tx.kategori || 'Penerimaan Kas PMII'}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #475569; font-weight: bold;">Kategori Transaksi</td>
                    <td style="padding: 5px 0;">:</td>
                    <td style="padding: 5px 0; color: #334155; border-bottom: 1px dotted #94a3b8;">${tx.kategori}${tx.nama_kegiatan ? ` (Kegiatan: ${tx.nama_kegiatan})` : ''}</td>
                </tr>
            </table>

            <!-- Nominal & Tanda Tangan -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr>
                    <td style="vertical-align: bottom; text-align: left;">
                        <div style="border: 2px solid #16a34a; background: #f0fdf4; padding: 6px 14px; border-radius: 8px; display: inline-block;">
                            <div style="font-size: 8.5px; color: #15803d; font-weight: bold; text-transform: uppercase;">Jumlah Nominal</div>
                            <div style="font-size: 15px; font-weight: 800; color: #15803d; margin-top: 2px;">${formatRupiah(tx.nominal)}</div>
                        </div>
                    </td>
                    <td style="vertical-align: bottom; text-align: center; width: 200px;">
                        <p style="margin: 0; font-size: 9.5px; color: #475569;">Sambas, ${formatDate(tx.tanggal)}</p>
                        <p style="margin: 2px 0 0 0; font-size: 9.5px; font-weight: bold; color: #0f172a;">Bendahara Umum / Penerima,</p>
                        <div style="height: 38px;"></div>
                        <p style="margin: 0; font-size: 10.5px; font-weight: 800; color: #0f172a; text-decoration: underline;">GYARWIN SYARIF WIJAYA</p>
                        <p style="margin: 0; font-size: 8.5px; color: #64748b;">PC PMII Kab. Sambas</p>
                    </td>
                </tr>
            </table>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';

    Swal.fire({
        title: 'Mempersiapkan Kuitansi...',
        text: 'Sedang membuat PDF kuitansi resmi...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const opt = {
        margin: [6, 6, 6, 6],
        filename: `Kuitansi-PMII-${(tx.judul || 'Iuran').replace(/[^a-zA-Z0-9]/g, '_')}-${shortId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' }
    };

    try {
        await html2pdf().set(opt).from(container).save();
        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'Kuitansi Berhasil Dicetak!',
            text: 'File PDF kuitansi tanda terima sah telah diunduh.',
            timer: 2000,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('Kuitansi error:', err);
        Swal.fire('Error', 'Gagal membuat kuitansi PDF: ' + err.message, 'error');
    } finally {
        container.style.display = 'none';
        container.innerHTML = '';
    }
};

document.getElementById('btnCetakKuitansi')?.addEventListener('click', () => {
    let tx = currentActiveTxObj;
    if (!tx && currentActiveTxId) {
        tx = kasTransactions.find(t => t.id === currentActiveTxId) || kegTransactions.find(t => t.id === currentActiveTxId);
    }
    if (tx) {
        generateKuitansiPDF(tx);
    } else {
        Swal.fire('Info', 'Data transaksi tidak ditemukan.', 'warning');
    }
});

document.getElementById('btnCloseModal').addEventListener('click', () => {
    txModalContent.classList.remove('scale-100', 'opacity-100');
    txModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { txModal.classList.remove('active'); }, 200);
});

document.getElementById('btnCloseZoom').addEventListener('click', () => {
    document.getElementById('imageZoomModal').classList.add('hidden');
    document.getElementById('imageZoomModal').classList.remove('flex');
});

// ===================== DELETE TX =====================
document.getElementById('btnDeleteTx').addEventListener('click', async () => {
    if (!currentActiveTxId) return;
    const result = await Swal.fire({
        title: 'Hapus Transaksi?', text: 'Data yang dihapus tidak dapat dikembalikan!',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Ya, Hapus!', cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;

    if (!sql) { Swal.fire('Terhapus', 'Simulasi berhasil', 'success'); document.getElementById('btnCloseModal').click(); return; }

    try {
        await sql`DELETE FROM transaksi WHERE id = ${currentActiveTxId}`;
        document.getElementById('btnCloseModal').click();
        Swal.fire('Terhapus!', 'Transaksi telah dihapus.', 'success');
        // Refresh the correct view
        if (activeKegiatanId) {
            await fetchKegiatanTransactions(activeKegiatanId);
            renderKegiatanDetail();
        } else {
            await fetchKasUmum();
        }
    } catch (err) { console.error(err); Swal.fire('Error', 'Gagal menghapus', 'error'); }
});

// ===================== EXPORT PDF =====================
const generatePDF = (title, txList, periodLabel) => {
    if (txList.length === 0) { Swal.fire('Info', 'Tidak ada data untuk diekspor', 'info'); return; }

    let totalIn = 0, totalOut = 0;
    let rows = '';
    txList.forEach((tx, i) => {
        const jenis = tx.type === 'in' ? 'Masuk' : 'Keluar';
        const color = tx.type === 'in' ? '#10b981' : '#ef4444';
        if (tx.type === 'in') totalIn += Number(tx.nominal); else totalOut += Number(tx.nominal);
        rows += `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:11px">${i + 1}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${formatDate(tx.tanggal)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px"><span style="color:${color};font-weight:bold">${jenis}</span></td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${tx.kategori}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${tx.judul}${tx.nama_kegiatan ? `<br><span style="color:#6366f1;font-size:9px">[Keg: ${tx.nama_kegiatan}]</span>` : ''}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:11px">${formatRupiah(tx.nominal)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280">${tx.catatan || '-'}</td>
        </tr>`;
    });

    const html = `
        <div style="font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:0 auto;">
            <div style="text-align:center;margin-bottom:20px;">
                <h1 style="font-size:18px;color:#1e3a5f;margin:0;">Laporan Keuangan</h1>
                <h2 style="font-size:14px;color:#3b82f6;margin:4px 0;">${title}</h2>
                <p style="font-size:11px;color:#6b7280;">Periode: ${periodLabel} | Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:16px;gap:8px;">
                <div style="flex:1;background:#ecfdf5;border-radius:8px;padding:10px;text-align:center;">
                    <p style="font-size:10px;color:#6b7280;margin:0">Pemasukan</p>
                    <p style="font-size:14px;font-weight:bold;color:#10b981;margin:4px 0 0">${formatRupiah(totalIn)}</p>
                </div>
                <div style="flex:1;background:#fef2f2;border-radius:8px;padding:10px;text-align:center;">
                    <p style="font-size:10px;color:#6b7280;margin:0">Pengeluaran</p>
                    <p style="font-size:14px;font-weight:bold;color:#ef4444;margin:4px 0 0">${formatRupiah(totalOut)}</p>
                </div>
                <div style="flex:1;background:#eff6ff;border-radius:8px;padding:10px;text-align:center;">
                    <p style="font-size:10px;color:#6b7280;margin:0">Saldo</p>
                    <p style="font-size:14px;font-weight:bold;color:#3b82f6;margin:4px 0 0">${formatRupiah(totalIn - totalOut)}</p>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;">
                <thead>
                    <tr style="background:#f3f4f6;">
                        <th style="padding:8px;font-size:11px;text-align:center;border-bottom:2px solid #d1d5db">No</th>
                        <th style="padding:8px;font-size:11px;text-align:left;border-bottom:2px solid #d1d5db">Tanggal</th>
                        <th style="padding:8px;font-size:11px;text-align:left;border-bottom:2px solid #d1d5db">Jenis</th>
                        <th style="padding:8px;font-size:11px;text-align:left;border-bottom:2px solid #d1d5db">Kategori</th>
                        <th style="padding:8px;font-size:11px;text-align:left;border-bottom:2px solid #d1d5db">Judul</th>
                        <th style="padding:8px;font-size:11px;text-align:right;border-bottom:2px solid #d1d5db">Nominal</th>
                        <th style="padding:8px;font-size:11px;text-align:left;border-bottom:2px solid #d1d5db">Catatan</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    const container = document.getElementById('pdfTemplate');
    container.innerHTML = html;
    container.style.display = 'block';

    const filename = `Laporan_${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    html2pdf().set({
        margin: 0.3,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(container).save().then(() => {
        container.style.display = 'none';
        container.innerHTML = '';
    });
};

// Export Kas Umum (from main header button)
document.getElementById('btnExport').addEventListener('click', async () => {
    const { value: period } = await Swal.fire({
        title: 'Ekspor PDF - Kas Umum',
        text: 'Pilih periode data yang ingin diekspor:',
        icon: 'question',
        input: 'select',
        inputOptions: { 'all': 'Semua Data', 'week': '1 Minggu Terakhir', 'month': '1 Bulan Terakhir', 'year': '1 Tahun Terakhir' },
        inputValue: 'all',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-file-pdf"></i> Ekspor PDF',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#3b82f6',
    });
    if (!period) return;
    const filtered = filterByPeriod(kasTransactions, period);
    const periodLabels = { all: 'Semua', week: '1 Minggu Terakhir', month: '1 Bulan Terakhir', year: '1 Tahun Terakhir' };
    generatePDF('Kas Umum', filtered, periodLabels[period]);
});

// Export Kegiatan (from detail header button)
document.getElementById('btnExportKegiatan').addEventListener('click', () => {
    if (!activeKegiatanData) return;
    generatePDF(activeKegiatanData.nama, kegTransactions, 'Semua Transaksi');
});

// ===================== AUTH & ROUTING =====================
const checkAuthAndRoute = () => {
    document.getElementById('landingHeader')?.classList.add('hidden');
    document.getElementById('mainHeader')?.classList.add('hidden');
    document.getElementById('detailHeader')?.classList.add('hidden');
    document.getElementById('bottomNav')?.classList.add('hidden');

    if (!currentUser) {
        document.getElementById('landingHeader')?.classList.remove('hidden');
        showView('viewLanding');
        return;
    }

    document.getElementById('mainHeader')?.classList.remove('hidden');
    
    if (currentUser.role === 'super_admin') {
        document.getElementById('headerTitle').innerHTML = 'PMII PC Sambas<br><span class="text-xs font-normal text-blue-100">Super Admin</span>';
        document.getElementById('bottomNav')?.classList.remove('hidden');
        document.getElementById('navBtnBerita')?.classList.remove('hidden');
        document.getElementById('navBtnUsers')?.classList.remove('hidden');
        fetchKasUmum();
        fetchKegiatanList();
        fetchBerita();
        fetchUsersList();
        fetchAspirasiList();
        showView('viewKasUmum');
    } else if (currentUser.role === 'bendahara') {
        document.getElementById('headerTitle').innerHTML = 'PMII PC Sambas<br><span class="text-xs font-normal text-blue-100">Finance</span>';
        document.getElementById('bottomNav')?.classList.remove('hidden');
        document.getElementById('navBtnBerita')?.classList.add('hidden');
        document.getElementById('navBtnUsers')?.classList.add('hidden');
        fetchKasUmum();
        fetchKegiatanList();
        showView('viewKasUmum');
    } else if (currentUser.role === 'narator') {
        document.getElementById('headerTitle').innerHTML = 'PMII PC Sambas<br><span class="text-xs font-normal text-blue-100">Narator</span>';
        document.getElementById('bottomNav')?.classList.add('hidden');
        const greetingEl = document.getElementById('naratorGreeting');
        const badgeEl = document.getElementById('naratorUserBadge');
        if (greetingEl) greetingEl.textContent = `Halo, ${currentUser.username}`;
        if (badgeEl) badgeEl.textContent = `Narator Media & Informasi PMII`;
        fetchBerita();
        showView('viewDashboardBerita');
    }
};

// Secret Kamuflase Trigger:
// Klik 1x -> Refresh / scroll ke paling atas beranda publik (seperti link web normal)
// Klik 3x cepat -> Membuka form login internal
let logoClickCount = 0;
let logoClickTimer = null;
let singleClickActionTimer = null;

const handleBrandLogoClick = () => {
    logoClickCount++;

    if (logoClickCount === 1) {
        // Timer untuk klik 1x (jika tidak ada klik lanjutan)
        singleClickActionTimer = setTimeout(() => {
            logoClickCount = 0;
            window.scrollTo(0, 0);
            const container = document.getElementById('mainContainer');
            if (container) {
                container.scrollTo({ top: 0, behavior: 'smooth' });
            }
            fetchBerita();
        }, 380);
    } else if (logoClickCount >= 3) {
        // Triple click cepat! Batalkan aksi 1x dan buka halaman login
        clearTimeout(singleClickActionTimer);
        clearTimeout(logoClickTimer);
        logoClickCount = 0;
        document.getElementById('landingHeader')?.classList.add('hidden');
        showView('viewLogin');
        return;
    }

    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => {
        logoClickCount = 0;
    }, 800);
};

document.getElementById('landingSecretLogoTrigger')?.addEventListener('click', handleBrandLogoClick);

// Smooth internal scroll for Landing Navbar
window.scrollToLandingSection = (sectionId) => {
    const container = document.getElementById('mainContainer');
    const target = document.getElementById(sectionId);
    if (!container || !target) return;

    // Keep window offset locked to 0
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const targetTop = target.offsetTop - 12;
    container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth'
    });
};

document.getElementById('btnBackToLanding')?.addEventListener('click', () => {
    checkAuthAndRoute();
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.removeItem('pmii_user');
    currentUser = null;
    checkAuthAndRoute();
});

document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
    const pwd = document.getElementById('loginPassword');
    const icon = document.getElementById('iconTogglePassword');
    if (!pwd || !icon) return;
    if (pwd.type === 'password') {
        pwd.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        pwd.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value.trim();
    
    try {
        Swal.fire({
            title: 'Memproses...',
            text: 'Sedang memverifikasi login...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const res = await sql`SELECT * FROM users WHERE username = ${u} AND password = ${p}`;
        Swal.close();
        
        if (res && res.length > 0) {
            currentUser = res[0];
            localStorage.setItem('pmii_user', JSON.stringify(currentUser));
            document.getElementById('loginForm').reset();
            
            Swal.fire({
                icon: 'success',
                title: 'Login Berhasil!',
                text: `Selamat datang, ${currentUser.username} (${currentUser.role})`,
                timer: 1200,
                showConfirmButton: false
            });
            
            checkAuthAndRoute();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Gagal Masuk',
                text: 'Username atau password salah. Silakan coba lagi.'
            });
        }
    } catch (err) {
        console.error('Login error:', err);
        Swal.fire({
            icon: 'error',
            title: 'Koneksi Gagal',
            text: 'Gagal menghubungi database: ' + (err.message || 'Error tidak diketahui')
        });
    }
});

// ===================== BERITA / NARATOR LOGIC =====================
const fetchBerita = async () => {
    if (!sql) return;
    try {
        beritaList = await sql`SELECT * FROM berita ORDER BY created_at DESC`;
        renderBeritaStats();
        renderBeritaList();
        renderPublicNewsList();
    } catch (err) { console.error('Error fetching berita:', err); }
};

const renderBeritaStats = () => {
    const totalEl = document.getElementById('statTotalBerita');
    const pubEl = document.getElementById('statPublishedBerita');
    const draftEl = document.getElementById('statDraftBerita');
    
    if (!totalEl || !pubEl || !draftEl) return;
    
    const total = beritaList.length;
    const published = beritaList.filter(b => b.status === 'PUBLISHED').length;
    const draft = beritaList.filter(b => b.status === 'DRAFT').length;

    totalEl.textContent = total;
    pubEl.textContent = published;
    draftEl.textContent = draft;
};

// Filter button listeners for Narator Dashboard
document.querySelectorAll('.berita-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        beritaFilter = e.currentTarget.dataset.status;
        document.querySelectorAll('.berita-filter-btn').forEach(b => {
            b.classList.remove('bg-primary', 'text-white', 'shadow-sm', 'active-berita-filter');
            b.classList.add('bg-gray-100', 'text-gray-500');
        });
        e.currentTarget.classList.remove('bg-gray-100', 'text-gray-500');
        e.currentTarget.classList.add('bg-primary', 'text-white', 'shadow-sm', 'active-berita-filter');
        renderBeritaList();
    });
});

const renderBeritaList = () => {
    const container = document.getElementById('adminNewsList');
    if (!container) return;
    container.innerHTML = '';

    let filtered = beritaList;
    if (beritaFilter !== 'all') {
        filtered = beritaList.filter(b => b.status === beritaFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10 italic text-sm">Tidak ada berita pada kategori ini.</div>';
        return;
    }

    filtered.forEach(b => {
        const isPub = b.status === 'PUBLISHED';
        const images = parseImages(b.gambar_base64);
        const coverImg = images.length > 0 ? images[0] : null;

        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3 transition hover:shadow-md';
        
        card.innerHTML = `
            <div class="flex gap-3 items-start">
                ${coverImg ? `
                    <div class="relative w-16 h-16 rounded-xl overflow-hidden border shrink-0">
                        <img src="${coverImg}" class="w-full h-full object-cover" alt="Thumb">
                        ${images.length > 1 ? `<span class="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] font-bold px-1 rounded">+${images.length - 1}</span>` : ''}
                    </div>
                ` : `
                    <div class="w-16 h-16 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-primary">
                        <i class="fa-solid fa-newspaper text-xl"></i>
                    </div>
                `}
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-1">
                        <h4 class="font-bold text-gray-800 text-sm leading-snug line-clamp-2">${b.judul}</h4>
                    </div>
                    <p class="text-[11px] text-gray-400 mt-1 flex items-center gap-1.5">
                        <i class="fa-regular fa-clock"></i> ${formatDate(b.created_at)}
                        <span>&bull;</span>
                        <i class="fa-solid fa-user-pen"></i> ${b.author || 'Narator'}
                    </p>
                    <div class="mt-2 flex items-center gap-2">
                        <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${isPub ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}">
                            ${isPub ? '🟢 Terbit' : '⚪ Draf'}
                        </span>
                        ${images.length > 0 ? `<span class="text-[10px] text-gray-400 font-semibold"><i class="fa-solid fa-images mr-1"></i>${images.length} Foto</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="flex items-center justify-end gap-2 border-t border-gray-50 pt-2">
                <button onclick="window.viewNewsDetail('${b.id}')" class="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-primary font-bold hover:bg-blue-100 transition flex items-center gap-1">
                    <i class="fa-solid fa-eye"></i> Baca
                </button>
                <button onclick="window.editNewsItem('${b.id}')" class="text-xs px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 font-bold hover:bg-yellow-100 transition flex items-center gap-1">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                </button>
                <button onclick="window.hapusBerita('${b.id}')" class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100 transition flex items-center gap-1">
                    <i class="fa-solid fa-trash-can"></i> Hapus
                </button>
            </div>
        `;
        container.appendChild(card);
    });
};

const renderPublicNewsList = () => {
    const container = document.getElementById('publicNewsList');
    if (!container) return;
    container.innerHTML = '';

    const published = beritaList.filter(b => b.status === 'PUBLISHED');
    if (published.length === 0) {
        container.innerHTML = '<p class="text-center text-sm text-gray-400 py-4 italic">Belum ada kabar atau artikel yang dipublikasikan.</p>';
        return;
    }

    published.forEach(b => {
        const images = parseImages(b.gambar_base64);
        const coverImg = images.length > 0 ? images[0] : null;

        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-2xl shadow-sm border border-gray-100 transition hover:shadow-md cursor-pointer group flex flex-col gap-2.5';
        card.onclick = () => window.viewNewsDetail(b.id);
        
        card.innerHTML = `
            ${coverImg ? `
                <div class="w-full h-36 rounded-xl overflow-hidden mb-1 border bg-gray-50 relative">
                    <img src="${coverImg}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${b.judul}">
                    ${images.length > 1 ? `<span class="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs"><i class="fa-solid fa-images mr-1"></i>${images.length} Foto</span>` : ''}
                </div>
            ` : ''}
            <div>
                <span class="text-[10px] font-bold text-primary bg-blue-50 px-2 py-0.5 rounded-md uppercase">Kabar PMII</span>
                <h4 class="font-bold text-gray-800 text-base leading-snug mt-1 group-hover:text-primary transition">${b.judul}</h4>
                <p class="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">${b.isi}</p>
                <div class="flex justify-between items-center text-[11px] text-gray-400 mt-3 pt-2 border-t border-gray-50">
                    <span><i class="fa-regular fa-calendar mr-1"></i>${formatDate(b.created_at)}</span>
                    <span class="text-primary font-bold flex items-center gap-1">Baca Selengkapnya <i class="fa-solid fa-arrow-right text-[10px]"></i></span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
};

// ===================== NEWS MODAL HANDLERS =====================
const newsEditorModal = document.getElementById('newsEditorModal');
const newsReaderModal = document.getElementById('newsReaderModal');

const renderNewsImageThumbnails = () => {
    const container = document.getElementById('newsPreviewContainer');
    const grid = document.getElementById('newsImageThumbnailsGrid');
    const countEl = document.getElementById('txtCountNewsImages');
    if (!container || !grid) return;

    grid.innerHTML = '';
    if (currentNewsImagesBase64.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    if (countEl) countEl.textContent = `${currentNewsImagesBase64.length} Foto Dokumentasi Terpilih`;

    currentNewsImagesBase64.forEach((b64, idx) => {
        const item = document.createElement('div');
        item.className = 'relative group rounded-xl overflow-hidden border border-gray-200 bg-white aspect-square shadow-2xs';
        item.innerHTML = `
            <img src="${b64}" class="w-full h-full object-cover" alt="Foto ${idx + 1}">
            <button type="button" onclick="window.removeNewsImage(${idx})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow text-[10px] hover:bg-red-600">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        grid.appendChild(item);
    });
};

window.removeNewsImage = (idx) => {
    currentNewsImagesBase64.splice(idx, 1);
    renderNewsImageThumbnails();
};

document.getElementById('btnClearAllNewsImages')?.addEventListener('click', () => {
    currentNewsImagesBase64 = [];
    renderNewsImageThumbnails();
    const f1 = document.getElementById('inputNewsFileGallery'); if (f1) f1.value = '';
    const f2 = document.getElementById('inputNewsFileCamera'); if (f2) f2.value = '';
});

const handleNewsImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
        const compressed = await compressImageFile(file);
        if (compressed) currentNewsImagesBase64.push(compressed);
    }
    renderNewsImageThumbnails();
    e.target.value = '';
};

document.getElementById('inputNewsFileGallery')?.addEventListener('change', handleNewsImageSelect);
document.getElementById('inputNewsFileCamera')?.addEventListener('change', handleNewsImageSelect);

const openNewsEditor = (newsItem = null) => {
    document.getElementById('inputNewsId').value = newsItem?.id || '';
    document.getElementById('inputNewsTitle').value = newsItem?.judul || '';
    document.getElementById('inputNewsContent').value = newsItem?.isi || '';
    document.getElementById('inputNewsStatus').value = newsItem?.status || 'PUBLISHED';
    
    // Clear AI inputs for fresh writing
    const pts = document.getElementById('aiInputPoints'); if (pts) pts.value = '';
    const loc = document.getElementById('aiInputLocation'); if (loc) loc.value = '';
    const qts = document.getElementById('aiInputQuotes'); if (qts) qts.value = '';
    const tone = document.getElementById('aiInputTone'); if (tone) tone.value = 'formal';

    currentNewsImagesBase64 = parseImages(newsItem?.gambar_base64);
    renderNewsImageThumbnails();

    const titleEl = document.getElementById('newsEditorModalTitle');
    if (titleEl) {
        titleEl.innerHTML = newsItem 
            ? `<i class="fa-solid fa-pen-to-square text-primary mr-2"></i> Edit Berita` 
            : `<i class="fa-solid fa-pen-nib text-primary mr-2"></i> Tulis Berita Baru`;
    }

    newsEditorModal?.classList.remove('hidden');
    newsEditorModal?.classList.add('flex');
};

const closeNewsEditor = () => {
    newsEditorModal?.classList.add('hidden');
    newsEditorModal?.classList.remove('flex');
    currentNewsImagesBase64 = [];
    renderNewsImageThumbnails();
    document.getElementById('newsForm')?.reset();
};

document.getElementById('btnOpenNewArticleModal')?.addEventListener('click', () => openNewsEditor(null));
document.getElementById('btnBannerCreateNews')?.addEventListener('click', () => openNewsEditor(null));
document.getElementById('btnCloseNewsEditor')?.addEventListener('click', closeNewsEditor);
document.getElementById('btnCancelNews')?.addEventListener('click', closeNewsEditor);

// ===================== AI NARRATION GENERATOR =====================
const generateAiNarrative = async () => {
    const title = document.getElementById('inputNewsTitle').value.trim();
    const points = document.getElementById('aiInputPoints').value.trim();
    const location = document.getElementById('aiInputLocation').value.trim() || 'Kabupaten Sambas';
    const quotes = document.getElementById('aiInputQuotes').value.trim();
    const tone = document.getElementById('aiInputTone').value;

    if (!points && !title) {
        Swal.fire('Perhatian', 'Harap isi Judul atau Inti Kegiatan terlebih dahulu agar AI dapat merangkai narasi.', 'warning');
        return;
    }

    const btn = document.getElementById('btnGenerateAiNarrative');
    const txt = document.getElementById('txtBtnGenerate');
    const spinner = document.getElementById('spinnerAiGen');

    btn.disabled = true;
    txt.textContent = 'Menulis Narasi...';
    spinner.classList.remove('hidden');

    try {
        await new Promise(r => setTimeout(r, 600));

        let leadParagraph = '';
        let bodyParagraphs = '';
        let closingParagraph = '';

        const actualTitle = title || points;
        const mainSubject = points || title;
        const narasumber = quotes || 'Ketua PC PMII Sambas Sahabat Ergus';

        if (tone === 'formal') {
            leadParagraph = `SAMBAS — Pengurus Cabang Pergerakan Mahasiswa Islam Indonesia (PC PMII) Kabupaten Sambas kembali menegaskan komitmennya dalam mengawal pergerakan intelektual dan pengabdian. Bertempat di ${location}, kegiatan bertajuk "${actualTitle}" telah terlaksana dengan lancar, tertib, dan khidmat.`;

            bodyParagraphs = `Agenda ini mengangkat fokus penting mengenai ${mainSubject}. Hadir jajaran pengurus, kader, serta elemen organisasi yang secara aktif berdialog dan mendiskusikan langkah-langkah strategis ke depan demi menjawab tantangan kemahasiswaan dan dinamika kedaerahan di Kabupaten Sambas.\n\nDalam arahan dan sambutannya, ${narasumber} menyampaikan pesan penguatan nilai-nilai dasar pergerakan. "Kader PMII harus senantiasa memegang teguh komitmen keislaman dan keindonesiaan. Setiap langkah dan program kerja yang kita canangkan harus berorientasi pada kemaslahatan umat serta kemajuan Kabupaten Sambas," tuturnya.`;

            closingParagraph = `Kegiatan tersebut ditutup dengan sesi konsolidasi dan doa bersama, memperkokoh soliditas kepengurusan PC PMII Sambas untuk terus berkhidmat di bawah panji Dzikir, Fikir, dan Amal Sholeh.\n\n(Narator / Rilis Media: PC PMII Cabang Sambas)`;
        } else if (tone === 'inspiring') {
            leadParagraph = `SAMBAS — Gelora semangat pergerakan kembali berkobar di Kabupaten Sambas. Bertempat di ${location}, PC PMII Kabupaten Sambas sukses menggelar agenda inspiratif: "${actualTitle}".`;

            bodyParagraphs = `Kegiatan ini menyoroti ${mainSubject}. Antusiasme tinggi terpancar dari raut wajah sahabat-sahabati kader yang hadir, mencerminkan daya juang dan keteguhan idealisme mahasiswa Islam Indonesia.\n\n${narasumber} dalam orasinya memantik api perjuangan seluruh hadirin. "Kader PMII adalah pewaris masa depan peradaban. Jangan pernah lelah berproses dan belajar, karena sejarah bangsa selalu diukir oleh pemuda yang berani melangkah dan mengabdi dengan tulus," serunya membakar semangat forum.`;

            closingParagraph = `Melalui momentum ini, PC PMII Sambas bertekad terus melahirkan kader-kader pelopor yang militan, progresif, dan berintegritas tinggi. Tangan Terkepal dan Maju ke Muka!\n\n(Pewarta: Biro Media & Informasi PC PMII Sambas)`;
        } else {
            // Critical / Opinion
            leadParagraph = `SAMBAS — Merespons dinamika sosial dan pembangunan di Kabupaten Sambas, PC PMII Kabupaten Sambas merilis kajian dan pandangan kritis bertajuk "${actualTitle}", bertempat di ${location}.`;

            bodyParagraphs = `Sorotan utama dalam agenda ini adalah ${mainSubject}. PMII Sambas menilai bahwa keberpihakan kepada masyarakat dan pengawalan kebijakan publik yang transparan merupakan keniscayaan demi mewujudkan keadilan sosial.\n\n${narasumber} menegaskan pentingnya nalar kritis di kalangan aktivis mahasiswa. "Kita tidak boleh berdiam diri melihat ketimpangan. Mahasiswa harus hadir membawa gagasan solutif dan menjadi penyambung lidah aspirasi rakyat secara konstruktif," ungkapnya.`;

            closingParagraph = `PC PMII Sambas mengajak seluruh elemen kepemudaan untuk terus bersinergi dan merawat dialektika kritis demi masa depan Sambas yang lebih bermartabat.\n\nWallahul Muwaffiq ila Aqwamith Tharieq.\n(Rilis Pers: PC PMII Sambas)`;
        }

        const fullArticle = `${leadParagraph}\n\n${bodyParagraphs}\n\n${closingParagraph}`;

        const contentTextarea = document.getElementById('inputNewsContent');
        contentTextarea.value = fullArticle;

        if (!title && points) {
            document.getElementById('inputNewsTitle').value = points;
        }

        Swal.fire({
            icon: 'success',
            title: '✨ Narasi AI Selesai Dibuat!',
            text: 'Paragraf jurnalistik telah otomatis tersusun. Anda dapat langsung mengedit atau menerbitkannya.',
            timer: 2000,
            showConfirmButton: false
        });

        contentTextarea.focus();
        contentTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
        console.error('AI Gen Error:', err);
        Swal.fire('Error', 'Gagal memproses narasi AI: ' + (err.message || ''), 'error');
    } finally {
        btn.disabled = false;
        txt.textContent = 'Generate Narasi';
        spinner.classList.add('hidden');
    }
};

document.getElementById('btnGenerateAiNarrative')?.addEventListener('click', generateAiNarrative);

// Save News Form Submit
document.getElementById('newsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputNewsId').value;
    const judul = document.getElementById('inputNewsTitle').value.trim();
    const isi = document.getElementById('inputNewsContent').value.trim();
    const status = document.getElementById('inputNewsStatus').value;
    const author = currentUser?.username || 'Narator PMII';
    const serializedImages = currentNewsImagesBase64.length > 0 ? JSON.stringify(currentNewsImagesBase64) : null;

    if (!judul || !isi) {
        Swal.fire('Perhatian', 'Judul dan isi berita wajib diisi', 'warning');
        return;
    }

    const btn = document.getElementById('btnSaveNews');
    const btnText = document.getElementById('btnSaveNewsText');
    const spinner = document.getElementById('spinnerSaveNews');

    try {
        btn.disabled = true;
        btnText.textContent = 'Menyimpan...';
        spinner.classList.remove('hidden');

        if (id) {
            // Update existing
            await sql`
                UPDATE berita 
                SET judul = ${judul}, isi = ${isi}, status = ${status}, gambar_base64 = ${serializedImages}
                WHERE id = ${id}
            `;
            Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Berita berhasil diperbarui!', timer: 1500, showConfirmButton: false });
        } else {
            // Insert new
            await sql`
                INSERT INTO berita (judul, isi, status, author, gambar_base64, published_at) 
                VALUES (${judul}, ${isi}, ${status}, ${author}, ${serializedImages}, ${status === 'PUBLISHED' ? new Date() : null})
            `;
            Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Berita berhasil dibuat!', timer: 1500, showConfirmButton: false });
        }

        closeNewsEditor();
        await fetchBerita();
    } catch (err) {
        console.error('Error saving news:', err);
        Swal.fire('Error', 'Gagal menyimpan berita: ' + (err.message || ''), 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Simpan Berita';
        spinner.classList.add('hidden');
    }
});

// News Reader Modal Handlers
window.viewNewsDetail = (newsId) => {
    const news = beritaList.find(b => b.id === newsId);
    if (!news) return;
    currentReadingNews = news;

    document.getElementById('readerNewsTitle').textContent = news.judul;
    document.getElementById('readerNewsAuthor').textContent = `Oleh ${news.author || 'Narator PMII'}`;
    document.getElementById('readerNewsDate').textContent = formatDate(news.created_at);
    document.getElementById('readerNewsContent').textContent = news.isi;

    const statusEl = document.getElementById('readerNewsStatus');
    if (statusEl) {
        if (news.status === 'PUBLISHED') {
            statusEl.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-green-100 text-green-700 border border-green-200';
            statusEl.textContent = '🟢 Terbit';
        } else {
            statusEl.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-gray-100 text-gray-600 border border-gray-200';
            statusEl.textContent = '⚪ Draf';
        }
    }

    const images = parseImages(news.gambar_base64);
    const containerEl = document.getElementById('readerImagesContainer');
    const gridEl = document.getElementById('readerImagesGrid');

    if (images.length > 0) {
        containerEl?.classList.remove('hidden');
        if (gridEl) {
            gridEl.innerHTML = '';
            gridEl.className = 'space-y-3';
            images.forEach((imgB64, i) => {
                const imgCard = document.createElement('div');
                imgCard.className = 'rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white cursor-pointer relative group flex items-center justify-center p-1 transition hover:shadow-md';
                imgCard.innerHTML = `
                    <img src="${imgB64}" class="w-full h-auto max-h-[70vh] object-contain rounded-xl" alt="Foto Dokumentasi ${i + 1}">
                    <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition rounded-xl">
                        <span class="bg-black/70 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-xs">
                            <i class="fa-solid fa-magnifying-glass-plus"></i> Ukuran Penuh
                        </span>
                    </div>
                `;
                imgCard.onclick = () => {
                    document.getElementById('zoomedImage').src = imgB64;
                    document.getElementById('btnDownloadImage').href = imgB64;
                    document.getElementById('imageZoomModal').classList.remove('hidden');
                    document.getElementById('imageZoomModal').classList.add('flex');
                };
                gridEl.appendChild(imgCard);
            });
        }
    } else {
        containerEl?.classList.add('hidden');
        if (gridEl) gridEl.innerHTML = '';
    }

    newsReaderModal?.classList.remove('hidden');
    newsReaderModal?.classList.add('flex');
};

const shareNewsToWA = () => {
    if (!currentReadingNews) return;
    const title = currentReadingNews.judul;
    const snippet = currentReadingNews.isi.substring(0, 180).trim() + '...';
    const text = `*📰 ${title}*\n\n${snippet}\n\n_Diterbitkan oleh Media & Informasi PC PMII Sambas_\nKunjungi Portal Resmi: https://ergus457.github.io/keuangan/`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

const copyNewsRelease = async () => {
    if (!currentReadingNews) return;
    const text = `📰 *${currentReadingNews.judul}*\n\nOleh: ${currentReadingNews.author || 'PC PMII Sambas'} | ${formatDate(currentReadingNews.published_at || currentReadingNews.created_at)}\n\n${currentReadingNews.isi}\n\n---\n*PENGURUS CABANG PERGERAKAN MAHASISWA ISLAM INDONESIA (PMII) KABUPATEN SAMBAS*\nPortal: https://ergus457.github.io/keuangan/`;
    try {
        await navigator.clipboard.writeText(text);
        Swal.fire({
            icon: 'success',
            title: 'Tersalin!',
            text: 'Teks rilis berita resmi telah disalin ke clipboard.',
            timer: 1500,
            showConfirmButton: false
        });
    } catch (e) {
        Swal.fire('Info', 'Gagal menyalin otomatis, silakan salin manual.', 'info');
    }
};

document.getElementById('btnShareNewsWA')?.addEventListener('click', shareNewsToWA);
document.getElementById('btnCopyNewsLink')?.addEventListener('click', copyNewsRelease);

document.getElementById('btnCloseNewsReader')?.addEventListener('click', () => {
    newsReaderModal?.classList.add('hidden');
    newsReaderModal?.classList.remove('flex');
});

// Struktur Modal Event Listeners
const strukturModal = document.getElementById('strukturModal');
document.getElementById('btnOpenStrukturModal')?.addEventListener('click', () => {
    strukturModal?.classList.remove('hidden');
    strukturModal?.classList.add('flex');
});
document.getElementById('btnCloseStrukturModal')?.addEventListener('click', () => {
    strukturModal?.classList.add('hidden');
    strukturModal?.classList.remove('flex');
});
document.getElementById('btnDismissStrukturModal')?.addEventListener('click', () => {
    strukturModal?.classList.add('hidden');
    strukturModal?.classList.remove('flex');
});

window.editNewsItem = (newsId) => {
    const news = beritaList.find(b => b.id === newsId);
    if (news) openNewsEditor(news);
};

window.hapusBerita = async (id) => {
    const result = await Swal.fire({
        title: 'Hapus Berita?',
        text: 'Berita yang dihapus tidak dapat dikembalikan!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        await sql`DELETE FROM berita WHERE id = ${id}`;
        Swal.fire({ icon: 'success', title: 'Terhapus!', text: 'Berita telah dihapus.', timer: 1500, showConfirmButton: false });
        await fetchBerita();
    } catch (err) {
        console.error('Error deleting news:', err);
        Swal.fire('Error', 'Gagal menghapus berita: ' + (err.message || ''), 'error');
    }
};

// ===================== USER MANAGEMENT (SUPER ADMIN) =====================
const fetchUsersList = async () => {
    if (!sql || currentUser?.role !== 'super_admin') return;
    try {
        const rows = await sql`SELECT id, username, role, created_at FROM users ORDER BY created_at ASC`;
        usersList = rows;
        renderUsersList();
    } catch (e) {
        console.error('Error fetching users:', e);
    }
};

const renderUsersList = () => {
    const container = document.getElementById('usersListContainer');
    if (!container) return;
    container.innerHTML = '';

    const countSA = usersList.filter(u => u.role === 'super_admin').length;
    const countBen = usersList.filter(u => u.role === 'bendahara').length;
    const countNar = usersList.filter(u => u.role === 'narator').length;

    const elSA = document.getElementById('statCountSuperAdmin');
    const elBen = document.getElementById('statCountBendahara');
    const elNar = document.getElementById('statCountNarator');
    const elTotal = document.getElementById('txtTotalUsersCount');

    if (elSA) elSA.textContent = countSA;
    if (elBen) elBen.textContent = countBen;
    if (elNar) elNar.textContent = countNar;
    if (elTotal) elTotal.textContent = `${usersList.length} Akun Terdaftar`;

    if (usersList.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10 italic text-sm">Belum ada akun pengguna.</div>';
        return;
    }

    usersList.forEach(u => {
        const isCurrent = currentUser?.username === u.username;
        let roleBadge = '';
        let roleIcon = '';
        if (u.role === 'super_admin') {
            roleBadge = '<span class="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">Super Admin</span>';
            roleIcon = '<i class="fa-solid fa-crown text-amber-500"></i>';
        } else if (u.role === 'bendahara') {
            roleBadge = '<span class="bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Bendahara</span>';
            roleIcon = '<i class="fa-solid fa-wallet text-blue-500"></i>';
        } else {
            roleBadge = '<span class="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Narator</span>';
            roleIcon = '<i class="fa-solid fa-feather text-purple-500"></i>';
        }

        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3 transition hover:shadow-md';
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-base">
                        ${roleIcon}
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-extrabold text-gray-800 text-sm">${u.username}</h4>
                            ${isCurrent ? '<span class="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">Akun Anda</span>' : ''}
                        </div>
                        <p class="text-[11px] text-gray-400 mt-0.5"><i class="fa-regular fa-clock mr-1"></i>Dibuat: ${formatDate(u.created_at)}</p>
                    </div>
                </div>
                <div>
                    ${roleBadge}
                </div>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-gray-50 pt-2.5">
                <button onclick="window.editUserItem('${u.id}')" class="text-xs px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 font-bold hover:bg-yellow-100 transition flex items-center gap-1.5">
                    <i class="fa-solid fa-user-pen"></i> Edit Akun
                </button>
                ${!isCurrent ? `
                    <button onclick="window.deleteUserItem('${u.id}', '${u.username}')" class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100 transition flex items-center gap-1.5">
                        <i class="fa-solid fa-trash-can"></i> Hapus
                    </button>
                ` : ''}
            </div>
        `;
        container.appendChild(card);
    });
};

const userFormModal = document.getElementById('userFormModal');

const openAddUserModal = () => {
    document.getElementById('inputUserId').value = '';
    document.getElementById('inputUserUsername').value = '';
    document.getElementById('inputUserPassword').value = '';
    document.getElementById('inputUserRole').value = 'bendahara';
    
    document.getElementById('userFormModalTitle').textContent = 'Tambah Akun Pengguna';
    const pwdLabel = document.getElementById('labelUserPassword');
    if (pwdLabel) pwdLabel.textContent = 'Password';
    document.getElementById('inputUserPassword').placeholder = 'Masukkan password baru';
    document.getElementById('btnSaveUserText').textContent = 'Simpan Akun';

    userFormModal?.classList.remove('hidden');
    userFormModal?.classList.add('flex');
};

window.editUserItem = (userId) => {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('inputUserId').value = user.id;
    document.getElementById('inputUserUsername').value = user.username;
    document.getElementById('inputUserPassword').value = '';
    document.getElementById('inputUserRole').value = user.role;
    
    document.getElementById('userFormModalTitle').textContent = `Edit Akun: ${user.username}`;
    const pwdLabel = document.getElementById('labelUserPassword');
    if (pwdLabel) pwdLabel.textContent = 'Password (Kosongkan jika tidak diubah)';
    document.getElementById('inputUserPassword').placeholder = 'Biarkan kosong jika tidak diubah';
    document.getElementById('btnSaveUserText').textContent = 'Perbarui Akun';

    userFormModal?.classList.remove('hidden');
    userFormModal?.classList.add('flex');
};

const closeUserModal = () => {
    userFormModal?.classList.add('hidden');
    userFormModal?.classList.remove('flex');
    document.getElementById('userForm')?.reset();
};

document.getElementById('btnOpenAddUserModal')?.addEventListener('click', openAddUserModal);
document.getElementById('btnCloseUserModal')?.addEventListener('click', closeUserModal);
document.getElementById('btnCancelUser')?.addEventListener('click', closeUserModal);

document.getElementById('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputUserId').value;
    const username = document.getElementById('inputUserUsername').value.trim().toLowerCase();
    const password = document.getElementById('inputUserPassword').value.trim();
    const role = document.getElementById('inputUserRole').value;

    if (!username) {
        Swal.fire('Perhatian', 'Username wajib diisi', 'warning');
        return;
    }

    if (!id && !password) {
        Swal.fire('Perhatian', 'Password wajib diisi untuk akun baru', 'warning');
        return;
    }

    const btn = document.getElementById('btnSaveUser');
    const btnTxt = document.getElementById('btnSaveUserText');
    const spinner = document.getElementById('spinnerSaveUser');

    try {
        btn.disabled = true;
        btnTxt.textContent = 'Menyimpan...';
        spinner.classList.remove('hidden');

        if (id) {
            // Check if new username is already taken by another account
            const duplicate = await sql`SELECT id FROM users WHERE username = ${username} AND id != ${id}`;
            if (duplicate.length > 0) {
                Swal.fire('Error', `Username "${username}" sudah digunakan oleh akun lain!`, 'error');
                return;
            }

            if (password) {
                await sql`
                    UPDATE users
                    SET username = ${username}, password = ${password}, role = ${role}
                    WHERE id = ${id}
                `;
            } else {
                await sql`
                    UPDATE users
                    SET username = ${username}, role = ${role}
                    WHERE id = ${id}
                `;
            }

            // If user edited their own active account, update local storage session
            if (currentUser?.id === id) {
                currentUser.username = username;
                currentUser.role = role;
                localStorage.setItem('pmii_user', JSON.stringify(currentUser));
            }

            Swal.fire({ icon: 'success', title: 'Berhasil', text: `Akun ${username} berhasil diperbarui!`, timer: 1500, showConfirmButton: false });
        } else {
            // Check existing
            const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
            if (existing.length > 0) {
                Swal.fire('Error', `Username "${username}" sudah digunakan!`, 'error');
                return;
            }
            // Insert
            await sql`
                INSERT INTO users (username, password, role)
                VALUES (${username}, ${password}, ${role})
            `;
            Swal.fire({ icon: 'success', title: 'Berhasil', text: `Akun ${username} berhasil ditambahkan!`, timer: 1500, showConfirmButton: false });
        }

        closeUserModal();
        await fetchUsersList();
    } catch (err) {
        console.error('Error saving user:', err);
        Swal.fire('Error', 'Gagal menyimpan akun: ' + (err.message || ''), 'error');
    } finally {
        btn.disabled = false;
        btnTxt.textContent = id ? 'Perbarui Akun' : 'Simpan Akun';
        spinner.classList.add('hidden');
    }
});

window.deleteUserItem = async (userId, username) => {
    const result = await Swal.fire({
        title: `Hapus Akun ${username}?`,
        text: 'Akun ini tidak akan dapat digunakan lagi untuk login!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        await sql`DELETE FROM users WHERE id = ${userId}`;
        Swal.fire({ icon: 'success', title: 'Dihapus', text: `Akun ${username} berhasil dihapus!`, timer: 1500, showConfirmButton: false });
        await fetchUsersList();
    } catch (err) {
        console.error('Error deleting user:', err);
        Swal.fire('Error', 'Gagal menghapus user: ' + (err.message || ''), 'error');
    }
};

// ===================== KOTAK ASPIRASI LOGIC =====================
document.getElementById('formAspirasi')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('aspirasiNama').value.trim();
    const asal = document.getElementById('aspirasiAsal').value.trim();
    const pesan = document.getElementById('aspirasiPesan').value.trim();

    if (!nama || !pesan) {
        Swal.fire('Perhatian', 'Nama dan pesan aspirasi wajib diisi.', 'warning');
        return;
    }

    const btn = document.getElementById('btnKirimAspirasi');
    const txt = document.getElementById('txtBtnAspirasi');
    try {
        btn.disabled = true;
        txt.textContent = 'Mengirimkan...';

        if (sql) {
            await sql`
                INSERT INTO aspirasi (nama, asal, pesan)
                VALUES (${nama}, ${asal}, ${pesan})
            `;
        }

        document.getElementById('formAspirasi').reset();

        Swal.fire({
            icon: 'success',
            title: 'Aspirasi Terkirim!',
            text: 'Terima kasih! Pesan dan aspirasi sahabat telah diterima oleh Pengurus Cabang PMII Sambas.',
            confirmButtonColor: '#3b82f6'
        });
    } catch (err) {
        console.error('Error submitting aspirasi:', err);
        Swal.fire('Error', 'Gagal mengirim aspirasi: ' + (err.message || ''), 'error');
    } finally {
        btn.disabled = false;
        txt.textContent = 'Kirim Aspirasi';
    }
});

const fetchAspirasiList = async () => {
    if (!sql) return;
    try {
        aspirasiList = await sql`SELECT * FROM aspirasi ORDER BY created_at DESC` || [];
        renderAspirasiList();
    } catch (err) {
        console.error('Error fetching aspirasi:', err);
    }
};

const renderAspirasiList = () => {
    const container = document.getElementById('aspirasiListContainer');
    const countEl = document.getElementById('txtTotalAspirasiCount');
    if (!container) return;

    if (countEl) countEl.textContent = `${aspirasiList.length} Pesan Masuk`;
    container.innerHTML = '';

    if (aspirasiList.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-6 italic text-sm">Belum ada aspirasi yang masuk.</div>';
        return;
    }

    aspirasiList.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2 transition hover:shadow-md';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="font-extrabold text-gray-800 text-sm">${item.nama}</h4>
                        ${item.asal ? `<span class="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-100">${item.asal}</span>` : ''}
                    </div>
                    <p class="text-[10px] text-gray-400 mt-0.5"><i class="fa-regular fa-clock mr-1"></i>${formatDate(item.created_at)}</p>
                </div>
                <button onclick="window.deleteAspirasiItem('${item.id}')" class="text-gray-400 hover:text-red-500 p-1 transition" title="Hapus Aspirasi">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
            <p class="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-xl whitespace-pre-line leading-relaxed border border-gray-100">${item.pesan}</p>
        `;
        container.appendChild(card);
    });
};

window.deleteAspirasiItem = async (aspirasiId) => {
    const res = await Swal.fire({
        title: 'Hapus Aspirasi?',
        text: 'Pesan aspirasi ini akan dihapus permanen!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (!res.isConfirmed) return;

    try {
        await sql`DELETE FROM aspirasi WHERE id = ${aspirasiId}`;
        Swal.fire({ icon: 'success', title: 'Terhapus', text: 'Pesan aspirasi telah dihapus!', timer: 1200, showConfirmButton: false });
        await fetchAspirasiList();
    } catch (e) {
        Swal.fire('Error', 'Gagal menghapus aspirasi: ' + e.message, 'error');
    }
};

// ===================== INIT =====================
const initDB = async () => {
    if (!sql) return;
    try {
        await sql`CREATE TABLE IF NOT EXISTS users (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    } catch(e) {}
    try {
        await sql`INSERT INTO users (username, password, role) VALUES ('superadmin', 'admin123', 'super_admin'), ('bendahara', 'bendahara123', 'bendahara'), ('narator', 'narator123', 'narator') ON CONFLICT (username) DO NOTHING`;
    } catch(e) {}
    try {
        await sql`CREATE TABLE IF NOT EXISTS berita (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, judul VARCHAR(255) NOT NULL, isi TEXT NOT NULL, gambar_base64 TEXT, status VARCHAR(20) DEFAULT 'DRAFT', author VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, published_at TIMESTAMP)`;
    } catch(e) {}
    try {
        await sql`CREATE TABLE IF NOT EXISTS aspirasi (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nama VARCHAR(100) NOT NULL, asal VARCHAR(100), pesan TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    } catch(e) {}
};

const init = async () => {
    initDarkMode();
    await initDB();
    await Promise.all([fetchKasUmum(), fetchKegiatanList(), fetchBerita()]);
    checkAuthAndRoute();
};

init();

// ===================== PWA & INSTALL =====================
let deferredPrompt;
const btnInstall = document.getElementById('btnInstall');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            btnInstall.classList.add('hidden');
        }
        deferredPrompt = null;
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.error('ServiceWorker registration failed: ', err);
        });
    });
}
