import schedule
import time
from datetime import datetime
import logging
from scraper import CaragaPriceScraper
from config import SCHEDULE_TIME, LOG_FILE
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)

def get_latest_pdf_url():
    """Scrape the CARAGA website to get the latest PDF URL"""
    try:
        logging.info("Fetching latest PDF from CARAGA website...")
        
        # Setup headless Chrome
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("https://caraga.da.gov.ph/weekly-price-update/")
        time.sleep(3)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Find the first PDF link
        links = soup.find_all('a', href=True)
        
        for link in links:
            href = link['href']
            if 'PriceMonitoring' in href and '.pdf' in href:
                pdf_url = href if href.startswith('http') else f"https://caraga.da.gov.ph{href}"
                driver.quit()
                logging.info(f"Found latest PDF: {pdf_url}")
                return pdf_url
        
        driver.quit()
        logging.warning("No PDF found on website")
        return None
        
    except Exception as e:
        logging.error(f"Error getting latest PDF: {e}")
        return None

def daily_update_job():
    """Job that runs daily to update prices"""
    try:
        logging.info("="*60)
        logging.info("Starting scheduled price update")
        
        print(f"\n{'='*60}")
        print(f"⏰ Scheduled Update - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")
        
        # Get latest PDF URL from website
        print("🔍 Finding latest PDF...")
        pdf_url = get_latest_pdf_url()
        
        if not pdf_url:
            print("⚠️  No PDF found, using default")
            logging.warning("Using default PDF URL")
            from config import DEFAULT_PDF_URL
            pdf_url = DEFAULT_PDF_URL
        
        print(f"📄 Using: {pdf_url}")
        
        # Run scraper
        scraper = CaragaPriceScraper()
        success = scraper.run(pdf_url)
        
        if success:
            logging.info("Scheduled update completed successfully")
            print("✅ Scheduled update completed!")
        else:
            logging.error("Scheduled update failed")
            print("❌ Scheduled update failed")
            
    except Exception as e:
        logging.error(f"Error in scheduled job: {e}")
        print(f"❌ Error: {e}")

def run_scheduler():
    """Start the scheduler"""
    print("="*60)
    print("🤖 CARAGA Price Scraper Scheduler")
    print("="*60)
    print(f"⏰ Scheduled to run daily at {SCHEDULE_TIME}")
    print(f"📋 Logs: {LOG_FILE}")
    print("="*60)
    print("\nPress Ctrl+C to stop\n")
    
    # Schedule the job
    schedule.every().day.at(SCHEDULE_TIME).do(daily_update_job)
    
    # Optional: Run immediately on start
    print("🚀 Running initial update now...\n")
    daily_update_job()
    
    # Keep running
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    try:
        run_scheduler()
    except KeyboardInterrupt:
        print("\n\n👋 Scheduler stopped by user")
        logging.info("Scheduler stopped by user")