import os
from dotenv import load_dotenv

load_dotenv()


SUPABASE_URL = os.getenv('SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_ANON_KEY')


GROQ_API_KEY = os.getenv('GROQ_API_KEY') or os.environ.get('GROQ_API_KEY')

# Markets to scrape
MARKETS = {
    'Libertad Public Market': 'https://caraga.da.gov.ph/libertad-price-update/',
    'Mayor Salvador Calo Public Market (Butuan City)': 'https://caraga.da.gov.ph/weekly-price-update/'
}

SCHEDULE_TIME = "08:00"
SCHEDULE_ENABLED = True

LOG_FILE = "logs/scraper.log"
LOG_LEVEL = "INFO"

TABLE_NAME = "ingredients"

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY must be set in environment variables")