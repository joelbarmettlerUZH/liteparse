import requests

with open("/Users/clee/Downloads/receipt.png", "rb") as f:
    files = {"file": ("receipt.png", f, "image/png")}
    data = {"language": "en"}
    url = "http://localhost:8828"
    response = requests.post(f"{url}/ocr", files=files, data=data)
    print(response.json())
