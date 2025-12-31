# Hosting the Demo

This repo can export a static demo build for GitHub Pages or any CDN/static host.
The export only includes the demo page (all other routes are excluded in demo mode).

## Local demo export

```bash
DEMO_EXPORT=true BASE_PATH=/dev-health-web npm run build
```

The static site will be in `out/`. If you're hosting at the root of a domain,
omit `BASE_PATH`.

## GitHub Pages (demo)

1) Ensure the Pages source is set to "GitHub Actions" in the repo settings.
2) Push to `main` or run the "Deploy Demo to Pages" workflow manually.
3) The workflow sets `DEMO_EXPORT=true` and publishes `out/`.

## CDN hosting recommendations

Use any static host/CDN that serves the `out/` directory:

- Cloudflare Pages: fast global CDN, simple build config, easy custom domains.
- Netlify: good for preview deploys and branch builds.
- AWS S3 + CloudFront: best for fine-grained caching and enterprise setups.

Suggested cache headers:

- HTML: `cache-control: max-age=0, must-revalidate`
- Static assets (JS/CSS/fonts): `cache-control: public, max-age=31536000, immutable`

## Generic setup guide (any CDN)

1) Build the export:
   `DEMO_EXPORT=true BASE_PATH=/your/subpath npm run build`
2) Upload the contents of `out/` to your static host.
3) Configure the host to serve `index.html` for the root path.
4) If hosting under a subpath, set `BASE_PATH` to that subpath during the build.
