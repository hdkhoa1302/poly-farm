#!/usr/bin/env python3
"""Gửi tin nhắn có nút mở Poly Farm Mini App qua Telegram Bot API."""
import urllib.request, json

BOT_TOKEN = "YOUR_BOT_TOKEN"   # Thay bằng token từ BotFather
CHAT_ID = "YOUR_CHAT_ID"       # Thay bằng chat_id (user/group)

url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
payload = {
    "chat_id": CHAT_ID,
    "text": "🌾 Poly Farm — Game nông trại 2D Low-Poly\nNhấn nút bên dưới để chơi ngay!",
    "reply_markup": {
        "inline_keyboard": [[
            {"text": "▶ Chơi Poly Farm", "web_app": {"url": "https://hdkhoa1302.github.io/poly-farm/poly-farm/"}}
        ]]
    }
}
data = json.dumps(payload).encode()
req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as res:
    print(res.read().decode())
EOF