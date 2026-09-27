# JFT Socials — Enterprise SMM & Virtual Number Platform

JFT Socials is a high-performance Social Media Marketing (SMM) and Virtual Number automation platform built with React, Vite, Tailwind CSS, Express, and automated provider orchestration.

## 🔐 Security & Production Requirements

### 1. Mandatory `ENCRYPTION_KEY`
Provider API keys (Peakerr, Engainsmedia, 5sim) are encrypted at rest using **AES-256-GCM** before being persisted in the database.

> ⚠️ **CRITICAL FOR PRODUCTION**: 
> You **MUST** set the `ENCRYPTION_KEY` environment variable before running in production. The key must be at least 32 characters (or a 64-character hex string).
> If `ENCRYPTION_KEY` is not set or is shorter than 32 characters, the application will fail fast at startup with a fatal configuration error.

Generate a secure 256-bit encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Then configure it in your `.env` file or hosting environment:
```env
ENCRYPTION_KEY="your-64-character-hex-encryption-key-here"
```

### 2. Environment Variables (.env)
Refer to `.env.example` for all configurable variables:
- `ENCRYPTION_KEY`: **Required** (minimum 32 characters) for AES-256-GCM database encryption.
- `PEAKERR_API_KEY`: Upstream Peakerr provider API key (can also be configured via Admin Settings).
- `PEAKERR_API_URL`: Peakerr endpoint (defaults to `https://peakerr.com/api/v2`).
- `EAGAINSMEDIA_API_KEY`: Upstream Engainsmedia provider API key (can also be configured via Admin Settings).
- `EAGAINSMEDIA_API_URL`: Engainsmedia endpoint (defaults to `https://engainsmedia.com/api/v2`).
- `FIVESIM_API_KEY`: Upstream 5sim.net token for virtual number SMS activation.
- `PAYSTACK_SECRET_KEY` & `PAYSTACK_PUBLIC_KEY`: For NGN deposits.
- `SESSION_SECRET`: Secret for user session tokens.

---

## 🚀 Running the Platform

- **Development**:
  ```bash
  npm run dev
  ```
- **Production Build**:
  ```bash
  npm run build
  npm start
  ```

## 🛠️ Provider Integration Details
- **Engainsmedia API**: Upstream base URL is `https://engainsmedia.com/api/v2` using standard SMM Panel v2 POST format (`key`, `action`).
- **Peakerr API**: Upstream base URL is `https://peakerr.com/api/v2`.
- Both provider base URLs can be updated in real-time by administrators via the Admin Settings interface, which immediately applies the change to the active in-memory client instances and persists to the database.
