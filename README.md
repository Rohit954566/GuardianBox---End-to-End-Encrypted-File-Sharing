# GuardianBox — Zero-Knowledge End-to-End Encrypted File Sharing

> **Persevex Cybersecurity Engineering Internship Project**  
> **Author:** Rohit (Security Software Engineer Intern)  
> **Domain:** Applied Cryptography & Secure Distributed Systems  
> **Core Primitives:** Web Crypto API, AES-256-GCM, PBKDF2, RFC 3986 URI Fragments, AWS S3 / Object Storage  

---

## 1. Project Overview & The "Blind Server" Problem

Traditional cloud storage platforms (Google Drive, Dropbox, Box) employ **server-side encryption (SSE)**. While data is encrypted at rest on disk, the storage provider holds the master decryption keys in their Key Management Service (KMS). This architecture grants providers, system administrators, and subpoenaed law enforcement authorities unrestricted ability to inspect, scan, or index files in plaintext.

For investigative journalists, legal counsels, medical practitioners, and whistleblowers, this trust model is fundamentally flawed.

**GuardianBox** resolves this vulnerability through **Zero-Knowledge End-to-End Encryption (E2EE)**:
1. **Client-Side Cryptography**: Files are encrypted in the sender's browser via the native **Web Crypto API** before any network transmission occurs.
2. **The "Blind Server" Principle**: The backend server, database, and storage bucket receive only unreadable binary ciphertext blobs and initialization vectors.
3. **Decryption Key Isolation**: The 256-bit symmetric decryption key is transported strictly inside the **URL Hash Fragment** (`#key=...`). Under **RFC 3986**, the fragment identifier is processed purely by client user-agents and is **never transmitted in HTTP requests** over the network.
4. **Zero Knowledge Guaranteed**: Even in the event of an adversary acquiring root access to the database and S3 buckets, zero plaintext files or keys can be exfiltrated.

---

## 2. Technical Architecture & Cryptographic Pipeline

```
[ Sender Browser ]
       │
       ├─ 1. Select Plaintext File (e.g. document.pdf)
       ├─ 2. Web Crypto API: Generate 256-bit AES-GCM Key (CSPRNG)
       ├─ 3. Web Crypto API: Generate 96-bit Random IV (12 Bytes)
       ├─ 4. Encrypt File Bytes + AEAD 128-bit Authentication Tag
       ├─ 5. Encrypt Metadata (Original Filename & MIME Type)
       │
       ▼ (Sends ONLY Ciphertext + IV + Encrypted Metadata)
┌────────────────────────────────────────────────────────┐
│              GuardianBox Express Backend               │
│                                                        │
│  - Receives unreadable binary ciphertext blob          │
│  - Never sees or receives the 256-bit AES key          │
│  - Stores blob in AWS S3 / MinIO / Local Vault         │
│  - Stores metadata record (IV, Expiration, Limit)      │
└────────────────────────────────────────────────────────┘
       ▲
       │ (Streams Ciphertext Blob + IV to Recipient)
       │
[ Recipient Browser ]
       │
       ├─ 1. Reads Key from URL Hash Fragment: /file/:id#key=<256-bit-key>
       │    (Hash fragment stays 100% on the client, never sent to server)
       ├─ 2. Fetches Encrypted Ciphertext + IV from API
       ├─ 3. Web Crypto API: Decrypts & Verifies 128-bit AEAD Tag
       ├─ 4. Reconstructs Original File in Memory (Blob)
       └─ 5. Triggers Local Browser Download
```

---

## 3. Cryptographic Implementation Details

All cryptographic operations reside in the frontend utility module:  
[`client/src/utils/cryptoUtils.js`](client/src/utils/cryptoUtils.js)

### 3.1. Native Web Crypto API
Rather than importing heavy or vulnerable third-party JavaScript crypto libraries, GuardianBox leverages `window.crypto.subtle` (and `globalThis.crypto.subtle` in Node.js 19+). This guarantees:
- **Constant-time execution** resistant to side-channel and timing attacks.
- **Hardware acceleration** via CPU AES-NI instruction sets.
- Protection against prototype pollution and memory extraction vulnerabilities common in pure JS crypto packages.

### 3.2. AES-GCM (Galois/Counter Mode)
- **Key Length:** 256 bits (32 bytes), providing $2^{256}$ keyspace entropy.
- **Initialization Vector (IV):** 96 bits (12 bytes) generated dynamically per operation via `crypto.getRandomValues(new Uint8Array(12))`.
- **AEAD Tag:** 128 bits (16 bytes) automatically appended to the ciphertext. Ensures **confidentiality** and **authenticity**; any in-transit tampering or bit-flipping immediately triggers an `OperationError` and aborts decryption.

