import { sql } from './neon-config.js';

// ===================== STATE =====================
let currentUser = JSON.parse(localStorage.getItem('pmii_user') || 'null');
let kasTransactions = [];    // transaksi kas umum
let kegiatanList = [];       // daftar kegiatan
let kegTransactions = [];    // transaksi kegiatan aktif
let beritaList = [];         // daftar berita
let activeKegiatanId = null; // kegiatan yang sedang dibuka
let activeKegiatanData = null;
let currentImageBase64 = null;
let currentActiveTxId = null;
let kasPeriod = 'all';

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

const activateFilterBtn = (container, activeBtn) => {
    container.querySelectorAll('button').forEach(b => {
        b.classList.remove('bg-primary', 'text-white', 'shadow-sm', 'active-filter');
        b.classList.add('bg-gray-100', 'text-gray-500');
    });
    activeBtn.classList.remove('bg-gray-100', 'text-gray-500');
    activeBtn.classList.add('bg-primary', 'text-white', 'shadow-sm', 'active-filter');
};

// ===================== NAVIGATION =====================
const views = document.querySelectorAll('.view-section');
const navBtns = document.querySelectorAll('.nav-btn');
const mainHeader = document.getElementById('mainHeader');
const detailHeader = document.getElementById('detailHeader');
const bottomNav = document.getElementById('bottomNav');

const showView = (viewId) => {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
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
    inputKegiatanId.value = '';
    document.getElementById('formTitle').textContent = 'Catat Kas Umum';
    showMainLayout();
    showView('viewForm');
};

// Open form for Kegiatan
const openFormForKegiatan = (kegId, kegNama) => {
    inputKegiatanId.value = kegId;
    document.getElementById('formTitle').textContent = `Catat: ${kegNama}`;
    showDetailLayout();
    showView('viewForm');
};

document.getElementById('btnBackFromForm')?.addEventListener('click', () => {
    if (inputKegiatanId.value) {
        // Go back to detail kegiatan
        openDetailKegiatan(inputKegiatanId.value);
    } else {
        showMainLayout();
        showView('viewKasUmum');
    }
});

// ===================== IMAGE HANDLING =====================
const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 500;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
            else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            currentImageBase64 = canvas.toDataURL('image/jpeg', 0.5);
            imgPreview.src = currentImageBase64;
            previewContainer.classList.remove('hidden');
        };
    };
};

document.getElementById('inputFileGallery')?.addEventListener('change', handleImageSelect);
document.getElementById('inputFileCamera')?.addEventListener('change', handleImageSelect);
btnRemoveImage?.addEventListener('click', () => {
    currentImageBase64 = null; imgPreview.src = '';
    previewContainer.classList.add('hidden');
    const f1 = document.getElementById('inputFileGallery'); if (f1) f1.value = '';
    const f2 = document.getElementById('inputFileCamera'); if (f2) f2.value = '';
});

