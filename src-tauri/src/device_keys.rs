//! Per-device signing identity (Sync Engine S0; decisions D3 and D4).
//!
//! Every installation gets one Ed25519 key pair. `device_id` is the hex SHA-256 of the
//! public key. The private key is never exported, backed up, or included in Vault
//! Transfer or sync.
//!
//! Keys live behind the `KeyStore` interface and carry a `key_protection` level:
//! - `development`: a plain file, only in debug builds or with the `dev-keystore`
//!   feature. A release build cannot compile it (see the guard below).
//! - `os_backed`: Android Keystore wrap, iOS/macOS Keychain, Windows DPAPI, Linux
//!   Secret Service. Arrives in S2. Until then a release build has **no** device key
//!   and reports that plainly, rather than storing an unprotected one.
//!
//! Nothing signs with these keys yet; production sync (S3) requires `os_backed` keys
//! on both peers.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

// D4: no unprotected private-key storage in a release build.
#[cfg(all(feature = "dev-keystore", not(debug_assertions)))]
compile_error!(
    "The `dev-keystore` feature stores the device private key unprotected and is not allowed in release builds (decision D4)."
);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)] // OsBacked arrives with S2
pub enum KeyProtection {
    Development,
    OsBacked,
    /// No key store in this build (release builds before S2).
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub device_id: String,
    pub public_key_hex: String,
    pub key_protection: KeyProtection,
}

pub trait KeyStore {
    /// Loads this installation's key, creating it on first use.
    fn load_or_create(&self) -> Result<SigningKey, String>;
    fn protection(&self) -> KeyProtection;
}

pub fn device_id_for(public_key: &VerifyingKey) -> String {
    hex::encode(Sha256::digest(public_key.as_bytes()))
}

pub fn identity(store: &dyn KeyStore) -> Result<DeviceIdentity, String> {
    let key = store.load_or_create()?;
    let public = key.verifying_key();
    Ok(DeviceIdentity {
        device_id: device_id_for(&public),
        public_key_hex: hex::encode(public.as_bytes()),
        key_protection: store.protection(),
    })
}

#[allow(dead_code)] // used from S2/S3 (event and receipt signatures)
pub fn sign(store: &dyn KeyStore, message: &[u8]) -> Result<Signature, String> {
    Ok(store.load_or_create()?.sign(message))
}

#[allow(dead_code)] // used from S2/S3
pub fn verify(public_key_hex: &str, message: &[u8], signature: &Signature) -> Result<(), String> {
    let bytes: [u8; 32] = hex::decode(public_key_hex)
        .map_err(|_| "Bad public key")?
        .try_into()
        .map_err(|_| "Bad public key length")?;
    let key = VerifyingKey::from_bytes(&bytes).map_err(|e| e.to_string())?;
    key.verify(message, signature).map_err(|_| "Signature does not verify".to_string())
}

/// Development-only store: the raw private key in a file under the vault's
/// `device_keys` folder, which Vault Transfer never packages.
#[cfg(any(debug_assertions, feature = "dev-keystore"))]
pub struct DevKeyStore {
    path: PathBuf,
}

#[cfg(any(debug_assertions, feature = "dev-keystore"))]
impl DevKeyStore {
    pub fn new(vault_root: &Path) -> Self {
        Self { path: vault_root.join("device_keys").join("dev-device-key.ed25519") }
    }
}

#[cfg(any(debug_assertions, feature = "dev-keystore"))]
impl KeyStore for DevKeyStore {
    fn load_or_create(&self) -> Result<SigningKey, String> {
        if let Ok(bytes) = std::fs::read(&self.path) {
            let secret: [u8; 32] = bytes.try_into().map_err(|_| "Development device key file is corrupt")?;
            return Ok(SigningKey::from_bytes(&secret));
        }
        let key = SigningKey::generate(&mut rand::rngs::OsRng);
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // create_new: never overwrite an existing identity, even in a race.
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.path)
            .map_err(|e| format!("Could not store development device key: {e}"))?;
        file.write_all(&key.to_bytes()).map_err(|e| e.to_string())?;
        Ok(key)
    }

    fn protection(&self) -> KeyProtection {
        KeyProtection::Development
    }
}

/// Release builds until S2: no OS-backed store yet, so no device key at all.
#[allow(dead_code)] // selected only in release builds
pub struct UnavailableKeyStore;

impl KeyStore for UnavailableKeyStore {
    fn load_or_create(&self) -> Result<SigningKey, String> {
        Err("No OS-backed key store is available in this build yet; device signing keys arrive with Sync Engine stage S2.".into())
    }
    fn protection(&self) -> KeyProtection {
        KeyProtection::Unavailable
    }
}

/// The store this build uses.
pub fn store_for(vault_root: &Path) -> Box<dyn KeyStore + Send + Sync> {
    #[cfg(any(debug_assertions, feature = "dev-keystore"))]
    {
        Box::new(DevKeyStore::new(vault_root))
    }
    #[cfg(not(any(debug_assertions, feature = "dev-keystore")))]
    {
        let _ = vault_root;
        Box::new(UnavailableKeyStore)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pops-keys-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn dev_store_creates_one_stable_identity() {
        let vault = temp_vault();
        let first = identity(&DevKeyStore::new(&vault)).unwrap();
        let again = identity(&DevKeyStore::new(&vault)).unwrap();
        assert_eq!(first.device_id, again.device_id);
        assert_eq!(first.public_key_hex, again.public_key_hex);
        assert_eq!(first.key_protection, KeyProtection::Development);
        assert_eq!(first.device_id.len(), 64);
        let other = identity(&DevKeyStore::new(&temp_vault())).unwrap();
        assert_ne!(first.device_id, other.device_id);
    }

    #[test]
    fn signatures_verify_and_reject_tampering() {
        let vault = temp_vault();
        let store = DevKeyStore::new(&vault);
        let id = identity(&store).unwrap();
        let sig = sign(&store, b"event-hash").unwrap();
        assert!(verify(&id.public_key_hex, b"event-hash", &sig).is_ok());
        assert!(verify(&id.public_key_hex, b"event-hash-altered", &sig).is_err());
    }

    #[test]
    fn device_key_folder_is_not_part_of_vault_transfer() {
        assert!(!crate::vault_transfer::INCLUDED_DIRS.contains(&"device_keys"));
    }

    #[test]
    fn release_store_refuses_rather_than_storing_unprotected_keys() {
        assert!(UnavailableKeyStore.load_or_create().is_err());
    }
}
