# Gamma Spectroscopy AR

An interactive augmented-reality lab showing how gamma rays are detected and turned into an energy spectrum, comparing a **high-purity germanium (HPGe)** detector with a **NaI(Tl) scintillation** detector.

Developed by Dr. Alhussain Abuhoza (KACST).

**Live:** https://alhussainali.github.io/gm-counter-ar/gamma/

> Educational approximation. Animations are slowed down by about 10⁹ and real radiation is invisible. Nothing here is laboratory-grade or calibration data for a real instrument.

---

## 1. Implementation plan

**Platform: a static web app (three.js + WebXR, with an A-Frame/AR.js marker mode).**
- It runs from a link or QR code with no install, on the phones trainees already have.
- **WebXR `immersive-ar` with hit-test** places the detector on a real table (Chrome on Android).
- iPhone Safari has no WebXR, so a **printed-marker mode** (A-Frame 1.4.2 + AR.js 3.4.5, Hiro marker) gives camera AR on iOS and Android.
- An **interactive 3D view** (three.js r147 + OrbitControls) is the fallback for any device without AR.
- GitHub Pages provides the HTTPS that camera access needs.

**Architecture**

| File | Role |
|---|---|
| `js/physics.js` | Nuclear data, photon transport (Monte Carlo), detector quanta, preamp waveform, ADC, trapezoidal filter, calibration, acquisition with pile-up and dead time. Runs in the browser and in Node. |
| `js/scene.js` | 3D models of both detectors with labels and cutaway, slowed photon tracks, electron–hole drift, scintillation light and PMT multiplication. |
| `js/app.js` | Modes, signal-chain stepper, spectra, resolution tools, guided demos, and the three hosts (3D, WebXR, marker). |
| `js/boot.js` | Loads the right libraries for the chosen view. |
| `validate.js` | Automated validation checklist (writes `VALIDATION.md`). |

**One coherent event model.** Every event is a single Monte Carlo history. The same object drives the 3D interaction animation, the energy ledger, the number of charge carriers or photoelectrons, the digitized waveform, the energy estimate and the histogram bin.

```
gamma emission → transport in crystal (photo / Compton / pair, escapes)
→ deposited energy → e–h pairs (HPGe) or light → photoelectrons → PMT gain (NaI)
→ charge-sensitive preamp (τ = 50 µs) → ADC (fs, bits, gain, noise)
→ trapezoidal filter (pole-zero corrected) → energy estimate
→ calibration E = (FS / Nch) × channel → histogram bin
```

## 2. What is in the prototype

- **AR / 3D detector view.** Labelled HPGe (p-type coaxial crystal, n⁺/p⁺ contacts, Al endcap, copper cold finger, LN₂ dewar, preamp) and NaI(Tl) (crystal, reflector, optical window and coupling gel, photocathode, 10 dynodes, anode, voltage divider). There is a transparent cutaway, rotation and pinch-to-scale. In compare mode the two detectors sit side by side with the source between them.
- **Follow one photon** (8 steps): emission → interaction → detector signal → preamplifier → digitization → pulse processing → energy estimate → histogram.
  - You can choose a random event or force a full-energy, Compton-escape, pair-production or pass-through event. A forced event is still a genuine Monte Carlo history, found by rejection sampling.
  - A live energy ledger shows incident, deposited and escaped energy, with a conservation check.
  - The waveform panel shows the analog preamp output, the ADC samples, the trapezoid output and the sampling point. It has sampling-rate, bit-depth, gain and noise controls.
  - The receiving histogram bin is highlighted.
- **Build a spectrum.**
  - Sources: Cs-137, Co-60, Na-22, Am-241, Ba-133, a synthetic two-line source, and any mixture, each with its activity in kBq.
  - Controls for distance, acquisition time, background flux and detector dimensions.
  - Random (Poisson) arrival times, with optional pile-up and dead time and pile-up rejection.
  - HPGe and NaI(Tl) spectra update in sync, with zoom, linear/log scale, overlay or stacked views and normalisation. Clicking a peak measures FWHM and R = FWHM/E × 100%.
  - The Rates table separates activity, emitted photons, photons reaching the crystal, interacting events and recorded counts.
  - There is a full-energy-peak efficiency table.