// ===================== SUBMIT TRANSACTION =====================
txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nominalRaw = parseInt(inputNominal.value.replace(/[^0-9]/g, ''));
    if (isNaN(nominalRaw) || nominalRaw <= 0) { Swal.fire('Error', 'Nominal tidak valid', 'error'); return; }

    const kegId = inputKegiatanId.value || null;

    try {
        btnSubmitTx.disabled = true; btnSubmitText.textContent = 'Menyimpan...'; spinnerSubmit.classList.remove('hidden');

        if (!sql) {
            setTimeout(() => { Swal.fire('Info', 'Simulasi berhasil!', 'info'); resetForm(); }, 1000);
            return;
        }

        await sql`
            INSERT INTO transaksi (type, nominal, judul, kategori, tanggal, catatan, image_base64, kegiatan_id) 
            VALUES (${inputType.value}, ${nominalRaw}, ${inputJudul.value}, ${inputKategori.value}, ${inputTanggal.value}, ${inputCatatan.value}, ${currentImageBase64}, ${kegId})
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
    currentImageBase64 = null; imgPreview.src = ''; previewContainer.classList.add('hidden');
    document.getElementById('inputFileGallery').value = ''; document.getElementById('inputFileCamera').value = '';
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

// ===================== RENDER KAS UMUM =====================
const renderKasUmum = () => {
    const filtered = filterByPeriod(kasTransactions, kasPeriod);
    let totalIn = 0, totalOut = 0;
    filtered.forEach(tx => { if (tx.type === 'in') totalIn += Number(tx.nominal); else totalOut += Number(tx.nominal); });

    document.getElementById('txtKasSaldo').textContent = formatRupiah(totalIn - totalOut);
    document.getElementById('txtKasMasuk').textContent = formatRupiah(totalIn);
    document.getElementById('txtKasKeluar').textContent = formatRupiah(totalOut);

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

document.getElementById('btnAddTxKegiatan').addEventListener('click', () => {
    if (!activeKegiatanId || !activeKegiatanData) return;
    openFormForKegiatan(activeKegiatanId, activeKegiatanData.nama);
});

document.getElementById('btnBackFromDetail').addEventListener('click', () => {
    activeKegiatanId = null; activeKegiatanData = null;
    showMainLayout();
    showView('viewKegiatan');
});

// ===================== BUAT KEGIATAN =====================
document.getElementById('btnBuatKegiatan').addEventListener('click', async () => {
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
document.getElementById('btnDeleteKegiatan').addEventListener('click', async () => {
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
    const isMasuk = tx.type === 'in';
    document.getElementById('modalBadge').textContent = isMasuk ? 'Pemasukan' : 'Pengeluaran';
    document.getElementById('modalBadge').className = `text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide ${isMasuk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    document.getElementById('modalJudul').textContent = tx.judul;
    document.getElementById('modalKategori').innerHTML = `<i class="fa-solid fa-tag"></i> ${tx.kategori}${tx.nama_kegiatan ? ` &bull; <span class="text-indigo-500">${tx.nama_kegiatan}</span>` : ''}`;
    document.getElementById('modalTanggal').textContent = formatDate(tx.tanggal);
    document.getElementById('modalNominal').textContent = formatRupiah(tx.nominal);
    document.getElementById('modalNominal').className = `text-xl font-extrabold ${isMasuk ? 'text-green-600' : 'text-red-600'}`;
    document.getElementById('modalCatatan').textContent = tx.catatan || '-';

    const imgEl = document.getElementById('modalImage');
    const noImgEl = document.getElementById('modalNoImage');

    if (tx.image_base64) {
        imgEl.src = tx.image_base64; imgEl.classList.remove('hidden'); noImgEl.classList.add('hidden');
        modalImageContainer.onclick = () => {
            document.getElementById('zoomedImage').src = tx.image_base64;
            document.getElementById('btnDownloadImage').href = tx.image_base64;
            document.getElementById('imageZoomModal').classList.remove('hidden');
            document.getElementById('imageZoomModal').classList.add('flex');
        };
    } else {
        imgEl.src = ''; imgEl.classList.add('hidden'); noImgEl.classList.remove('hidden');
        modalImageContainer.onclick = null;
    }

    txModal.classList.add('active');
    setTimeout(() => { txModalContent.classList.remove('scale-95', 'opacity-0'); txModalContent.classList.add('scale-100', 'opacity-100'); }, 10);
};

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
    document.getElementById('landingHeader').classList.add('hidden');
    document.getElementById('mainHeader').classList.add('hidden');
    document.getElementById('detailHeader').classList.add('hidden');
    document.getElementById('bottomNav').classList.add('hidden');

    if (!currentUser) {
        document.getElementById('landingHeader').classList.remove('hidden');
        showView('viewLanding');
        return;
    }

    document.getElementById('mainHeader').classList.remove('hidden');
    
    if (currentUser.role === 'bendahara' || currentUser.role === 'super_admin') {
        document.getElementById('bottomNav').classList.remove('hidden');
        showView('viewKasUmum');
    } else if (currentUser.role === 'narator') {
        showView('viewDashboardBerita');
    }
};

