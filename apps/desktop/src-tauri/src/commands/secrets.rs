use keyring::Entry;
use log::{error, info};

const SERVICE_NAME: &str = "rezel-ai-desktop";
const API_KEY_NAME: &str = "gemini-api-key";

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("API key cannot be empty.".to_string());
    }

    let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;

    entry
        .set_password(&key)
        .map_err(|e| format!("Failed to save API key: {}", e))?;

    info!("[commands::secrets] API key saved securely.");

    Ok(())
}

#[tauri::command]
pub fn get_api_key() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_NAME).map_err(|e| {
        error!("[commands::secrets] Failed to access keyring: {}", e);
        format!("Failed to access keyring: {}", e)
    })?;

    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) => Err("No API key found.".to_string()),
        Err(e) => {
            error!(
                "[commands::secrets] get_api_key: Error retrieving API key: {}",
                e
            );
            Err(format!("Error retrieving API key: {}", e))
        }
    }
}

#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;

    match entry.delete_credential() {
        Ok(_) => {
            info!("[commands::secrets] API key deleted.");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            info!("[commands::secrets] API key already deleted.");
            Ok(())
        }
        Err(e) => Err(format!("Failed to delete API key: {}", e)),
    }
}

// --- Tavily Search API Key ---

const SEARCH_API_KEY_NAME: &str = "tavily-api-key";

#[tauri::command]
pub fn save_search_key(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("API key cannot be empty.".into());
    }

    let entry = Entry::new(SERVICE_NAME, SEARCH_API_KEY_NAME)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .set_password(&key)
        .map_err(|e| format!("Failed to save Search API key: {}", e))?;

    info!("[commands::secrets] Search API key saved securely.");
    Ok(())
}

#[tauri::command]
pub fn get_search_key() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, SEARCH_API_KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;

    match entry.get_password() {
        Ok(password) => {
            info!("[commands::secrets] get_search_key: key found securely.");
            Ok(password)
        }
        Err(keyring::Error::NoEntry) => {
            info!("[commands::secrets] get_search_key: No entry found.");
            Err("No Search API key found.".into())
        }
        Err(e) => Err(format!("Failed to retrieve Search API key: {}", e)),
    }
}

#[tauri::command]
pub fn delete_search_key() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, SEARCH_API_KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;

    match entry.delete_credential() {
        Ok(_) => {
            info!("[commands::secrets] Search API key deleted.");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            info!("[commands::secrets] Search API key already deleted.");
            Ok(())
        }
        Err(e) => Err(format!("Failed to delete Search API key: {}", e)),
    }
}