- **Resolution tab.** Energy-dependent FWHM models with adjustable, clearly labelled illustrative parameters:
  - HPGe: Fano factor, charge-collection term, electronic noise.
  - NaI(Tl): photoelectrons per keV, intrinsic term, PMT excess-noise factor.
  - A breakdown of each contribution, and a two-line demo with adjustable separation that can be acquired as a real spectrum.
- **Guided demos.** Full-energy absorption, Compton escape, mixed-source identification, resolution comparison (Ba-133 79.6/81.0 keV doublet) and high-rate pile-up.

## 3. Setup and running

**Use it:** open https://alhussainali.github.io/gm-counter-ar/gamma/ (or scan the QR code on `GammaSpectroscopyAR-sheet.pdf`) and pick one of three options:

1. **AR on a table:** Chrome on an ARCore-capable Android phone. Move the phone over a table until the ring appears, then tap *Place here*.
2. **AR with the printed marker:** iPhone or Android. Print the sheet at 100%, lay it flat in good light, and allow the camera.
3. **3D view:** any browser.

**Run locally:** browsers block the camera on plain `file://` pages, so serve the folder over HTTP:

```bash
git clone https://github.com/alhussainAli/gm-counter-ar
cd gm-counter-ar
python3 -m http.server 8000      # then open http://localhost:8000/gamma/?view=3d
```

Camera AR on a phone needs HTTPS (GitHub Pages provides it). Libraries load from public CDNs (jsDelivr, aframe.io), so an internet connection is needed.

**Run the validation:** `node gamma/validate.js` (Node 18+, about 2 minutes). It prints each check and writes `gamma/VALIDATION.md`.

## 4. Model, assumptions and omitted effects

- **Geometry:** point source on the detector axis. Photons are sampled into the cone of the crystal front face (Ω/4π reported). The Al window and the 0.7 mm Ge dead layer absorb photons with no signal. Crystals are cylinders; the HPGe has a central core hole.
- **Interactions:** NIST total attenuation coefficients (Ge, Na, I, Al). Compton scattering by Klein–Nishina (Butcher–Messel sampling). Pair production uses Z²/A-scaled coefficients, and the positron annihilates at rest into two back-to-back 511 keV photons. Photoabsorption includes K x-ray fluorescence (Ge Kα 9.9 keV, I Kα 28.5 keV), which can escape.
- **Approximations:** the photoelectric coefficient = total − Klein–Nishina − pair, so coherent scattering is counted as absorption and electron binding in Compton scattering is ignored. Electrons deposit energy locally (no electron range or bremsstrahlung escape).
- **HPGe signal:** N = E/2.96 eV electron–hole pairs with Fano statistics, plus a charge-collection term proportional to E. The rise time comes from carrier drift (~0.1 mm/ns) split by the Ramo weighting potential of a coaxial geometry.
- **NaI(Tl) signal:** 38 photons/keV with an intrinsic (non-proportionality) spread. Light collection × quantum efficiency is binomial. PMT gain is 10⁶ with an excess-noise factor, and the scintillation decay is 230 ns.
- **Electronics:** charge-sensitive preamp (τ = 50 µs), white noise per sample, ADC quantization and full-scale overflow, Jordanov trapezoidal filter (HPGe 4 µs rise / 1 µs flat top, NaI 1 / 0.8 µs). The energy is read at the end of the flat top.
  - *Follow one photon* digitizes the whole waveform.
  - *Build a spectrum* applies the same filtered noise statistically, for speed. Validation confirms the two agree.
- **Rates:** Poisson arrivals. Pulses arriving before the energy is sampled sum (pile-up) or are rejected (PUR). Non-paralyzable busy time per processed pulse.
- **Background:** illustrative natural-line mix (K-40, Bi-214, Pb-214, Tl-208, Ac-228, Pb-212) plus a falling continuum, incident on the front face.
- **Not modelled:** scattering from surroundings (backscatter peak, shielding), side entry, true-coincidence summing (Co-60), 511 keV angular correlation (Na-22), ballistic-deficit and trapping maps, PMT non-linearity, temperature effects, baseline restoration.
- **Line lists are simplified:** the strongest γ and x-ray lines only, not complete decay schemes. Each source shows a note on what was left out.

