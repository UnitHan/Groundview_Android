"""
Settings manager with encrypted API key storage.
- Stores API keys with PBKDF2-HMAC-SHA256 hashing and random salt
- Keys are encrypted using Fernet (symmetric encryption)
"""

import json
import secrets
import hashlib
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class SettingsManager:
    """Manage encrypted settings storage."""
    
    def __init__(self, settings_dir: str = "user-data"):
        self.settings_dir = Path(settings_dir)
        self.settings_file = self.settings_dir / "settings.json"
        self.settings_dir.mkdir(parents=True, exist_ok=True)
    
    def _derive_key(self, salt: bytes) -> bytes:
        """Derive encryption key from a fixed secret and salt."""
        # In production, use a proper secret management system
        # For now, use a machine-specific secret
        secret = b"groundview-settings-encryption-key-v1"
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
                return json.load(f)
        except Exception:
            return {}
    
    def save_settings(self, settings: dict) -> None:
        """Save settings to JSON file."""
        with open(self.settings_file, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    
    def get_gemini_api_key(self) -> Optional[str]:
        """Get decrypted Gemini API key."""
        settings = self.load_settings()
        encrypted_key = settings.get("geminiApiKeyEncrypted")
        if not encrypted_key:
            # Fallback to plain text key for backwards compatibility
            print("[SettingsManager] No encrypted key found, checking plain text...")
            return settings.get("geminiApiKey")
        
        try:
            print(f"[SettingsManager] Decrypting API key...")
            decrypted = self._decrypt_value(encrypted_key)
            print(f"[SettingsManager] Decryption successful. Key length: {len(decrypted)}")
            return decrypted
        except Exception as e:
            print(f"[SettingsManager] Decryption failed: {e}")
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
