import { sql } from './neon-config.js';

// --- State ---
let transactions = [];
let currentImageBase64 = null;
let currentActiveTxId = null;

// --- DOM Elements ---
const views = document.querySelectorAll('.view-section');
const navBtns = document.querySelectorAll('.nav-btn');

const txtTotalSaldo = document.getElementById('txtTotalSaldo');
const txtTotalMasuk = document.getElementById('txtTotalMasuk');
const txtTotalKeluar = document.getElementById('txtTotalKeluar');
const recentTxList = document.getElementById('recentTxList');
const historyTxList = document.getElementById('historyTxList');

const txForm = document.getElementById('txForm');
const typeBtns = document.querySelectorAll('.type-btn');
const inputType = document.getElementById('inputType');
const inputNominal = document.getElementById('inputNominal');
const inputJudul = document.getElementById('inputJudul');
const inputKategori = document.getElementById('inputKategori');
const inputTanggal = document.getElementById('inputTanggal');
const inputCatatan = document.getElementById('inputCatatan');

const inputFileGallery = document.getElementById('inputFileGallery');
const inputFileCamera = document.getElementById('inputFileCamera');
const previewContainer = document.getElementById('previewContainer');
const imgPreview = document.getElementById('imgPreview');
const btnRemoveImage = document.getElementById('btnRemoveImage');

const btnSubmitTx = document.getElementById('btnSubmitTx');
const btnSubmitText = document.getElementById('btnSubmitText');
const spinnerSubmit = document.getElementById('spinnerSubmit');
const btnExport = document.getElementById('btnExport');

const txModal = document.getElementById('txModal');
const txModalContent = document.getElementById('txModalContent');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnDeleteTx = document.getElementById('btnDeleteTx');
const modalImageContainer = document.getElementById('modalImageContainer');

// --- Formatters ---
const formatRupiah = (angka) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
};

// --- Navigation ---
navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const navBtn = e.currentTarget;
        const targetId = navBtn.getAttribute('data-target');
        if (!targetId) return;
        
        // Update view
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        
        // Update bottom nav styling
        navBtns.forEach(n => {
            if (n.classList.contains('bg-primary')) return; // keep FAB styled
            n.classList.remove('text-primary');
            n.classList.add('text-gray-400');
        });
        
        if (!navBtn.classList.contains('bg-primary')) {
            navBtn.classList.add('text-primary');
            navBtn.classList.remove('text-gray-400');
        }
    });
});

document.getElementById('btnViewAll').addEventListener('click', () => {
    document.querySelector('[data-target="viewHistory"]').click();
});

// --- Form Logic ---
typeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const type = btn.dataset.type;
        inputType.value = type;
        
        typeBtns.forEach(b => {
            b.classList.remove('bg-white', 'shadow', 'text-success', 'text-danger');
            b.classList.add('text-gray-500');
        });
        
        btn.classList.add('bg-white', 'shadow');
        btn.classList.remove('text-gray-500');
        if(type === 'in') btn.classList.add('text-success');
        else btn.classList.add('text-danger');
    });
});

// Auto format nominal input
inputNominal.addEventListener('input', function(e) {
    let value = this.value.replace(/[^0-9]/g, '');
    if (value !== '') {
        this.value = new Intl.NumberFormat('id-ID').format(parseInt(value));
    }
});

// Set default date to today
inputTanggal.valueAsDate = new Date();

// --- Image Handling (Compress & Preview) ---
const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            // Compress Image (Neon does not have storage, so we compress heavily and save as Base64)
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 500; // Smaller max width for base64 storage
            const MAX_HEIGHT = 500;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 50% quality to save space in DB
            currentImageBase64 = canvas.toDataURL('image/jpeg', 0.5); 
            
            // Show preview
            imgPreview.src = currentImageBase64;
            previewContainer.classList.remove('hidden');
        };
    };
};

inputFileGallery.addEventListener('change', handleImageSelect);
inputFileCamera.addEventListener('change', handleImageSelect);

btnRemoveImage.addEventListener('click', () => {
    currentImageBase64 = null;
    imgPreview.src = '';
    previewContainer.classList.add('hidden');
    inputFileGallery.value = '';
    inputFileCamera.value = '';
});

