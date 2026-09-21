# Bundled fonts

Barista ships these files as separate works under the SIL Open Font License 1.1 (OFL). The OFL is
compatible with distributing the fonts alongside a GPLv3 application. Each directory contains the
verbatim OFL text supplied by its upstream project. Barista references bundled families by ID in a
`.bar` file; it does not duplicate their bytes inside each document.

| Bundle ID | Family and purpose | Styles | Upstream source | Bytes |
| --- | --- | --- | --- | ---: |
| `inter` | Inter, UI and general label text | Variable roman and italic, 100–900 | [Inter](https://github.com/rsms/inter) | 1,783,172 |
| `arimo` | Arimo, metric-compatible replacement for Arial/Helvetica | Variable roman and italic, 400–700 | [Arimo](https://github.com/googlefonts/Arimo) | 1,039,464 |
| `roboto-condensed` | Roboto Condensed, narrow labels | Variable roman and italic, 100–900 | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/robotocondensed) | 759,740 |
| `jetbrains-mono` | JetBrains Mono, monospaced text | Variable roman and italic, 100–800 | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | 378,764 |
| `ocr-b` | OCR-B, GS1 human-readable text | Regular 400 | [Raisty OCR-B OFL build mirror](https://github.com/Kamisadev/mrz-ai/tree/main/fonts/OCR-B) | 36,780 |

The font binaries total 3,982,920 bytes; included OFL files bring the installed resource total to
4,019,862 bytes. The primary families cover Latin, Greek, and Cyrillic. CJK fonts are intentionally
not bundled because a production-quality pan-CJK family would add tens of megabytes; users can
import an appropriately licensed CJK font in Preferences ▸ Fonts.

Downloaded binary SHA-256 values:

- Arimo italic: `a80fc54fd0233c1dfe298577c4d00f5ae81d5bb83510975e473c47e699b7f4ed`
- Arimo roman: `e43898b143ec826ac8cb4034816458a7047fbe0836558de2a1f8c6223ae3e0ca`
- Inter italic: `acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6`
- Inter roman: `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`
- JetBrains Mono italic: `85ae2a5cd3f56baf1ce1c21a851322c58e3d8fbe8e8ad4a4d090a820dd7fe558`
- JetBrains Mono roman: `48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda`
- OCR-B regular: `367d876cca948ecd4900851f6e85687cbb6e71de9d0d2f36348edec5655526af`
- Roboto Condensed italic: `78f643b1923008b00dfc9b371a2ecd4d80a017722925f1a3fac9940be56d1b7d`
- Roboto Condensed roman: `dace262afcee68a5276f200d8026c57221735c0118ab5fda8c2c0d3dc409a8d0`