| Nuclide | Lines used (keV, photons per 100 decays) |
|---|---|
| Cs-137 | 661.655 (85.01) |
| Co-60 | 1173.228 (99.85), 1332.492 (99.9826) |
| Na-22 | 511 annihilation (180.7), 1274.537 (99.94) |
| Am-241 | 26.3446 (2.31), 33.1963 (0.1215), 59.5409 (35.92) |
| Ba-133 | Cs Kα2 30.6254 (33.8), Kα1 30.9731 (62.4), Kβ1 34.9873 (18.24); 53.1622 (2.14), 79.6142 (2.63), 80.9979 (33.31), 160.6121 (0.638), 223.2368 (0.450), 276.3989 (7.13), 302.8508 (18.31), 356.0129 (62.05), 383.8485 (8.94) |
| K-40 (background) | 1460.822 (10.34) |

## 5. References

- DDEP / LNHB Recommended Data, *Table de Radionucléides*, http://www.lnhb.fr/home/nuclear-physics-data/ (γ energies and emission probabilities).
- J. H. Hubbell and S. M. Seltzer, *Tables of X-Ray Mass Attenuation Coefficients*, NIST SRD 126, https://physics.nist.gov/PhysRefData/XrayMassCoef/
- ENSDF via NNDC, https://www.nndc.bnl.gov/ (background line energies).
- G. F. Knoll, *Radiation Detection and Measurement*, 4th ed., Wiley, 2010.
- G. Gilmore, *Practical Gamma-ray Spectrometry*, 2nd ed., Wiley, 2008.
- V. T. Jordanov and G. F. Knoll, *Nucl. Instrum. Meth. A* 345 (1994) 337 (trapezoidal shaping).
- O. Klein and Y. Nishina, *Z. Phys.* 52 (1929) 853; J. C. Butcher and H. Messel, *Nucl. Phys.* 20 (1960) 15.
- S. Ramo, *Proc. IRE* 27 (1939) 584 (induced signals, weighting potential).
- U. Fano, *Phys. Rev.* 72 (1947) 26 (Fano factor).

## 6. Validation checklist

Run `node gamma/validate.js`. The latest results are in [`VALIDATION.md`](VALIDATION.md) (31/31 passed).

| Area | Check |
|---|---|
| Energy conservation | Deposited + escaped + window-absorbed = incident energy for every history (HPGe and NaI, 26 keV – 2.6 MeV) |
| Energy conservation | No pair production below 1022 keV; single- and double-escape events above it |
| Calibration | A noise-free digitized pulse returns E_est = E (both detectors) |
| Calibration | E = (FS/Nch) × channel; changing gain moves the channel, not the energy |
| Calibration | Noise from fully digitized waveforms = noise used in fast spectrum mode |
| Peak positions | Photopeak centroids at the true line energies (HPGe ±0.15 keV, NaI ±2 keV) |
| Peak positions | Compton edge at E·2k/(1+2k) (477.3 keV for Cs-137); escape peaks at E − 511 and E − 1022 keV |
| Intensity scaling | 10× activity → 10× counts, with no shift in peak energy |
| Intensity scaling | Activity, emitted rate and incident rate separated and consistent with geometry |
| Intensity scaling | High rates produce dead time and pile-up |
| Resolution | Measured FWHM matches the model (within 12%); FWHM rises and R falls with energy |
| Resolution | HPGe R(662) ≈ 0.2% vs NaI(Tl) ≈ 7% (illustrative defaults) |
| Resolution | Ba-133 79.6/81.0 keV doublet: two peaks in HPGe, one in NaI(Tl) |
| Resolution | Efficiency is separate from resolution: the 3″×3″ NaI is more efficient than the HPGe here |
