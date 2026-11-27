# Portfolio performance

## Kept: prebuilt Tailwind CSS

- Before: 407,279 bytes of Tailwind browser-compiler JavaScript from the CDN.
- After: 43,297 bytes of local, generated CSS. No Tailwind compilation runs in the visitor's browser.
- Scope: roughly 89% fewer decoded bytes for this dependency, not a measured reduction in overall page-load time.
- Inter fonts and Lucide icons still require internet access.
- Core Web Vitals and real-phone load times were not measured.

Verification: 17 representative computed-style snapshots at widths 375, 768, and 1440 match the baseline. Calculation tests, browser interactions, and single-/multi-page A4 PDF generation pass.

## Rejected: minified CSS

The minifier rounded some shadow colors from RGB to HSL. Although small, this changed the computed styles. Unminified prebuilt CSS preserves the original colors and is still much smaller than the removed runtime compiler.

## Kept: idempotent invalidation while editing

Once a result is already pending, further input events skip repeated invalid-field scans, status replacement, preview clearing, and print/export-button updates. A new calculation or validation error resets this state as before.

- Controlled browser test: 81 invoice rows, 2,000 dispatched input events, five runs.
- Before: 310.2 / 311.8 / 308.6 / 308.7 / 315.7 ms; median 310.2 ms.
- After: 92.7 / 91.8 / 100.2 / 91.9 / 94.8 ms; median 92.7 ms.
- Status DOM rewrites for 100 input events: 100 â†’ 1.
- This measures a synthetic edit loop, not overall page speed or real-user INP.
- Browser regression tests verify one invalidation, blocked stale output, and successful recalculation.

## Rebuild after adding or changing utility classes

Run from PowerShell:

```powershell
npx --yes --package=tailwindcss@3.4.17 tailwindcss -c 'D:\film\portfolio.tailwind.config.cjs' -i 'D:\film\portfolio.input.css' -o 'D:\film\portfolio.generated.css'
```

Always keep `index.html` and `portfolio.generated.css` in the same directory when sharing or serving the portfolio. The config and input CSS are build sources, not runtime dependencies.

Checks:

```powershell
node --test 'D:\film\accounting-tools.test.cjs' 'D:\film\about-flip.test.cjs' 'D:\film\portfolio-performance.test.cjs'
node 'D:\film\accounting-browser-check.cjs'
```
