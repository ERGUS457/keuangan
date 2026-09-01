// neon-config.js
import { neon } from "https://esm.sh/@neondatabase/serverless";

/*
 * INSTRUKSI SETUP DATABASE (NEON):
 * 1. Buka neon.tech, buat project baru (PostgreSQL).
 * 2. Di dashboard project, cari "Connection string" (biasanya di menu Dashboard -> Quick Connect).
 * 3. Ganti NEON_CONNECTION_STRING di bawah ini dengan Connection String milikmu.
 *    (Contoh: postgresql://username:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require)
 * 4. Buka menu SQL Editor di Neon, jalankan query berikut untuk membuat tabel:
 * 
 *    CREATE TABLE IF NOT EXISTS transaksi (
 *      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *      type VARCHAR(10) NOT NULL,
 *      nominal NUMERIC NOT NULL,
 *      judul TEXT NOT NULL,
 *      kategori TEXT NOT NULL,
 *      tanggal DATE NOT NULL,
 *      catatan TEXT,
 *      image_base64 TEXT,
 *      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 *    );
 *
 * Catatan Keamanan: 
 * Menyimpan Connection String langsung di frontend sangat tidak disarankan untuk aplikasi produksi, 
 * namun bisa digunakan untuk keperluan testing SPA ini. 
 * Selain itu, karena Neon tidak memiliki layanan Storage file khusus, gambar (bukti transaksi) 
 * akan disimpan langsung ke database dalam format Base64 (Text).
 */

const NEON_CONNECTION_STRING = 'postgresql://neondb_owner:npg_qYctUjrel04Z@ep-dawn-union-b3anw5uv-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Export sql function untuk mengeksekusi query HTTP dari frontend
export const sql = neon(NEON_CONNECTION_STRING);
