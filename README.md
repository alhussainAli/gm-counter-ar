# GM Counter AR

Browser-based augmented-reality training station for Geiger-Müller counters. A virtual check source, shield and GM tube appear on a printed Hiro marker. Trainees change the source (Am-241, Sr-90, Cs-137), shield (paper, 3 mm Al, 10 mm Pb), distance and activity, and watch particles reach the tube or get stopped. A ratemeter, dead-time loss and timed counts with √N uncertainty are shown on screen.

**Live page:** https://alhussainali.github.io/gm-counter-ar/

## Use it
1. Print `GM-Counter-AR-marker-sheet.pdf` at 100% scale.
2. Scan the QR code, tap **Start AR**, allow the camera.
3. Point the phone at the marker from 30–50 cm.

Works in Safari on iPhone and Chrome on Android. The camera needs HTTPS, which GitHub Pages provides.

## Files
- `index.html` – the AR page (A-Frame 1.4.2 + AR.js 3.4.5, loaded from CDN)
- `hiro.png` – the marker image
- `GM-Counter-AR-marker-sheet.pdf` – printable sheet with QR code and marker

All sources and rates are simulated for teaching. No radioactive material is involved.

## Also in this repository

**[Gamma Spectroscopy AR](gamma/)**: HPGe vs NaI(Tl), from gamma photon to energy spectrum. Live at https://alhussainali.github.io/gm-counter-ar/gamma/

**[Radiation–Matter Interactions AR](interact/)**: e⁻, β⁻, p, α, n, γ and x-rays in air, water, polyethylene, aluminium, concrete and lead, down to atomic processes. Live at https://alhussainali.github.io/gm-counter-ar/interact/
