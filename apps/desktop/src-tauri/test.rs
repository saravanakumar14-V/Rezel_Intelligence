use keyring::Entry;

fn main() {
    let service = "rezel-ai-desktop";
    let user = "gemini-api-key";
    match Entry::new(service, user) {
        Ok(entry) => {
            match entry.set_password("test_key") {
                Ok(_) => println!("Success!"),
                Err(e) => println!("Set Error: {}", e),
            }
        },
        Err(e) => println!("New Error: {}", e),
    }
}