### 3.3. Key Derivation (Passphrase Mode)
When users choose a custom passphrase instead of an auto-generated random key:
- **Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2)
- **Hash Function:** HMAC-SHA-256
- **Iteration Count:** 100,000 rounds (NIST recommendation to thwart GPU/ASIC brute forcing)
- **Salt:** 128 bits (16 bytes) of cryptographically secure pseudorandom entropy

### 3.4. The URL Hash Trick (RFC 3986 Compliance)
```
https://guardianbox.com/#/file/gb_77b31fc9#key=sK_8A0nF92md9X...
                                         └──────────┬──────────┘
                                          Never leaves browser!
```
Under **RFC 3986 (Uniform Resource Identifier Specification)**, Section 3.5:
> *"The fragment identifier component of a URI allows indirect identification of a secondary resource... fragment identifiers are evaluated client-side and are not sent in HTTP request messages."*

Because the key is placed strictly after the `#` fragment symbol:
1. Neither the web server, reverse proxy (NGINX/Cloudflare), nor ISP logs ever receive the decryption key.
2. The server hosts only encrypted noise.

---

## 4. Ephemeral Storage & Expiration (Phase 4)

To prevent orphaned or forgotten files from persisting indefinitely, GuardianBox incorporates a dual-mode lifecycle engine:

### 4.1. Time-Based Expiration
- Users configure link lifetimes: **1 Hour, 6 Hours, 24 Hours, 3 Days, or 7 Days**.
- An automated cron job ([`server/services/cleanupCron.js`](server/services/cleanupCron.js)) executes periodically (`node-cron`).
- Executes the equivalent of:
  ```sql
  DELETE FROM files WHERE expires_at < NOW();
  ```
- The physical encrypted object is permanently deleted from AWS S3 / disk storage, and the metadata record is scrubbed.

### 4.2. View-Based Expiration ("Burn After Reading")
- When the **"Burn After Reading"** toggle is enabled, `maxDownloads` is set to `1`.
- The download endpoint ([`server/routes/fileRoutes.js`](server/routes/fileRoutes.js)) tracks `downloadCount`.
- As soon as the recipient completes downloading the encrypted stream, the server triggers an immediate post-stream hook:
  ```javascript
  res.on('finish', async () => {
    await storage.deleteObject(file.storageKey);
    db.markDeleted(file.id);
  });
  ```
- Subsequent attempts to load the file return HTTP 410 (Gone), rendering the link dead.

---

## 5. Security Audit & Threat Modeling

A rigorous security engineering audit analyzing core threat vectors and architectural defenses:

### Attack Vector 1: What if the user loses the link?
* **Risk Assessment:** Permanent Data Loss.
* **Vector Mechanics:** Because the server operates under zero-knowledge and never receives or records the `#key` fragment, there is no master key, recovery password, or administrative override.
* **Mitigation / Defense:** This is an intentional security design guarantee. Data recovery is mathematically impossible ($2^{256}$ keyspace). The sender must re-upload the original plaintext file. Abandoned encrypted blobs are safely collected and deleted by the automated ephemeral cron job once their expiration timestamp elapses.

### Attack Vector 2: URL Hash Leakage via HTTP Referrer Headers
* **Risk Assessment:** High Privacy Threat.
* **Vector Mechanics:** If the client application links to external third-party stylesheets, images, or analytical scripts, the browser may send the current URL (including the `#key` fragment in older browsers or misconfigurations) in the HTTP `Referer` header.
* **Mitigation / Defense:** 
  1. GuardianBox includes `<meta name="referrer" content="no-referrer" />` inside `client/index.html`.
  2. The server sets `Referrer-Policy: no-referrer` on all HTTP responses.
  3. The application is completely free of third-party analytics, tracking pixels, or external ad scripts.

### Attack Vector 3: Cloud Storage (AWS S3) or Database Breach
* **Risk Assessment:** Critical Hostile Environment Scenario.
* **Vector Mechanics:** An attacker gains unauthorized IAM credentials to the AWS S3 bucket and exports all stored files, as well as the metadata database.
* **Mitigation / Defense:**
  - The S3 bucket contains **only** AES-GCM ciphertext blobs.
  - The database contains **only** random file IDs, IVs, expiration timestamps, and encrypted metadata strings.
  - Plaintext encryption keys and user passwords **do not exist anywhere in the database or server filesystem**.
  - Without the client-side keys, cracking 256-bit AES-GCM requires more energy than exists in the observable universe. The adversary exfiltrates zero actionable information.

