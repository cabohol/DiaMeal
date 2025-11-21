import schedule
import time
from datetime import datetime
import logging
from scraper import CaragaPriceScraper
from config import SCHEDULE_TIME, LOG_FILE, MARKETS
import requests
from bs4 import BeautifulSoup
import pytz 


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)


PHILIPPINE_TZ = pytz.timezone('Asia/Manila')

def get_latest_pdf_url(market_url):
    """Get latest PDF URL by parsing dates from BOTH filename and link text"""
    try:
        logging.info(f"Fetching latest PDF from: {market_url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(market_url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all PDF links with dates
        pdf_candidates = []
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True)
            
            # Check if it's a price monitoring PDF
            if 'PriceMonitoring' in href and '.pdf' in href:
               
                if href.startswith('http'):
                    pdf_url = href
                else:
                    pdf_url = f"https://caraga.da.gov.ph{href}"
                
                pdf_date = None
                
                # METHOD 1: Try to extract date from FILENAME
                import re
                filename_date_match = re.search(r'(\w+)-(\d{2})-(\d{4})', href)
                
                if filename_date_match:
                    try:
                        month_name = filename_date_match.group(1)
                        day = int(filename_date_match.group(2))
                        year = int(filename_date_match.group(3))
                        
                        from datetime import datetime
                        month = datetime.strptime(month_name, '%B').month
                        pdf_date = datetime(year, month, day)
                        
                        logging.info(f"✓ Found date in filename: {pdf_date.strftime('%B %d, %Y')} - {pdf_url}")
                    except:
                        pass
                
                # METHOD 2: If no date in filename, try to extract from LINK TEXT 
                if not pdf_date and link_text:
                   
                    text_date_match = re.search(r'(\w+)\s+(\d{1,2})\s+(\d{4})', link_text)
                    
                    if text_date_match:
                        try:
                            month_name = text_date_match.group(1)
                            day = int(text_date_match.group(2))
                            year = int(text_date_match.group(3))
                            
                            from datetime import datetime
                            month = datetime.strptime(month_name, '%B').month
                            pdf_date = datetime(year, month, day)
                            
                            logging.info(f"✓ Found date in link text: {pdf_date.strftime('%B %d, %Y')} - {link_text}")
                        except Exception as e:
                            logging.warning(f"Could not parse date from link text: {link_text} - {e}")
                
                # Only add if we found a valid date
                if pdf_date:
                    pdf_candidates.append({
                        'url': pdf_url,
                        'date': pdf_date,
                        'source': 'filename' if filename_date_match else 'link_text'
                    })
        
        if not pdf_candidates:
            logging.warning(f"No dated PDFs found on {market_url}")
            return None
        
        # Sort by date (NEWEST first)
        pdf_candidates.sort(key=lambda x: x['date'], reverse=True)
        latest_pdf = pdf_candidates[0]
        
        logging.info(f"✓ Selected LATEST PDF: {latest_pdf['date'].strftime('%B %d, %Y')} (from {latest_pdf['source']})")
        logging.info(f"  URL: {latest_pdf['url']}")
        
        # Log all found PDFs 
        logging.info(f"✓ All PDFs found ({len(pdf_candidates)}):")
        for idx, pdf in enumerate(pdf_candidates[:5], 1):  # Show top 5
            logging.info(f"  {idx}. {pdf['date'].strftime('%B %d, %Y')} - {pdf['url']}")
        
        return latest_pdf['url']
        
    except Exception as e:
        logging.error(f"Error fetching PDF from {market_url}: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return None
    
def daily_update_job():
    """Job that runs daily to update prices from ALL markets"""
    try:
        # Get current Philippine time
        ph_time = datetime.now(PHILIPPINE_TZ)
        
        logging.info("="*60)
        logging.info(f"Starting scheduled price update for ALL markets (PH Time: {ph_time.strftime('%Y-%m-%d %H:%M:%S')})")
        
        print(f"\n{'='*60}")
        print(f" Scheduled Update - {ph_time.strftime('%Y-%m-%d %H:%M:%S')} (Philippine Time)")
        print(f"{'='*60}")
        
        total_processed = 0
        scraper = CaragaPriceScraper()
        
        for market_name, market_url in MARKETS.items():
            print(f"\n Processing: {market_name}")
            print(f"  URL: {market_url}")
            
            pdf_url = get_latest_pdf_url(market_url)
            
            if not pdf_url:
                print(f"   No PDF found for {market_name}, skipping...")
                logging.warning(f"No PDF found for {market_name}")
                continue
            
            print(f"   Found PDF: {pdf_url}")
            
            success = scraper.run(pdf_url)
            
            if success:
                print(f"   {market_name} completed!")
                total_processed += 1
            else:
                print(f"   {market_name} failed")
                logging.error(f"Failed to process {market_name}")
        
        print(f"\n{'='*60}")
        print(f" Summary: Processed {total_processed}/{len(MARKETS)} markets")
        print(f"{'='*60}\n")
        
        if total_processed > 0:
            logging.info(f"Scheduled update completed - {total_processed} markets processed")
            print(" Daily update completed!")
        else:
            logging.error("Scheduled update failed - no markets processed")
            print(" Daily update failed")
            
    except Exception as e:
        logging.error(f"Error in scheduled job: {e}")
        print(f" Error: {e}")

def get_next_run_time_ph():
    """Calculate next run time in Philippine timezone"""
    now_ph = datetime.now(PHILIPPINE_TZ)
    
    # Parse SCHEDULE_TIME (e.g., "08:00")
    hour, minute = map(int, SCHEDULE_TIME.split(':'))
    
    # Create next run time in Philippine timezone
    next_run = now_ph.replace(hour=hour, minute=minute, second=0, microsecond=0)
    
    
    if next_run <= now_ph:
        from datetime import timedelta
        next_run = next_run + timedelta(days=1)
    
    return next_run

def run_scheduler():
    """Start the scheduler with Philippine timezone awareness"""
    ph_time = datetime.now(PHILIPPINE_TZ)
    
    print("="*60)
    print("🇵🇭 CARAGA Multi-Market Price Scraper")
    print("="*60)
    print(f" Current Philippine Time: {ph_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f" Scheduled to run daily at {SCHEDULE_TIME} (Philippine Time)")
    print(f" Logs: {LOG_FILE}")
    print(f" Markets:")
    for market_name in MARKETS.keys():
        print(f"  - {market_name}")
    print("="*60)
    print("\nPress Ctrl+C to stop\n")
    
    # Calculate UTC time for scheduling based on Philippine time
    # Philippine Time is UTC+8
    hour_ph, minute_ph = map(int, SCHEDULE_TIME.split(':'))
    
    # Convert to UTC (subtract 8 hours)
    hour_utc = (hour_ph - 8) % 24
    utc_schedule_time = f"{hour_utc:02d}:{minute_ph:02d}"
    
    print(f" Server will run at {utc_schedule_time} UTC (which is {SCHEDULE_TIME} Philippine Time)\n")
    logging.info(f"Scheduler configured: {utc_schedule_time} UTC = {SCHEDULE_TIME} Philippine Time")
    
    # Schedule using UTC time (Railway servers use UTC)
    schedule.every().day.at(utc_schedule_time).do(daily_update_job)
    
    
    print(" Running initial update now...\n")
    daily_update_job()
    
    next_run = get_next_run_time_ph()
    print(f"\n Waiting for next scheduled run at {next_run.strftime('%Y-%m-%d %H:%M:%S')} (Philippine Time)...")
    

    while True:
        schedule.run_pending()
        
    
        now_ph = datetime.now(PHILIPPINE_TZ)
        next_run = get_next_run_time_ph()
        time_until = next_run - now_ph
        hours_until = time_until.total_seconds() / 3600
        
        if int(time.time()) % 3600 == 0: 
            logging.info(f"Status: {hours_until:.1f} hours until next run ({next_run.strftime('%H:%M:%S')} PH Time)")
        
        time.sleep(60)

if __name__ == "__main__":
    try:
        run_scheduler()
    except KeyboardInterrupt:
        print("\n\n Scheduler stopped by user")
        logging.info("Scheduler stopped by user")