# SmartWarga

## Menjalankan aplikasi

Jalankan server dari folder aplikasi:

```powershell
python server.py
```

Server tersedia di `http://127.0.0.1:8000`. Pada penggunaan pertama, buat kata sandi Admin minimal 12 karakter saat diminta di terminal. Kata sandi disimpan sebagai hash PBKDF2 di database SQLite `smartwarga.sqlite3`; tidak ada kata sandi bawaan. Buka alamat server tersebut, lalu pilih **Admin** untuk masuk.

Jangan membuka `index.html` langsung jika ingin memakai fitur Admin. Mode file langsung hanya menyediakan penyimpanan lokal browser dan tidak mengaktifkan login Admin.
Laporan lama yang tersimpan di localStorage tidak otomatis dipindahkan ke database server.

## Hak akses

- **Warga:** mengirim laporan, melihat peta, dan melacak status menggunakan ID laporan atau email.
- **Admin:** masuk dengan kata sandi untuk melihat semua laporan dan ringkasan statistik, serta mengubah status dan keterangan tindak lanjut. Keterangan wajib untuk status **Ditindaklanjuti** dan **Selesai**.

Laporan dan foto disimpan di database server. Sesi Admin memakai cookie HttpOnly dan berakhir setelah 8 jam atau saat server dimulai ulang. Server bawaan hanya mendengarkan `127.0.0.1`, sehingga hanya dapat diakses dari komputer yang menjalankannya. Jika aplikasi akan dibuka untuk warga dari perangkat lain, gunakan hosting backend yang dikelola dengan HTTPS dan tinjau konfigurasi keamanan sebelum mengeksposnya ke jaringan publik.

Fitur peta memerlukan Google Maps JavaScript API; pencarian alamat menggunakan OpenStreetMap/Nominatim dan widget cuaca menggunakan Open-Meteo. Chatbot server memerlukan `GEMINI_API_KEY`; tanpa konfigurasi tersebut, panduan chatbot lokal tetap dapat digunakan.
