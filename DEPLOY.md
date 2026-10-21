# Deploying SecureCollab (free, about 15 minutes)

Everything runs on the Cloudflare Workers free plan: one Worker serves the app and the encrypted sync server. After this one-time setup, every change merged into `main` goes live automatically.

## 1. Create a Cloudflare API token

1. Sign in at <https://dash.cloudflare.com>.
2. Click your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token**.
3. Find the **Edit Cloudflare Workers** template and click **Use template**.
4. Under **Account Resources**, choose your account. Under **Zone Resources**, choose **All zones** (or leave the default).
5. Click **Continue to summary** → **Create Token**.
6. Copy the token now. Cloudflare shows it only once.

## 2. Find your Account ID

On the Cloudflare dashboard home, open **Workers & Pages**. Your **Account ID** is shown in the right-hand panel. Copy it.

## 3. Add both to GitHub

1. Open <https://github.com/zanderjames86/securecollab> → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**:
   - Name `CLOUDFLARE_API_TOKEN`, value: the token from step 1.
3. Click **New repository secret** again:
   - Name `CLOUDFLARE_ACCOUNT_ID`, value: the ID from step 2.

## 4. Deploy

1. In the repository, open **Actions** → **Deploy** → **Run workflow** → **Run workflow**.
2. Wait about two minutes for a green tick.
3. Open the **deploy** job, expand **Deploy to Cloudflare**, and find the line with your address, for example `https://securecollab.<your-subdomain>.workers.dev`.

The first time, Cloudflare may ask you to choose a free `workers.dev` subdomain in **Workers & Pages**; do that, then run the workflow again.

## 5. Check it

1. Open the address on your phone and create your account. **Store the recovery code on paper.**
2. Create a team, then an invite link, and send it to one teammate on WhatsApp.
3. Optional: in Chrome's menu choose **Add to Home screen** so it opens like an app.

## Updating

Each change arrives as a pull request with a description. Merging it into `main` deploys it automatically. If anything goes wrong, open **Actions** → **Deploy**, choose an earlier successful run, and click **Re-run all jobs** to roll back.

## Custom domain (optional)

If you buy a domain (about $10/year), add it in Cloudflare and attach it under **Workers & Pages** → **securecollab** → **Settings** → **Domains & Routes**.
