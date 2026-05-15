# 🛰️ OmniGate v3.0

**The Ultimate Media Automation Bridge.**  
OmniGate is a powerful, full-stack automation tool designed to bridge the gap between *illegal* streaming sites and your personal media library (PLEX/Sonarr/Radarr). It automates the process of finding, sniffling, downloading, and cataloging series and movies with a single click.

---

## 🚀 Features

### 🖥️ Modern Web Dashboard (v3.0)
- **Responsive UI:** Fully optimized for Desktop, Tablet, and Mobile devices.
- **Smart Search:** Direct integration with Sonarr and Radarr APIs to lookup media.
- **Auto-Library Management:** Automatically adds new media to your *Arr library if it's missing before scraping.
- **Visual Library:** Browse your entire existing collection with high-quality posters pulled directly from your server.
- **Real-time Console:** A terminal-style live log viewer that streams background process output via Socket.io.
- **Queue Management:** View, clear, and manage pending downloads before triggering the ingest engine.


### ⚙️ Core Automation
- **Playwright Bridge:** High-performance headless browser sniffling to extract high-quality stream links.
- **N_m3u8DL-RE Engine:** Multi-threaded, industrial-strength download engine for maximum speed and reliability.
- **Hybrid Support:** Use the modern Web UI or the original PowerShell CLI script—they share the same state and configuration.
- **Automatic Library Scan:** Automatically triggers Sonarr/Radarr to move and rename files immediately after download completion.
- Currently supports only Vidcore.net provider
---

## 🛠️ Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [N_m3u8DL-RE.exe](https://github.com/nilaoda/N_m3u8DL-RE) (Must be in the root directory)
- [Sonarr/Radarr](https://servarr.com/) instances running and accessible.

### 2. Setup
Clone the repository and install dependencies for both the backend and frontend:

```powershell
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 3. Configuration
Edit the `config.example.json` in the root directory with your API keys and paths then rename it to `config.json`:

```json
{
    "Sonarr": {
        "ApiKey": "YOUR_SONARR_API_KEY",
        "BaseUrl": "http://localhost:8989/api/v3",
        "RootPath": "F:\\PLEX\\Shows",
        "QualityProfileId": 1
    },
    "Radarr": {
        "ApiKey": "YOUR_RADARR_API_KEY",
        "BaseUrl": "http://localhost:7878/api/v3",
        "RootPath": "F:\\PLEX\\Movies",
        "QualityProfileId": 1
    },
    "General": {
        "DownloadTempPath": "F:\\PLEX\\DL"
    }
}
```

### 4. Network & Firewall (Optional - for Mobile access)
To access the dashboard from your phone, run this in an **Admin PowerShell** window:

```powershell
New-NetFirewallRule -DisplayName "OmniGate Dashboard" -Direction Inbound -LocalPort 5173,3001 -Protocol TCP -Action Allow
```

---

## 🚦 Usage

### Start the Dashboard
Run the following command in the root directory:

```powershell
npm run dev
```

- **Website:** `http://localhost:5173` (or `http://YOUR_PC_IP:5173` on mobile)
- **API:** `http://localhost:3001`

### How to Download
1. **Search:** Go to the "Search" tab, find a show, and hit **Scrape**.
2. **Review:** Check the "Queue" tab to see the parsed links.
3. **Download:** Hit **Ingest Queue**.
4. **Monitor:** Switch to the "Downloads" or "Console" tab to watch real-time progress.
5. **Enjoy:** Once finished, the files will automatically appear in your PLEX library!

---

## 📂 Project Structure

```text
OmniGate/
├── client/             # React + Vite Frontend
│   ├── src/            # Dashboard Components & Logic
│   └── tailwind.config.js
├── server/             # Node.js + Express Backend
│   ├── index.js        # Server & Socket.io Setup
│   └── routes.js       # API Endpoints & Automation Logic
├── config.example.json # Rename to config.json
├── omni-bridge.js      # Playwright Scraper Logic
├── OmniGate_CLI.ps1    # Legacy PowerShell Interface
└── yt-dlpcommands.txt  # Persistent Download Queue
```

---

## 🛡️ License
Private Automation Tool. Distributed for personal use.  
*OmniGate is a tool for automation; users are responsible for complying with the terms of service of any third-party websites accessed.*