// --- Submit Transaction ---
txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nominalRaw = parseInt(inputNominal.value.replace(/[^0-9]/g, ''));
    if (isNaN(nominalRaw) || nominalRaw <= 0) {
        Swal.fire('Error', 'Nominal tidak valid', 'error');
        return;
    }

    try {
        btnSubmitTx.disabled = true;
        btnSubmitText.textContent = 'Menyimpan...';
        spinnerSubmit.classList.remove('hidden');

        // Check if DB is configured
        if (!sql) {
            // Mock Saving for demonstration
            setTimeout(() => {
                Swal.fire('Info', 'Simulasi berhasil! Setup Connection String Neon di neon-config.js untuk menyimpan data sebenarnya.', 'info');
                resetForm();
                document.querySelector('[data-target="viewDashboard"]').click();
            }, 1000);
            return;
        }

        // Save to Neon Postgres DB
        await sql`
            INSERT INTO transaksi (type, nominal, judul, kategori, tanggal, catatan, image_base64) 
            VALUES (
                ${inputType.value}, 
                ${nominalRaw}, 
                ${inputJudul.value}, 
                ${inputKategori.value}, 
                ${inputTanggal.value}, 
                ${inputCatatan.value}, 
                ${currentImageBase64}
            )
        `;

        Swal.fire({
            icon: 'success',
            title: 'Berhasil',
            text: 'Transaksi berhasil disimpan!',
            timer: 1500,
            showConfirmButton: false
        });

        resetForm();
        document.querySelector('[data-target="viewDashboard"]').click();

        // Refresh data manually after inserting
        await fetchDataManual();

    } catch (error) {
        console.error("Error adding document: ", error);
        Swal.fire('Error', 'Gagal menyimpan transaksi: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        btnSubmitTx.disabled = false;
        btnSubmitText.textContent = 'Simpan Transaksi';
        spinnerSubmit.classList.add('hidden');
    }
});

const resetForm = () => {
    txForm.reset();
    inputNominal.value = '';
    inputTanggal.valueAsDate = new Date();
    btnRemoveImage.click();
};

