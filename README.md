# 🔍 GroundView

> **AI-Powered Mobile Test Automation Helper**  
> Smart locator generation, offline analysis, and Gemini AI integration for Appium testing

[![Version](https://img.shields.io/badge/version-0.0.5-blue.svg)](https://github.com/UnitHan/GroundView)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/UnitHan/GroundView)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-18.0%2B-green.svg)](https://nodejs.org/)

---

## 📖 Overview

**GroundView** is a desktop application that helps mobile test automation engineers generate reliable Appium locators with AI assistance. Unlike traditional tools, GroundView offers:

- 🤖 **AI-Powered Locator Suggestions** - Gemini AI analyzes UI context to recommend optimal locators
- 💾 **Offline Analysis** - Save captures as ZIP files and analyze them anywhere without device connection
- 🎯 **Smart Scoring** - Evaluate locator stability and maintainability
- 📝 **Ready-to-Use Code** - Generate Python/Java test code with WebDriverWait patterns
- 🔄 **Dual View** - Tree and List views with synchronized highlighting

---

## ✨ Key Features

### 🎨 UI Capture & Analysis
- **Screenshot + XML Hierarchy** capture from Android devices (iOS coming soon)
- **Interactive overlay** with clickable element highlighting
- **Tree/List dual view** for easy navigation
- **Automatic fallback** between compressed/uncompressed XML dumps

### 🤖 AI Integration
- **Gemini Vision API** for context-aware locator generation
- **OCR capabilities** to extract text/tables from screenshots
- **Smart code generation** with actionability checks and best practices

### 📊 Locator Intelligence
- **Scoring system** evaluating stability, uniqueness, and maintainability
- **Multiple strategies**: AccessibilityID, ResourceID, Text, XPath, UiSelector
- **Appium 2.x optimized** with modern syntax (AppiumBy, WebDriverWait)

### 💼 Workflow Enhancement
- **Export/Import ZIP** - Share captures with team members
- **Offline mode** - Analyze captures without device connection
- **Quick snippets** - Copy-paste ready code for both Appium 1.x and 2.x

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10.11+** ([Download](https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe))
  - ⚠️ Check "Add Python to PATH" during installation
- **Node.js 18.0+** (for development only)
- **ADB** (for Android device connection)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/UnitHan/GroundView.git
cd GroundView

# 2. Install dependencies
npm install
pip install -r requirements.txt

# 3. (Optional) Bundle ADB
collect_deps.bat

# 4. Run development server
npm run dev
```

### Usage

1. **Select ADB** path (auto-detected if in PATH)
2. **Connect device** via USB (enable USB debugging)
3. **Capture** screenshot + UI hierarchy
4. **Click elements** to view/generate locators
5. **Copy code** and use in your test scripts
6. **Save as ZIP** for offline analysis

---

## 🛠️ Build & Package

```bash
# Build frontend
npm run build

# Create installer (MSI/DMG/AppImage)
npm run dist
```

**Note:** The installer uses the system Python installation. On first run, it automatically installs required packages (fastapi, cryptography, etc.).

---

## 📸 Screenshots

*Coming soon - Add your demo screenshots here*

---

## 🆚 GroundView vs Appium Inspector

| Feature | GroundView | Appium Inspector |
|---------|-----------|------------------|
| **Offline Analysis** | ✅ ZIP export/import | ❌ |
| **AI Locator Suggestions** | ✅ Gemini integration | ❌ |
| **AI OCR** | ✅ Text/table extraction | ❌ |
| **Locator Scoring** | ✅ Stability metrics | 🟡 Basic |
| **Ready Code Generation** | ✅ Python/Java + WebDriverWait | 🟡 Copy only |
| **Appium 2.x Optimized** | ✅ Modern syntax | 🟡 Legacy-focused |
| **Real-time Interaction** | ❌ | ✅ Click/tap testing |
| **iOS Support** | 🟡 In progress | ✅ Full support |
| **Cloud Integration** | ❌ | ✅ BrowserStack, etc. |

**Use GroundView for:** Test script authoring, locator research, offline analysis  
**Use Appium Inspector for:** Real-time debugging, iOS testing, cloud devices

---

## 🏗️ Architecture

```
GroundView/
├── app/              # Electron main process
├── desktop/          # React frontend (Vite)
├── backend/          # FastAPI Python backend
├── core/             # Shared TypeScript logic
├── android/          # ADB service wrapper
└── ios/              # WDA service wrapper (stub)
```

**Tech Stack:**
- **Frontend**: React 18, TypeScript, Vite
- **Desktop**: Electron 28
- **Backend**: Python 3.10, FastAPI, Uvicorn
- **AI**: Google Gemini API
- **Testing**: Vitest, ESLint

---

## 🎯 Roadmap

- [ ] iOS/WDA full support
- [ ] PaddleOCR UI integration
- [ ] Enhanced locator filtering
- [ ] Test recording/playback
- [ ] CLI mode
- [ ] Multi-language support

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Appium](https://appium.io/) - Mobile automation framework
- [Google Gemini](https://ai.google.dev/) - AI-powered analysis
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - OCR engine
- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps

---

## 📧 Contact

**Author:** UnitHan  
**GitHub:** [@UnitHan](https://github.com/UnitHan)  
**Issues:** [Report bugs](https://github.com/UnitHan/GroundView/issues)

---

<div align="center">
  <sub>Built with ❤️ for QA Engineers</sub>
</div>
