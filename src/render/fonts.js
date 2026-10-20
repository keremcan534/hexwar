// Tuvalin yazı tipleri — src/fonts.css'teki takma adların aynısı.
//
// Harita yazıları eskiden Georgia ve system-ui'yi elle yazıyordu; CSS
// değişkeni değişince harita eski fontta kalıyordu. Aile adı burada TEK
// yerde: renderer ve seaLayer buradan okur. Sistem fontları yalnız yedektir.
//
// Web fontu ilk kareden SONRA iner. Tuvale pişmiş metin (uzak zoom önbelleği,
// sayaç sprite'ları, ölçü önbelleği) o ana dek yedek fontla kalır; bu yüzden
// yüklenince renderer bunları bir kez boşaltır (whenFontsReady).

export const FONT_DISPLAY = '"HW Display", Georgia, "Times New Roman", serif';
export const FONT_UI = '"HW UI", "Segoe UI", system-ui, sans-serif';

// Haritanın kullandığı yüzler: dik, eğik ve kalın arayüz.
const FACES = ['600 100px "HW Display"', 'italic 400 100px "HW Display"', '800 20px "HW UI"'];

export function whenFontsReady(done) {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  Promise.all(FACES.map((face) => document.fonts.load(face))).then(() => done(), () => {});
}
