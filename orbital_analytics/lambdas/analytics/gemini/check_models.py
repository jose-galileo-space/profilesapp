# lambdas/analytics/gemini/check_models.py
import google.generativeai as genai
import os

# Paste your key here temporarily or ensure the ENV var is set
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY') or "PASTE_YOUR_AIZA_KEY_HERE"

genai.configure(api_key=GOOGLE_API_KEY)

print("Available Models:")
for m in genai.list_models():
  if 'generateContent' in m.supported_generation_methods:
    print(f"- {m.name}")