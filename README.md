This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

## Contact form configuration

The contact form uses [Nodemailer](https://nodemailer.com/) to send messages. Configure the following environment variables in your `.env` file:

```bash
MAIL_USER=example@gmail.com
MAIL_PASS=your_app_password
# Optional overrides
MAIL_SERVICE=gmail
MAIL_TO=wearezeta.contacto@gmail.com
```

When using Gmail, `MAIL_PASS` must be an [app password](https://support.google.com/mail/?p=InvalidSecondFactor) generated in your Google account. Regular account passwords will be rejected by Gmail and cause an authentication error.

## Camera scanning configuration

The camera workflow relies on Google Cloud Vision. Provide credentials in **one** of the following formats so it works both locally and on Vercel deployments:

1. `GOOGLE_VISION_CREDENTIALS`: JSON credentials or the same string encoded in base64.
2. `GOOGLE_VISION_CLIENT_EMAIL` and `GOOGLE_VISION_PRIVATE_KEY` (with escaped newlines such as `\n`). Optionally add `GOOGLE_VISION_PROJECT_ID`.
3. `GOOGLE_APPLICATION_CREDENTIALS`: absolute path to the service account JSON file (suitable for local development).

If none of these variables are defined the camera endpoint will return a friendly error instead of crashing, making configuration issues easier to diagnose.