### Attack Vector 4: Ciphertext Tampering & Bit-Flipping Attacks
* **Risk Assessment:** Data Integrity & Oracle Vulnerability.
* **Vector Mechanics:** An attacker or malicious proxy attempts to flip bits inside the ciphertext stream to alter recipient content or provoke predictable error states.
* **Mitigation / Defense:**
  - GuardianBox uses AES in Galois/Counter Mode (AES-GCM), an **Authenticated Encryption with Associated Data (AEAD)** standard.
  - Every ciphertext is bound to a 128-bit authentication tag calculated using GHASH over the Galois Field $GF(2^{128})$.
  - During `crypto.subtle.decrypt()`, the Web Crypto API evaluates the tag before outputting any decrypted bytes. If even a single bit in the ciphertext or IV has been modified, decryption immediately halts and throws an unrecoverable `OperationError`.

### Attack Vector 5: Malicious Server / Host Compromise
* **Risk Assessment:** Host Trust Model.
* **Vector Mechanics:** If an attacker compromises the web server hosting the client HTML/JS, they could modify `cryptoUtils.js` to exfiltrate keys as they are generated.
* **Mitigation / Defense:**
  - Browser-based E2EE operates under the prerequisite that served JavaScript code is authentic.
  - In enterprise production environments, GuardianBox enforces strict **Content Security Policy (CSP)** headers, **Subresource Integrity (SRI)** checksums, and can be compiled as an immutable static Progressive Web App (PWA) or desktop app (Electron/Tauri) with cryptographic binary signing.

---

## 6. Proof of Zero-Knowledge: S3 Storage Walkthrough

To verify that the server has zero access to the plaintext file, GuardianBox includes a dedicated **Server Storage Inspector** tab in the UI, as well as manual CLI verification commands:

### Step 1: Upload a Confidential File
Upload a test file (e.g. `secret_internship_report.pdf` containing the text `"CONFIDENTIAL PERSEVEX DATA"`).

### Step 2: Inspect the Raw Stored Ciphertext
Open the **Server Inspector** tab in GuardianBox or run a `cURL` request against the inspection endpoint:

```bash
curl -s http://localhost:5000/api/files/<FILE_ID>/inspect | json_pp
```

**Actual Output from Backend Storage:**
```json
{
  "fileId": "gb_d7e48b11c9",
  "storageKey": "gb_d7e48b11c9.enc",
  "storageProvider": "AWS S3 / Local Encrypted Disk Storage",
  "totalCiphertextSize": 1048592,
  "initializationVector": "8v4T9xQ2nK1L7mP0",
  "encryptedMetadataString": "g5Xj2w...",
  "proofStatement": "The data below represents the EXACT bytes stored in S3/Disk storage. Plaintext is 100% inaccessible to server, ISP, and database admins without the recipient's client-side hash key.",
  "hexDumpSample": [
    {
      "offset": "0x0000",
      "hex": "7a 4f 9e 1c 33 b8 d2 f0 a1 99 e4 52 8c 71 b0 6e",
      "ascii": "zO..3......R.q.n"
    },
    {
      "offset": "0x0010",
      "hex": "b5 12 c8 f4 09 3d 7a ea 61 de 8f 47 1b 90 e3 2c",
      "ascii": ".....=z.a..G...,"
    }
  ],
  "entropyStatus": "High Entropy (Cryptographically Uniform AES-GCM Ciphertext)"
}
```

### Analysis of the Stored Blob:
1. **No Magic Bytes:** Standard PDF headers (`%PDF-1.7`) or PNG magic bytes are completely eliminated.
2. **High Entropy:** The byte distribution shows uniform pseudorandom entropy.
3. **Encrypted Filename:** The database record shows only encrypted base64 strings for metadata. The server administrator does not even know the file is a PDF.

---

## 7. Unit Tests & Cryptographic Verification

A comprehensive unit test suite in [`tests/crypto.test.js`](tests/crypto.test.js) verifies all cryptographic operations using the Node.js native test runner.

### Run Tests:
```bash
npm test
```