document.getElementById('btnGoToLogin')?.addEventListener('click', () => {
    document.getElementById('landingHeader')?.classList.add('hidden');
    showView('viewLogin');
});

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
                text: `Selamat datang, ${currentUser.username}`,
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

// ===================== BERITA LOGIC =====================
const fetchBerita = async () => {
    if (!sql) return;
    try {
        beritaList = await sql`SELECT * FROM berita ORDER BY created_at DESC`;
        renderBeritaList();
    } catch (err) { console.error(err); }
};

const renderBeritaList = () => {
    const publicContainer = document.getElementById('publicNewsList');
    const adminContainer = document.getElementById('adminNewsList');
    
    if (publicContainer) publicContainer.innerHTML = '';
    if (adminContainer) adminContainer.innerHTML = '';

    if (beritaList.length === 0) {
        if (publicContainer) publicContainer.innerHTML = '<p class="text-center text-sm text-gray-500 py-4">Belum ada berita dipublikasikan.</p>';
        if (adminContainer) adminContainer.innerHTML = '<p class="text-center text-sm text-gray-500 py-4">Belum ada berita.</p>';
        return;
    }

    beritaList.forEach(b => {
        // Public list (hanya PUBLISHED)
        if (b.status === 'PUBLISHED' && publicContainer) {
            publicContainer.innerHTML += `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <h4 class="font-bold text-gray-800 text-lg">${b.judul}</h4>
                    <p class="text-[10px] text-gray-500 mb-2">${formatDate(b.created_at)} &bull; Oleh ${b.author || 'Admin'}</p>
                    <p class="text-sm text-gray-600 line-clamp-3">${b.isi}</p>
                </div>
            `;
        }
        
        // Admin list
        if (adminContainer) {
            adminContainer.innerHTML += `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-gray-800">${b.judul}</h4>
                        <span class="text-[10px] font-bold px-2 py-1 rounded mt-1 inline-block ${b.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${b.status}</span>
                    </div>
                    <button onclick="hapusBerita('${b.id}')" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        }
    });
};

document.getElementById('btnBuatBerita').addEventListener('click', async () => {
    const { value: formValues } = await Swal.fire({
        title: 'Tulis Berita',
        html: `
            <input id="swalJudulB" class="swal2-input" placeholder="Judul Berita" style="font-size:14px">
            <textarea id="swalIsiB" class="swal2-textarea" placeholder="Isi Berita" style="font-size:14px; height:120px"></textarea>
            <select id="swalStatusB" class="swal2-select" style="font-size:14px">
                <option value="DRAFT">DRAFT</option>
                <option value="PUBLISHED">PUBLISH SEKARANG</option>
            </select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        preConfirm: () => {
            const j = document.getElementById('swalJudulB').value;
            const i = document.getElementById('swalIsiB').value;
            if (!j || !i) { Swal.showValidationMessage('Semua kolom wajib diisi'); return false; }
            return {
                judul: j, isi: i,
                status: document.getElementById('swalStatusB').value
            };
        }
    });

    if (formValues) {
        try {
            await sql`INSERT INTO berita (judul, isi, status, author) VALUES (${formValues.judul}, ${formValues.isi}, ${formValues.status}, ${currentUser?.username || 'Admin'})`;
            Swal.fire('Berhasil', 'Berita disimpan', 'success');
            fetchBerita();
        } catch (err) { Swal.fire('Error', 'Gagal menyimpan', 'error'); }
    }
});

window.hapusBerita = async (id) => {
    if (confirm('Yakin hapus berita ini?')) {
        await sql`DELETE FROM berita WHERE id = ${id}`;
        fetchBerita();
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
};

const init = async () => {
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