// --- Fetch Data ---
const fetchDataManual = async () => {
    if (!sql) {
        // Mock data
        transactions = [
            { id: '1', type: 'in', nominal: 1500000, judul: 'Dana Sponsor', kategori: 'Sponsorship', tanggal: '2023-08-10', catatan: '' },
            { id: '2', type: 'out', nominal: 350000, judul: 'Beli Konsumsi Rapat', kategori: 'Konsumsi', tanggal: '2023-08-12', catatan: 'Nasi kotak 10 porsi' }
        ];
        renderDashboard();
        renderHistory();
        return;
    }

    try {
        const result = await sql`SELECT * FROM transaksi ORDER BY tanggal DESC, created_at DESC`;
        transactions = result || [];
        renderDashboard();
        renderHistory();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

// --- Render UI ---
const renderDashboard = () => {
    let totalIn = 0;
    let totalOut = 0;

    transactions.forEach(tx => {
        if (tx.type === 'in') totalIn += Number(tx.nominal);
        else totalOut += Number(tx.nominal);
    });

    const saldo = totalIn - totalOut;

    txtTotalSaldo.textContent = formatRupiah(saldo);
    txtTotalMasuk.textContent = formatRupiah(totalIn);
    txtTotalKeluar.textContent = formatRupiah(totalOut);

    // Recent 5 transactions
    recentTxList.innerHTML = '';
    const recent = transactions.slice(0, 5);
    
    if (recent.length === 0) {
        recentTxList.innerHTML = '<div class="text-center text-gray-400 py-4 italic text-sm">Belum ada transaksi</div>';
        return;
    }

    recent.forEach(tx => {
        recentTxList.appendChild(createTxElement(tx));
    });
};

const renderHistory = () => {
    historyTxList.innerHTML = '';
    if (transactions.length === 0) {
        historyTxList.innerHTML = '<div class="text-center text-gray-400 py-10 italic">Belum ada transaksi</div>';
        return;
    }
    
    transactions.forEach(tx => {
        historyTxList.appendChild(createTxElement(tx));
    });
};

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
                <p class="text-[10px] text-gray-500">${formatDate(tx.tanggal)} &bull; ${tx.kategori}</p>
            </div>
        </div>
        <div class="text-right shrink-0">
            <p class="font-bold text-sm ${textColor}">${sign}${formatRupiah(tx.nominal)}</p>
        </div>
    `;

    div.addEventListener('click', () => openDetailModal(tx));
    return div;
};

// --- Modal Detail ---
const openDetailModal = (tx) => {
    currentActiveTxId = tx.id;
    const isMasuk = tx.type === 'in';
    
    document.getElementById('modalBadge').textContent = isMasuk ? 'Pemasukan' : 'Pengeluaran';
    document.getElementById('modalBadge').className = `text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide ${isMasuk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    
    document.getElementById('modalJudul').textContent = tx.judul;
    document.getElementById('modalKategori').innerHTML = `<i class="fa-solid fa-tag"></i> ${tx.kategori}`;
    document.getElementById('modalTanggal').textContent = formatDate(tx.tanggal);
    
    document.getElementById('modalNominal').textContent = formatRupiah(tx.nominal);
    document.getElementById('modalNominal').className = `text-xl font-extrabold ${isMasuk ? 'text-green-600' : 'text-red-600'}`;
    
    document.getElementById('modalCatatan').textContent = tx.catatan || '-';

    const imgEl = document.getElementById('modalImage');
    const noImgEl = document.getElementById('modalNoImage');
    const overlay = document.getElementById('modalImageOverlay');

    if (tx.image_base64) {
        imgEl.src = tx.image_base64;
        imgEl.classList.remove('hidden');
        noImgEl.classList.add('hidden');
        
        // Setup zoom functionality
        modalImageContainer.onclick = () => {
            document.getElementById('zoomedImage').src = tx.image_base64;
            document.getElementById('btnDownloadImage').href = tx.image_base64;
            document.getElementById('imageZoomModal').classList.remove('hidden');
            document.getElementById('imageZoomModal').classList.add('flex');
        };
    } else {
        imgEl.src = '';
        imgEl.classList.add('hidden');
        noImgEl.classList.remove('hidden');
        modalImageContainer.onclick = null;
        overlay.classList.add('hidden'); // hide zoom icon
    }

    txModal.classList.add('active');
    setTimeout(() => {
        txModalContent.classList.remove('scale-95', 'opacity-0');
        txModalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
};

btnCloseModal.addEventListener('click', () => {
    txModalContent.classList.remove('scale-100', 'opacity-100');
    txModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        txModal.classList.remove('active');
    }, 200);
});

// Close zoom modal
document.getElementById('btnCloseZoom').addEventListener('click', () => {
    document.getElementById('imageZoomModal').classList.add('hidden');
    document.getElementById('imageZoomModal').classList.remove('flex');
});

// --- Delete Transaction ---
btnDeleteTx.addEventListener('click', async () => {
    if (!currentActiveTxId) return;

    const tx = transactions.find(t => t.id === currentActiveTxId);
    
    Swal.fire({
        title: 'Hapus Transaksi?',
        text: "Data yang dihapus tidak dapat dikembalikan!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then(async (result) => {
        if (result.isConfirmed) {
            
            if (!sql) {
                Swal.fire('Terhapus', 'Simulasi hapus berhasil.', 'success');
                btnCloseModal.click();
                return;
            }

            try {
                // Delete doc from Neon
                await sql`DELETE FROM transaksi WHERE id = ${tx.id}`;
                
                btnCloseModal.click();
                Swal.fire('Terhapus!', 'Transaksi telah dihapus.', 'success');
                fetchDataManual(); // Refresh manually
            } catch (error) {
                console.error("Error removing document: ", error);
                Swal.fire('Error', 'Gagal menghapus transaksi', 'error');
            }
        }
    });
});

// --- Export to CSV ---
btnExport.addEventListener('click', () => {
    if (transactions.length === 0) {
        Swal.fire('Info', 'Belum ada data untuk diekspor', 'info');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Tanggal,Jenis,Kategori,Judul,Nominal,Catatan\n";

    transactions.forEach(tx => {
        const jenis = tx.type === 'in' ? 'Pemasukan' : 'Pengeluaran';
        // escape quotes in notes/judul
        const judul = `"${tx.judul.replace(/"/g, '""')}"`;
        const catatan = tx.catatan ? `"${tx.catatan.replace(/"/g, '""')}"` : '""';
        
        const row = `${tx.tanggal},${jenis},${tx.kategori},${judul},${tx.nominal},${catatan}`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Keuangan_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
});

// Initialize
fetchDataManual();
