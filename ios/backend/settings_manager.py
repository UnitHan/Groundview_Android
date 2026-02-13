"""
Settings manager with encrypted API key storage.
- Stores API keys with PBKDF2-HMAC-SHA256 hashing and random salt
- Keys are encrypted using Fernet (symmetric encryption)
- Cross-platform: Windows, macOS, Linux
"""

import json
import os
import time
import secrets
import hashlib
import platform
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _get_default_settings_dir() -> str:
    """Get default settings directory based on environment."""
    # Priority 1: Environment variable
    env_dir = os.environ.get("GROUNDVIEW_SETTINGS_DIR")
    if env_dir:
        return env_dir
    
    # Priority 2: Check if running from source (development)
    if os.path.exists("backend/server.py") or os.path.exists("../backend/server.py"):
        return "user-data"
    
    # Priority 3: Production path (AppData on Windows, ~/.config on Linux/Mac)
    if platform.system() == "Windows":
        appdata = os.environ.get("APPDATA")
        if appdata:
            return os.path.join(appdata, "GroundView")
    elif platform.system() == "Darwin":  # macOS
        home = Path.home()
        return str(home / "Library" / "Application Support" / "GroundView")
    else:  # Linux
        home = Path.home()
        return str(home / ".config" / "groundview")
    
    # Fallback
    return "user-data"