### Test Suite Coverage:
```
✔ 1. Key Generation creates valid 256-bit AES-GCM CryptoKey
✔ 2. Roundtrip: encrypt(data, key) followed by decrypt(ciphertext, key) returns original text
✔ 3. Roundtrip: binary data (simulating file bytes) encrypts and decrypts losslessly
✔ 4. Security: Decrypting with an incorrect key MUST throw an authentication failure
✔ 5. Security: Tampering with ciphertext triggers AEAD authentication tag failure
✔ 6. Cryptographic Rigor: Repeated encryptions use distinct IVs and produce different ciphertexts
✔ 7. Passphrase Key Derivation (PBKDF2) derives deterministic key from password + salt
✔ 8. URL Hash Serialization: Key exports to URL-safe Base64 and reconstructs perfectly
✔ 9. Metadata Encryption: Filename and MIME type are completely hidden from server

9 tests passed (0 failures)
```

---

## 8. Installation & Setup Guide

### Prerequisites
- **Node.js**: v18.x or v20+ (v22+ tested)
- **npm**: v9+

### Quick Start (Local Development)

1. **Clone the repository:**
   ```bash
   git clone <repo-url> guardianbox
   cd guardianbox
   ```

2. **Install all dependencies:**
   ```bash
   npm install
   npm --prefix server install
   npm --prefix client install
   ```

3. **Configure Environment:**
   A default `.env` is already configured for local encrypted disk storage:
   ```bash
   # Optional: customize ports or settings in .env
   PORT=5000
   CLIENT_URL=http://localhost:5173
   STORAGE_PROVIDER=local
   CLEANUP_CRON=*/5 * * * *
   ```

4. **Run the Full Stack Application:**
   ```bash
   npm run dev
   ```
   - **Frontend UI:** `http://localhost:5173`
   - **Backend API:** `http://localhost:5000`

---

## 9. AWS S3 / MinIO Configuration (Production Mode)

To connect GuardianBox to an AWS S3 bucket or self-hosted MinIO instance:

1. Update `.env`:
   ```ini
   STORAGE_PROVIDER=s3
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=your-production-e2ee-bucket
   AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
   AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   
   # Optional: For MinIO / LocalStack
   # S3_ENDPOINT=http://localhost:9000
   # S3_FORCE_PATH_STYLE=true
   ```

2. GuardianBox will automatically initialize `@aws-sdk/client-s3` and route all encrypted binary blobs to your cloud bucket.

---

## 10. Repository Structure

```
guardianbox/
├── client/                      # React + Vite Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx       # Header, navigation & health telemetry
│   │   │   ├── UploadVault.jsx  # Drag-and-drop encryption engine & UI
│   │   │   ├── ShareModal.jsx   # RFC 3986 link modal with QR code generator
│   │   │   ├── DownloadVault.jsx# Key extraction & client-side decryptor
│   │   │   ├── ServerInspector.jsx # Proof of Zero-Knowledge hex viewer
│   │   │   └── SecurityAuditView.jsx # Threat vector & defense dashboard
│   │   ├── utils/
│   │   │   └── cryptoUtils.js   # Web Crypto API AES-GCM & PBKDF2 logic
│   │   ├── App.jsx              # Main tab router & state coordinator
│   │   ├── main.jsx             # React entrypoint
│   │   └── index.css            # Dark cybersecurity design system
│   ├── index.html               # Strict no-referrer policy header
│   ├── vite.config.js           # Proxy configuration
│   └── package.json
│
├── server/                      # Express.js Zero-Knowledge Backend
│   ├── config/
│   │   └── config.js            # Environment & AWS S3 configuration
│   ├── database/
│   │   └── db.js                # Persistent Zero-Knowledge metadata store
│   ├── routes/
│   │   └── fileRoutes.js        # Upload, Meta, Stream & Audit endpoints
│   ├── services/
│   │   ├── storageService.js    # S3 / MinIO / Local storage provider
│   │   └── cleanupCron.js       # Ephemeral lifecycle automated purge cron
│   ├── data/                    # Storage and metadata directory
│   ├── index.js                 # Express server & cron initializer
│   └── package.json
│
├── tests/
│   └── crypto.test.js           # 9 Unit tests validating encryption & security
│
├── .env.example                 # Production configuration template
├── .gitignore                   # Standard security gitignore
├── package.json                 # Root script orchestrator
└── README.md                    # Engineering documentation & security audit
```

---

## 11. Conclusion & Key Takeaways

GuardianBox demonstrates that robust privacy does not require sacrificing usability. By combining the **native browser Web Crypto API**, **AES-256-GCM authenticated encryption**, **RFC 3986 client-side URI hash fragments**, and **automated ephemeral storage lifecycles**, we achieve mathematical zero-knowledge transfer where the cloud host is permanently blind to sensitive user data.
