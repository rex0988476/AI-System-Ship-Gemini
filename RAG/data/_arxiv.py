import requests
import os

# PDF URL
pdf_url = "https://arxiv.org/pdf/2508.06407.pdf"

# Folder to save
download_dir = "downloads"
os.makedirs(download_dir, exist_ok=True)

# File path
file_path = os.path.join(download_dir, "2508.06407.pdf")

# Download PDF
response = requests.get(pdf_url)
if response.status_code == 200:
    with open(file_path, "wb") as f:
        f.write(response.content)
    print(f"PDF saved as {file_path}")
else:
    print("Failed to download PDF:", response.status_code)