class SettingsManager:
    """Manage encrypted settings storage."""
    
    def __init__(self, settings_dir: Optional[str] = None):
        if settings_dir is None:
            settings_dir = _get_default_settings_dir()
        self.settings_dir = Path(settings_dir)
        self.settings_file = self.settings_dir / "settings.json"
        self.lock_file = self.settings_dir / "settings.lock"
        self.settings_dir.mkdir(parents=True, exist_ok=True)
        print(f"[SettingsManager] Using settings dir: {self.settings_dir.resolve()}")

    def _acquire_lock(self, timeout_sec: float = 2.0, delay_sec: float = 0.05) -> Optional[int]:
        """Acquire a cross-process lock using an exclusive lock file."""
        start = time.time()
        while True:
            try:
                fd = os.open(self.lock_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode("utf-8"))
                return fd
            except FileExistsError:
                try:
                    stat = self.lock_file.stat()
                    # Clear stale lock (older than 10s)
                    if time.time() - stat.st_mtime > 10:
                        self.lock_file.unlink(missing_ok=True)
                        continue
                except Exception:
                    pass
                if time.time() - start > timeout_sec:
                    return None
                time.sleep(delay_sec)
            except Exception:
                return None

    def _release_lock(self, fd: Optional[int]) -> None:
        try:
            if fd is not None:
                os.close(fd)
        except Exception:
            pass
        try:
            self.lock_file.unlink(missing_ok=True)
        except Exception:
            pass

    def _parse_settings(self, raw: str) -> tuple[dict, bool]:
        """Parse JSON safely; return (settings, repaired)."""
        try:
            data = json.loads(raw)
            return (data if isinstance(data, dict) else {}, False)
        except Exception:
            pass
        try:
            decoder = json.JSONDecoder()
            obj, idx = decoder.raw_decode(raw)
            if isinstance(obj, dict):
                trailing = raw[idx:].strip()
                return obj, bool(trailing)
        except Exception:
            pass
        return {}, False
    
    def _derive_key(self, salt: bytes) -> bytes:
        """Derive encryption key from a fixed secret and salt."""
        # Use a consistent secret that persists across reboots
        # In production, this should be stored securely or derived from machine ID
        import platform
        
        # Create a stable machine identifier
        machine_id = f"{platform.node()}-{platform.machine()}-{platform.system()}"
        secret = f"groundview-settings-encryption-key-v1-{machine_id}".encode('utf-8')
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return kdf.derive(secret)
    
    def _encrypt_value(self, value: str) -> dict:
        """Encrypt a value and return salt + encrypted data."""
        salt = secrets.token_bytes(16)
        key = self._derive_key(salt)
        f = Fernet(Fernet.generate_key())
        # Use the derived key as the encryption key base
        key_hash = hashlib.sha256(key).digest()
        f = Fernet(Fernet.generate_key())
        
        # Simple encryption approach: use Fernet with base64-encoded key
        from base64 import urlsafe_b64encode
        fernet_key = urlsafe_b64encode(key_hash[:32])
        f = Fernet(fernet_key)
        
        encrypted = f.encrypt(value.encode())
        
        return {
            "salt": salt.hex(),
            "encrypted": encrypted.decode()
        }
    
    def _decrypt_value(self, encrypted_data: dict) -> str:
        """Decrypt a value using salt and encrypted data."""
        salt = bytes.fromhex(encrypted_data["salt"])
        key = self._derive_key(salt)
        
        from base64 import urlsafe_b64encode
        key_hash = hashlib.sha256(key).digest()
        fernet_key = urlsafe_b64encode(key_hash[:32])
        f = Fernet(fernet_key)
        
        decrypted = f.decrypt(encrypted_data["encrypted"].encode())
        return decrypted.decode()
    
    def load_settings(self) -> dict:
        """Load settings from JSON file."""
        if not self.settings_file.exists():
            return {}
        try:
            with open(self.settings_file, "r", encoding="utf-8") as f:
                raw = f.read()
            data, repaired = self._parse_settings(raw)
            if repaired and data:
                try:
                    self.save_settings(data)
                except Exception:
                    pass
            return data
        except Exception:
            return {}
    
    def save_settings(self, settings: dict) -> None:
        """Save settings to JSON file."""
        self.settings_dir.mkdir(parents=True, exist_ok=True)
        lock_fd = self._acquire_lock()
        try:
            tmp_name = f".settings.{os.getpid()}.{secrets.token_hex(4)}.tmp"
            tmp_path = self.settings_dir / tmp_name
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.settings_file)
        finally:
            self._release_lock(lock_fd)
    
    def get_gemini_api_key(self) -> Optional[str]:
        """Get decrypted Gemini API key."""
        settings = self.load_settings()
        encrypted_key = settings.get("geminiApiKeyEncrypted")
        if not encrypted_key:
            # Fallback to plain text key for backwards compatibility
            print("[SettingsManager] No encrypted key found, checking plain text...")
            plain_key = settings.get("geminiApiKey")
            if plain_key:
                print(f"[SettingsManager] Found plain text key, length: {len(plain_key)}")
            return plain_key
        
        try:
            print(f"[SettingsManager] Attempting to decrypt API key...")
            print(f"[SettingsManager] Settings file: {self.settings_file}")
            print(f"[SettingsManager] Encrypted data exists: {bool(encrypted_key)}")
            decrypted = self._decrypt_value(encrypted_key)
            print(f"[SettingsManager] Decryption successful. Key length: {len(decrypted)}")
            return decrypted
        except Exception as e:
            print(f"[SettingsManager] Decryption failed: {type(e).__name__}: {e}")
            print(f"[SettingsManager] Salt: {encrypted_key.get('salt', 'N/A')[:16]}...")
            return None
    
    def set_gemini_api_key(self, api_key: str) -> None:
        """Set Gemini API key with encryption."""
        settings = self.load_settings()
        encrypted = self._encrypt_value(api_key)
        settings["geminiApiKeyEncrypted"] = encrypted
        # Remove plain text key if it exists
        settings.pop("geminiApiKey", None)
        self.save_settings(settings)
        print(f"[SettingsManager] API key saved. Settings file: {self.settings_file}")
        print(f"[SettingsManager] Encrypted key length: {len(encrypted.get('encrypted', ''))}")
    
    def get_gemini_model(self) -> Optional[str]:
        """Get Gemini model name."""
        settings = self.load_settings()
        return settings.get("geminiModel")
    
    def set_gemini_model(self, model: str) -> None:
        """Set Gemini model name."""
        settings = self.load_settings()
        settings["geminiModel"] = model
        self.save_settings(settings)


# Global instance
_settings_manager = SettingsManager()


def get_settings_manager() -> SettingsManager:
    """Get the global settings manager instance."""
    return _settings_manager
