# Predictor1

Predictor1 is a Hebrew RTL football score-prediction league application. The
public course deployment is Demo-only: it does not collect money, process
payments, or represent a financial balance.

## Requirements

- Node.js 20.9 or newer
- Docker Desktop for local Supabase tests
- Supabase CLI for migrations and pgTAP tests

## Local setup

```bash
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Fill only the local, non-secret Supabase values required by the current slice.
Never commit `.env.local` or real credentials.

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
npm run test:e2e
```

The one-off Sports POC uses the manual fixture adapter and does not call a live
provider:

```bash
npm run poc:sports
```

The current Slice 0 deployment is not yet connected to a hosted Supabase project
or Vercel Production URL.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deployment

Production URL: https://predictor-swart.vercel.app