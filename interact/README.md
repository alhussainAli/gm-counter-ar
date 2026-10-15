# Radiation–Matter Interactions AR

An augmented-reality Monte Carlo lab. Fire **electrons, β⁻, protons, alphas, neutrons, γ rays or x-rays** into **air, water, polyethylene, aluminium, concrete or lead**. Watch the tracks, every ionization and excitation, and the secondary particles on a black stage, then open the **atomic close-up** to see each process happen at the scale of one atom.

Developed by Dr. Alhussain Abuhoza (KACST).

**Live:** https://alhussainali.github.io/gm-counter-ar/interact/

> Educational simulation. Time is slowed by about 10⁹; real radiation is invisible. Approximations are listed below. Not for dosimetry or shielding design.

## Use it
1. Open the link or scan the QR code on `InteractionsAR-sheet.pdf`.
2. Choose **AR on a table** (Chrome on Android), **AR with the printed marker** (iPhone and Android; the same Hiro marker as the other labs) or **3D view** (any device).
3. Pick a radiation type, a material and an energy. Press **Fire one** to watch a single history, or **Beam** for a continuous stream.
4. Tap any interaction in the list to replay it in the **Atomic close-up**.

## What is shown

| Element | Meaning |
|---|---|
| Coloured block | The material (air pale blue, water blue, polyethylene white, aluminium silver, concrete sand, lead slate). The true thickness is printed under it; the block is always drawn the same size. |
| Lines | Particle tracks: γ gold, x-ray cream, e⁻/β⁻ blue, e⁺ magenta, proton crimson, alpha orange, neutron green dashed. |
| White dots | Ionizations (each dot stands for N real ion pairs; N is shown per history). |
| Violet dots | Excitations. |
| Cyan dots | Cherenkov light (charged particles faster than light in the medium). |
| Flashes | Discrete interactions (photoelectric, Compton, pair, capture …). |
| Atomic close-up | Nucleus, shells with real binding energies, and an animation of the chosen event: ionization, excitation, photoelectric absorption, Compton, Rayleigh, pair production, annihilation, bremsstrahlung, δ-rays, neutron elastic/inelastic scattering, capture, ¹⁴N(n,p), proton nuclear reactions, and the vacancy cascade (fluorescence x-ray or Auger electron). |

Panels: interaction list, atomic view, depth-dose curve (Bragg peak, exponential attenuation, build-up), ionization and excitation counts, fate of all particles, physics data (μ, HVL, mean free path, stopping power, LET, CSDA range, Cherenkov threshold, process shares) and the source spectrum (β⁻ allowed shape, x-ray tube Kramers spectrum with W K lines).

## Physics model

- **Photons:** NIST total attenuation coefficients. Compton by Klein–Nishina (Butcher–Messel sampling); pair production with e⁺ annihilation into 2 × 511 keV; Rayleigh with an approximate angular width; photoelectric absorption with K/L shell selection (jump ratio). The vacancy relaxes by fluorescence (ω_K from Krause 1979) or by a KLL/LMM Auger electron, with real line and binding energies.
- **Electrons, β⁻, positrons:**
  - Condensed-history transport with ICRU-37 collision stopping power and the Sternheimer density effect.
  - Radiative loss after Knoll ((E + mc²)Z/1600 mc²), with bremsstrahlung photons sampled at a consistent rate.
  - Highland multiple scattering and Bohr straggling.
  - δ-rays (Møller/Rutherford 1/T²) above a visibility cut, and Cherenkov emission above β > 1/n.
- **Protons and alphas:**
  - Bethe–Bloch with density effect above 2.5 MeV; below that, tabulated water stopping (after ICRU 49) scaled to each material.
  - Alpha effective charge fitted so ranges agree with Geiger's rule (air) and Bragg–Kleeman scaling (water).
  - δ-rays, straggling and multiple scattering; simplified proton non-elastic nuclear reactions (σ ≈ 45 mb·A^0.69).
- **Neutrons:**
  - Elastic scattering with exact two-body kinematics; n–p cross-section fit, recoil protons tracked.
  - Thermalization and diffusion.
  - Radiative capture with element-specific γ lines (H 2.2246 MeV, Pb 7.37 MeV, Al 7.72 MeV …), ¹⁴N(n,p)¹⁴C, and inelastic (n,n′γ) on Pb, Al, Si, C, O.
  - Analytic cross-section fits; resonances are omitted.
- **Ionization and excitation:** count = continuous energy loss ÷ W. W = 33.97 eV for air (ICRU); for condensed media W and the excitation-to-ionization ratio are illustrative values. Sampled events record the element and shell (shell weighted by electrons/binding energy) for the atomic view.
- **Energy ledger:** every history checks E₀ + Q (capture, annihilation) − rest mass = deposited + escaped.

**Not modelled:** molecular chemistry and radicals beyond the text, ion recombination, channeling, photonuclear reactions, alpha nuclear reactions, neutron resonances, coincidence effects, electron binding in Compton scattering.

## Validation

Run `node interact/validate.js`. Results are written to `VALIDATION.md` (29/29 passed).

| Area | Check |
|---|---|
| Energy conservation | All 7 radiation types × 6 materials balance to < 10⁻⁶ MeV |
| Ranges | e⁻ 1 and 10 MeV and p⁺ 10/100/200 MeV CSDA ranges in water vs NIST (within 1%); α in air vs Geiger's rule; α in water vs Bragg–Kleeman; stopping powers vs NIST |
| Depth dose | 100 MeV proton Bragg peak at 99% of the CSDA range |
| Photon attenuation | Uncollided transmission = e^(−μx) for 4 material/energy pairs; dominant process vs energy |
| Atomic processes | Pb K-shell photoabsorption fraction; Pb fluorescence yield 0.963; O Auger dominance; Compton edge; no pairs below 1.022 MeV; Cherenkov threshold 262 keV in water |
| Neutrons | Collisions to thermalize in water vs ln(E₀/E_th)/ξ; capture on H in water; maximum energy transfer to Pb |
| Sources | β⁻ mean energies (P-32, C-14) vs DDEP; x-ray tube endpoint and mean |
| Ionization | Ion pairs from a 5.49 MeV alpha stopped in air = E/W |

## Data sources
- NIST X-ray mass attenuation coefficients, compositions, densities, I-values — https://physics.nist.gov/PhysRefData/XrayMassCoef/
- X-ray Data Booklet (LBNL): binding energies (Table 1-1), x-ray lines (Table 1-2) — https://xdb.lbl.gov/
- M. O. Krause, J. Phys. Chem. Ref. Data 8 (1979) 307 — fluorescence yields
- ICRU Reports 37 and 49; NIST ESTAR/PSTAR/ASTAR — stopping powers and ranges
- Particle Data Group — radiation lengths and density-effect parameters
- DDEP/LNHB — β⁻ endpoint and mean energies
- G. F. Knoll, *Radiation Detection and Measurement*; F. H. Attix, *Introduction to Radiological Physics and Radiation Dosimetry*

## Run locally
```bash
python3 -m http.server 8000     # in the repository root
# open http://localhost:8000/interact/?view=3d
```
