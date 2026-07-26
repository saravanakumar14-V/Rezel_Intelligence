use keyring::Entry;
use log::{error, info};

const SERVICE_NAME: &str = "rezel-ai-desktop";
const API_KEY_NAME: &str = "gemini-api-key";

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;
    
    entry.set_password(&key)
        .map_err(|e| format!("Failed to save API key: {}", e))?;
    
    info!("API key saved securely.");
    Ok(())
}

#[tauri::command]
pub fn get_api_key() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;
    
    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) => Err("No API key found.".to_string()),
        Err(e) => {
            error!("Error retrieving API key: {}", e);
            Err(format!("Error retrieving API key: {}", e))
        }
    }
}
