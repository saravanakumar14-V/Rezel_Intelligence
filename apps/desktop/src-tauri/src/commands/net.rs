use log::{error, info};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// --- Web Search (Tavily) ---

#[derive(Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct WebSearchResponse {
    pub results: Vec<SearchResult>,
}

#[derive(Serialize)]
struct TavilyRequest<'a> {
    api_key: &'a str,
    query: &'a str,
    search_depth: &'a str,
    include_answer: bool,
    max_results: u8,
}

#[derive(Deserialize)]
struct TavilyResponse {
    results: Option<Vec<TavilyResult>>,
    answer: Option<String>,
}

#[derive(Deserialize)]
struct TavilyResult {
    title: String,
    url: String,
    content: String,
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<String, String> {
    info!("[net] web_search: {}", query);

    // Retrieve API key from keyring
    let api_key = keyring::Entry::new("rezel-ai-desktop", "tavily-api-key")
        .map_err(|e| format!("Failed to access keyring: {}", e))?
        .get_password()
        .map_err(|_| "No Tavily API key configured. Please set one in the settings.".to_string())?;

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let req_body = TavilyRequest {
        api_key: &api_key,
        query: &query,
        search_depth: "basic",
        include_answer: false,
        max_results: 5,
    };

    let response = client
        .post("https://api.tavily.com/search")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Network error during search: {}", e))?;

    if !response.status().is_success() {
        if response.status() == 401 || response.status() == 403 {
            return Err("Search failed: Invalid Tavily API key or quota exceeded.".into());
        }
        return Err(format!("Search API returned status {}", response.status()));
    }

    let tavily_data: TavilyResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse search response: {}", e))?;

    let results = tavily_data
        .results
        .unwrap_or_default()
        .into_iter()
        .map(|r| SearchResult {
            title: r.title,
            url: r.url,
            content: r.content,
        })
        .collect();

    let search_response = WebSearchResponse { results };

    serde_json::to_string(&search_response)
        .map_err(|e| format!("Failed to serialize search results: {}", e))
}

// --- Weather (Open-Meteo) ---

#[derive(Deserialize)]
struct GeocodingResponse {
    results: Option<Vec<GeocodingResult>>,
}

#[derive(Deserialize)]
struct GeocodingResult {
    latitude: f64,
    longitude: f64,
    name: String,
    country: Option<String>,
}

#[derive(Deserialize)]
struct WeatherResponse {
    current: Option<CurrentWeather>,
}

#[derive(Deserialize)]
struct CurrentWeather {
    temperature_2m: Option<f64>,
    relative_humidity_2m: Option<f64>,
    wind_speed_10m: Option<f64>,
    weather_code: Option<u32>,
}

#[derive(Serialize)]
pub struct WeatherResult {
    pub location: String,
    pub temperature_celsius: Option<f64>,
    pub humidity_percent: Option<f64>,
    pub wind_speed_kmh: Option<f64>,
    pub conditions_code: Option<u32>,
}

#[tauri::command]
pub async fn get_weather(location: String) -> Result<String, String> {
    info!("[net] get_weather: {}", location);

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // 1. Geocoding
    let geo_url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
        urlencoding::encode(&location)
    );

    let geo_resp = client
        .get(&geo_url)
        .send()
        .await
        .map_err(|e| format!("Geocoding network error: {}", e))?;

    if !geo_resp.status().is_success() {
        return Err(format!(
            "Geocoding API returned status {}",
            geo_resp.status()
        ));
    }

    let geo_data: GeocodingResponse = geo_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse geocoding response: {}", e))?;

    let first_result = geo_data
        .results
        .and_then(|mut r| {
            if r.is_empty() {
                None
            } else {
                Some(r.remove(0))
            }
        })
        .ok_or_else(|| format!("Could not find coordinates for location '{}'", location))?;

    // 2. Weather
    let weather_url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto",
        first_result.latitude, first_result.longitude
    );

    let weather_resp = client
        .get(&weather_url)
        .send()
        .await
        .map_err(|e| format!("Weather network error: {}", e))?;

    if !weather_resp.status().is_success() {
        return Err(format!(
            "Weather API returned status {}",
            weather_resp.status()
        ));
    }

    let weather_data: WeatherResponse = weather_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse weather response: {}", e))?;

    let current = weather_data
        .current
        .ok_or_else(|| "Weather data missing 'current' field".to_string())?;

    let loc_name = if let Some(c) = first_result.country {
        format!("{}, {}", first_result.name, c)
    } else {
        first_result.name
    };

    let result = WeatherResult {
        location: loc_name,
        temperature_celsius: current.temperature_2m,
        humidity_percent: current.relative_humidity_2m,
        wind_speed_kmh: current.wind_speed_10m,
        conditions_code: current.weather_code,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Failed to serialize weather results: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_1_weather_chennai() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let result = get_weather("Chennai".to_string()).await;
            assert!(result.is_ok(), "Weather API failed: {:?}", result.err());
            println!("EVIDENCE 1 (Weather Chennai): {}", result.unwrap());
        });
    }

    #[test]
    fn test_2_weather_empty() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let result = get_weather("".to_string()).await;
            println!("EVIDENCE 2 (Weather Empty Location): {:?}", result);
            assert!(result.is_err());
        });
    }

    #[test]
    fn test_3_web_search_news() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            // This will fail because no API key is configured on this test runner, or we get a 401 if we spoof it.
            let result = web_search("latest AI news".to_string()).await;
            println!("EVIDENCE 3 (Web Search): {:?}", result);
        });
    }

    #[test]
    fn test_4_invalid_tavily_key() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            // First let's set a fake key in the keyring to simulate invalid key
            let entry = keyring::Entry::new("rezel-ai-desktop", "tavily-api-key").unwrap();
            let _ = entry.set_password("tvly-invalid-key-12345");

            let result = web_search("test".to_string()).await;
            println!("EVIDENCE 4 (Invalid Key): {:?}", result);

            // Clean up
            let _ = entry.delete_credential();

            assert!(result.is_err());
            assert!(result.unwrap_err().contains("Invalid Tavily API key"));
        });
    }

    #[test]
    fn test_5_empty_search_query() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let entry = keyring::Entry::new("rezel-ai-desktop", "tavily-api-key").unwrap();
            let _ = entry.set_password("tvly-invalid-key-12345");
            let result = web_search("".to_string()).await;
            println!("EVIDENCE 5 (Empty Query): {:?}", result);
            let _ = entry.delete_credential();
        });
    }
}
