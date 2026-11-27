# Portofolio Nur Sa'idah

Portfolio statis untuk Nur Sa'idah, Finance & Accounting Specialist. Berisi ringkasan profil, keahlian, pengalaman, sertifikasi, serta Accounting Mini Tools (rekonsiliasi saldo, cek debit-kredit, laba-rugi, penyusutan aset, pembukuan, dan invoice dengan pratinjau cetak PDF).

## Menjalankan

```powershell
python -m http.server 8000
```

Lalu buka `http://localhost:8000/`.

## Build CSS

```powershell
npx --yes --package=tailwindcss@3.4.17 tailwindcss -c portfolio.tailwind.config.cjs -i portfolio.input.css -o portfolio.generated.css
```

## Tes

```powershell
node --test accounting-tools.test.cjs about-flip.test.cjs portfolio-performance.test.cjs
node accounting-browser-check.cjs
```

Aset yang dipakai halaman: `about-portrait.webp`, `hero-photo.webp`, dan `contact-photo-full.webp`.
