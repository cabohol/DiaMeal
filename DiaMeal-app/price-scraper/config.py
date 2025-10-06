import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY')

# CARAGA Website
CARAGA_BASE_URL = "https://caraga.da.gov.ph/weekly-price-update/"

# Default PDF URL (fallback)
DEFAULT_PDF_URL = "https://caraga.da.gov.ph/wp-content/uploads/PriceMonitoring/FY2025/ButuanCity/September-25-2025.pdf"

# Scheduler Settings
SCHEDULE_TIME = "08:00"  # 8:00 AM daily
SCHEDULE_ENABLED = True

# Logging
LOG_FILE = "logs/scraper.log"
LOG_LEVEL = "INFO"

# Database table
TABLE_NAME = "ingredients"

# Validation
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file")